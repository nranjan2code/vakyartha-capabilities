// Reads from the open model catalog through the governed `web__fetch_page` tool, as rows.
// The catalog publishes one 6.8 MB price document and a smaller model document; an app call
// returns at most 250 KiB, so each document is read as a table, a page at a time, and every
// row is checked before anything is stored. Nothing here talks to the database.

export const SOURCE = 'https://models.dev';
export const PRICES_URL = `${SOURCE}/api.json`;
export const MODELS_URL = `${SOURCE}/models.json`;
/** Below the host's 250 KiB reply bound, with room for the reply's URL line. */
export const PAGE_BYTES = 240_000;
/** A command may make 16 tool calls; the reads before the price pages use some of them. */
export const MAX_CALLS = 16;

export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export interface Receipt { what: string; url: string; pages: number; rows: number; total: number; ms: number; status: string }

export interface Read<T> { rows: T[]; dropped: number; receipt: Receipt }

/** Each page the tool returns: `URL: <url>`, a blank line, then the page as JSON. */
export function page(result: unknown): { keys: number; columns: string[]; total: number; from: number; rows: unknown[][]; next?: string } {
  if (result && typeof result === 'object' && (result as { isError?: unknown }).isError) throw new Error(String((result as { text?: unknown }).text ?? 'The source read failed'));
  const text = typeof result === 'string' ? result : String((result as { text?: unknown })?.text ?? '');
  const at = text.indexOf('\n\n');
  if (!text.startsWith('URL: ') || at < 0) throw new Error(text.trim().slice(0, 300) || 'The source returned nothing');
  let body: unknown;
  try { body = JSON.parse(text.slice(at + 2)); } catch { throw new Error('The source page is not the table that was asked for'); }
  const p = body as Record<string, unknown>;
  if (!Array.isArray(p.rows) || !Array.isArray(p.columns) || typeof p.total !== 'number' || typeof p.from !== 'number' || typeof p.keys !== 'number') throw new Error('The source page is not the table that was asked for');
  return { keys: p.keys, columns: p.columns as string[], total: p.total, from: p.from, rows: p.rows as unknown[][], ...(typeof p.next === 'string' ? { next: p.next } : {}) };
}

/**
 * Every row of one table, page by page. `budget` is how many calls this read may make; a
 * document that needs more is a failed read, never a partial one.
 */
export async function readAll<T>(call: Call, what: string, url: string, each: string, columns: string[], check: (row: unknown[]) => T | undefined, budget: number): Promise<Read<T>> {
  const started = Date.now();
  const rows: T[] = [];
  let after: string | undefined, pages = 0, total = 0, received = 0, dropped = 0;
  do {
    if (pages >= budget) throw new Error(`${what}: the source needs more than ${budget} reads in one refresh`);
    const p = page(await call('web__fetch_page', { url, rows: { each, columns, limit: PAGE_BYTES, ...(after ? { after } : {}) } }));
    if (p.from !== received) throw new Error(`${what}: page ${pages + 1} starts at row ${p.from}, expected ${received}`);
    pages++;
    total = p.total;
    received += p.rows.length;
    for (const row of p.rows) {
      const ok = Array.isArray(row) && row.length === p.keys + columns.length ? check(row) : undefined;
      if (ok === undefined) dropped++; else rows.push(ok);
    }
    after = p.next;
  } while (after);
  if (received !== total) throw new Error(`${what}: received ${received} of ${total} rows`);
  return { rows, dropped, receipt: { what, url, pages, rows: rows.length, total, ms: Date.now() - started, status: dropped ? `Read, ${dropped} malformed rows left out` : 'Read' } };
}

// Value checks: the source is outside data, so every value is the type it should be or null.
const str = (v: unknown, max = 300) => (typeof v === 'string' && v.length <= max ? v : null);
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v) ? v : null);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
/** A price per million tokens, or a count: finite and not negative. */
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const list = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length <= 60) ? (v as string[]).join(',') : null);
const id = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : undefined);
/** A present value of the wrong type marks the whole row malformed. */
const bad = (raw: unknown[], cleaned: unknown[]) => raw.some((v, i) => v !== null && cleaned[i] === null);

export interface Provider { id: string; name: string | null; doc: string | null; api: string | null }
export const PROVIDER_COLUMNS = ['/name', '/doc', '/api'];
export function provider(r: unknown[]): Provider | undefined {
  const key = id(r[0]);
  if (!key) return undefined;
  const values = [str(r[1], 120), str(r[2], 500), str(r[3], 500)];
  if (bad(r.slice(1), values)) return undefined;
  return { id: key, name: values[0] as string | null, doc: values[1] as string | null, api: values[2] as string | null };
}

/** One provider's offer of one model, in the order the database stores it. */
export const LISTING_COLUMNS = [
  '/name', '/family', '/canonical_model_id', '/status', '/release_date', '/last_updated', '/knowledge',
  '/open_weights', '/reasoning', '/tool_call', '/attachment', '/structured_output',
  '/limit/context', '/limit/input', '/limit/output',
  '/cost/input', '/cost/output', '/cost/cache_read', '/cost/cache_write', '/cost/reasoning',
  '/cost/tiers', '/cost/context_over_200k',
  '/modalities/input', '/modalities/output', '/type',
] as const;
export type ListingRow = [provider: string, model: string, ...values: (string | number | boolean | null)[]];
const LISTING_CHECKS: ((v: unknown) => unknown)[] = [
  (v) => str(v, 200), (v) => str(v, 120), (v) => str(v, 200), (v) => (v === 'alpha' || v === 'beta' || v === 'deprecated' ? v : null), day, day, day,
  bool, bool, bool, bool, bool,
  num, num, num,
  num, num, num, num, num,
  (v) => (Array.isArray(v) ? v : null), (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null),
  list, list, (v) => str(v, 40),
];
const TIERED = LISTING_COLUMNS.indexOf('/cost/tiers');

export interface Tier { size: number; input: number | null; output: number | null; cache_read: number | null; cache_write: number | null; reasoning: number | null }
const RATES = ['input', 'output', 'cache_read', 'cache_write', 'reasoning'] as const;
function rates(raw: Record<string, unknown>): Omit<Tier, 'size'> | undefined {
  const out = {} as Omit<Tier, 'size'>;
  for (const k of RATES) {
    const v = raw[k];
    if (v !== undefined && v !== null && num(v) === null) return undefined;
    out[k] = v === undefined ? null : num(v);
  }
  return out;
}
/**
 * One list of context price tiers, smallest first. The catalog states them twice: a list of
 * thresholds and an older card for contexts over 200,000 tokens that repeats the first of them;
 * the list wins, as in the original. A tier without a threshold is left out; a price that is not
 * a price makes the listing malformed.
 */
export function tiers(list: unknown, over200k: unknown): string | null | undefined {
  const out: Tier[] = [];
  if (Array.isArray(list)) {
    if (list.length > 20) return undefined;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') return undefined;
      const tier = (raw as { tier?: { type?: unknown; size?: unknown } }).tier;
      const size = num(tier?.size);
      if (tier?.type !== undefined && tier.type !== 'context') continue;
      if (!size) continue;
      const r = rates(raw as Record<string, unknown>);
      if (!r) return undefined;
      out.push({ size, ...r });
    }
  }
  if (!out.length && over200k && typeof over200k === 'object') {
    const r = rates(over200k as Record<string, unknown>);
    if (!r) return undefined;
    out.push({ size: 200_000, ...r });
  }
  return out.length ? JSON.stringify(out.sort((a, b) => a.size - b.size)) : null;
}

export function listing(r: unknown[]): ListingRow | undefined {
  const p = id(r[0]), m = id(r[1]);
  if (!p || !m) return undefined;
  const values = r.slice(2).map((v, i) => LISTING_CHECKS[i]!(v)) as unknown[];
  if (bad(r.slice(2), values)) return undefined;
  const tiered = tiers(values[TIERED], values[TIERED + 1]);
  if (tiered === undefined) return undefined;
  // The two tier forms become one column, in the database's order.
  values.splice(TIERED, 2, tiered);
  return [p, m, ...(values as (string | number | boolean | null)[])];
}

export interface Model { id: string; name: string | null; family: string | null; license: string | null; openWeights: boolean | null; knowledge: string | null; releaseDate: string | null; lastUpdated: string | null; context: number | null; output: number | null; repo: string | null }
export const MODEL_COLUMNS = ['/name', '/family', '/license', '/open_weights', '/knowledge', '/release_date', '/last_updated', '/limit/context', '/limit/output', '/weights'];

export const WEIGHTS_HOST = 'https://huggingface.co';
/** A repository name as the weights host writes it: an organisation and a model, each plain. */
const REPO = /^([A-Za-z0-9][A-Za-z0-9._-]{0,95})\/([A-Za-z0-9][A-Za-z0-9._-]{0,95})$/;
/** The first weights link the catalog gives on the weights host, as "organisation/model". */
export function repoOf(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  for (const link of links) {
    const url = (link as { url?: unknown } | null)?.url;
    if (typeof url !== 'string' || !url.startsWith(`${WEIGHTS_HOST}/`)) continue;
    const path = url.slice(WEIGHTS_HOST.length + 1).split(/[?#]/)[0]!.split('/').slice(0, 2).join('/');
    if (REPO.test(path)) return path;
  }
  return null;
}
export function model(r: unknown[]): Model | undefined {
  const key = id(r[0]);
  if (!key || !key.includes('/')) return undefined;
  const values = [str(r[1], 200), str(r[2], 120), str(r[3], 120), bool(r[4]), day(r[5]), day(r[6]), day(r[7]), num(r[8]), num(r[9])];
  if (bad(r.slice(1, 10), values)) return undefined;
  const [name, family, license, openWeights, knowledge, releaseDate, lastUpdated, context, output] = values as [string | null, string | null, string | null, boolean | null, string | null, string | null, string | null, number | null, number | null];
  return { id: key, name, family, license, openWeights, knowledge, releaseDate, lastUpdated, context, output, repo: repoOf(r[10]) };
}

export interface Benchmark { model: string; position: number; name: string; score: number; metric: string | null; source: string | null; date: string | null }
export const BENCHMARK_COLUMNS = ['/name', '/score', '/metric', '/source', '/date'];
export function benchmark(r: unknown[]): Benchmark | undefined {
  const m = id(r[0]), position = Number(r[1]), name = str(r[2], 120);
  const score = typeof r[3] === 'number' && Number.isFinite(r[3]) ? r[3] : null;
  if (!m || !Number.isInteger(position) || !name || score === null) return undefined;
  const metric = str(r[4], 120), source = str(r[5], 500), date = day(r[6]);
  if (bad(r.slice(4), [metric, source, date])) return undefined;
  return { model: m, position, name, score, metric, source, date };
}

/** An organisation on the weights host, as the catalog names it, plain enough to put in an address. */
export const ORG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
/** One read lists every model an organisation publishes, with only the three facts kept. */
export function weightsUrl(org: string): string {
  if (!ORG.test(org)) throw new Error(`${org} is not an organisation name the weights host uses`);
  return `${WEIGHTS_HOST}/api/models?author=${encodeURIComponent(org)}&limit=1000&expand%5B%5D=gated&expand%5B%5D=safetensors&expand%5B%5D=cardData`;
}
export const WEIGHT_COLUMNS = ['/id', '/gated', '/safetensors/total', '/cardData/license'];

/** What the weights host says about one repository. */
export interface Weights { repo: string; gated: 'open' | 'gated' | null; parameters: number | null; license: string | null }
export function weights(r: unknown[]): Weights | undefined {
  const repo = typeof r[1] === 'string' && REPO.test(r[1]) ? r[1] : undefined;
  if (!repo) return undefined;
  // The host writes false, "auto" or "manual"; a license may be one id or a list of them.
  const gated = r[2] === false ? 'open' : r[2] === 'auto' || r[2] === 'manual' || r[2] === true ? 'gated' : r[2] === null || r[2] === undefined ? null : undefined;
  const parameters = r[3] === null || r[3] === undefined ? null : num(r[3]);
  const license = r[4] === null || r[4] === undefined ? null : Array.isArray(r[4]) ? (r[4].every((x) => typeof x === 'string' && x.length <= 120) ? r[4].join(', ') : undefined) : str(r[4], 120);
  if (gated === undefined || (r[3] !== null && r[3] !== undefined && parameters === null) || license === undefined || (r[4] !== null && r[4] !== undefined && license === null)) return undefined;
  return { repo, gated, parameters, license };
}
