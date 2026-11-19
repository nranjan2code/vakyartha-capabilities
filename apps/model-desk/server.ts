// Model Desk: the AI model market as a local data pipeline. A refresh reads the open model
// catalog as tables through the governed `web__fetch_page` tool (source.ts), matches every
// provider listing to its underlying model (identity.ts), and hands the candidate to the
// database (store.ts), which checks it and applies it in one transaction or keeps the last good
// snapshot and says why. DuckDB owns all catalog data; `context.state` holds only view choices.
// Every view is derived from one bounded database read (views.ts). No model requests are made.

import { createHash } from 'node:crypto';
import { identity } from './identity.ts';
import { collapse, dayBefore, launches, LAUNCH_DAYS, lede, moves, priceIndex, spoken, sunsets, WEEK_DAYS } from './brief.ts';
import { provenance } from './provenance.ts';
import {
  benchmark, BENCHMARK_COLUMNS, listing, LISTING_COLUMNS, MAX_CALLS, model, MODEL_COLUMNS, MODELS_URL, PRICES_URL, provider, PROVIDER_COLUMNS, readAll, WEIGHT_COLUMNS, weights, weightsUrl,
  type Call, type Read, type Receipt,
} from './source.ts';
import { abilities, board as boardEntries, boards, catalog, detail, history, model as about, offers, openModels, spans, workload, WORKLOADS } from './market.ts';
import { apply, dueOrganisations, failed, modelEvents, saveWeights, snapshot, weightsFailed, type Database } from './store.ts';
import { MAX_COMPARED, normalize, NOTHING, TITLES, TYPES, view, VOLUMES, type Compared, type Loaded, type State } from './views.ts';

export { view, TITLES };

export interface Context {
  state: State;
  surfaces?: Record<string, unknown>;
  database: Database;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** Everything the views read, in bounded queries, priced for the chosen request: the pipeline
 * snapshot, the model list, the opened model and the compared ones. */
export async function load(db: Database, state: State): Promise<Loaded> {
  const w = workload(state.workload);
  const snap = await snapshot(db);
  const models = await catalog(db, w);
  const shelf = await boards(db);
  const open_weights = await openModels(db);
  const reads = await db.query('SELECT org, read_at, rows, ms, status FROM weight_reads ORDER BY read_at DESC LIMIT 60');
  const board = state.board ? await boardEntries(db, state.board.slug, state.board.measure) : [];
  const compared: Compared[] = [];
  for (const id of state.compare ?? []) {
    const d = await detail(db, id, w);
    if (!d) continue;
    const facts = await about(db, id);
    compared.push({ detail: d, facts: facts?.facts ?? null, abilities: await abilities(db, id), scores: facts?.scores ?? [] });
  }
  // The brief covers the week to the latest snapshot's day: the desk speaks for its data, not the clock.
  const day = snap.applied ? String(snap.applied.started_at).slice(0, 10) : null;
  let brief: Loaded['brief'] = null;
  if (day) {
    const all = await moves(db, dayBefore(day, WEEK_DAYS - 1));
    const facts = { day, labs: collapse(all.filter((m) => m.firstParty)), street: collapse(all.filter((m) => !m.firstParty)), launches: await launches(db, dayBefore(day, LAUNCH_DAYS - 1)), sunsets: await sunsets(db, dayBefore(day, WEEK_DAYS - 1)),
      changes: Number((await db.query('SELECT count(*)::INTEGER n FROM events WHERE day >= ?', [dayBefore(day, WEEK_DAYS - 1)]))[0]!.n) };
    const story = lede(facts), index = await priceIndex(db, w);
    brief = { facts, lede: story, index, spoken: spoken(facts, story, index) };
  }
  const rest = { compared, boards: shelf, board, weights: open_weights, weightReads: reads, brief };
  if (!state.model) return { snap, models, open: null, ...rest };
  const d = await detail(db, state.model, w);
  if (!d) return { snap, models, open: null, ...rest };
  const list = await offers(db, state.model, w), facts = await about(db, state.model);
  const past = await history(db, state.model, w), kept = await spans(db, state.model), events = await modelEvents(db, state.model);
  return { snap, models, open: { detail: d, offers: list, facts: facts?.facts ?? null, scores: facts?.scores ?? [], history: past, spans: kept, events }, ...rest };
}

const reason = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error:\s*/, '').slice(0, 400);

/** Reads every table the pipeline needs, within one command's 16 calls. */
export async function read(callTool: Context['callTool']) {
  const receipts: Receipt[] = [];
  let calls = 0;
  const call: Call = (name, args) => { calls++; return callTool(name, args); };
  const take = <T>(r: Read<T>) => { receipts.push(r.receipt); return r; };
  try {
    const models = take(await readAll(call, 'Models', MODELS_URL, '/*', MODEL_COLUMNS, model, 2));
    const benchmarks = take(await readAll(call, 'Benchmarks', MODELS_URL, '/*/benchmarks/*', BENCHMARK_COLUMNS, benchmark, 2));
    const providers = take(await readAll(call, 'Providers', PRICES_URL, '/*', PROVIDER_COLUMNS, provider, 2));
    const listings = take(await readAll(call, 'Listings', PRICES_URL, '/*/models/*', [...LISTING_COLUMNS], listing, MAX_CALLS - calls));
    return { ok: true as const, models, benchmarks, providers, listings, receipts };
  } catch (e) {
    return { ok: false as const, reason: reason(e), receipts };
  }
}

/**
 * The refresh, run by the daily trigger and the header's Refresh (a trigger may take minutes; a
 * clicked action has seconds, so no button runs it). Read, match, check and apply; a failed read
 * is recorded, never filled in.
 */
export async function refresh(ctx: Context): Promise<{ updates: ReturnType<typeof view> }> {
  ctx.state = normalize(ctx.state);
  const started = new Date().toISOString();
  const got = await read(ctx.callTool.bind(ctx));
  if (!got.ok) await failed(ctx.database, started, got.reason, got.receipts);
  else {
    const who = identity(got.models.rows.map((m) => ({ id: m.id, name: m.name })), got.providers.rows.map((p) => p.id));
    const listings = got.listings.rows.map((row) => ({ row, canonical: who.resolve(row[2] as string | null, row[1], row[4] as string | null) }));
    // What was read, in a stable form: the same source twice is one fingerprint.
    const fingerprint = createHash('sha256').update(JSON.stringify([got.providers.rows, got.listings.rows, got.models.rows, got.benchmarks.rows])).digest('hex');
    const dropped = got.models.dropped + got.benchmarks.dropped + got.providers.dropped + got.listings.dropped;
    const read = got.receipts.reduce((n, r) => n + r.total, 0);
    // Who published each score, from the catalog: each provider's labs come from its matched listings.
    const labsBy = new Map<string, Set<string>>();
    for (const { row, canonical } of listings) if (canonical) (labsBy.get(row[0]) ?? labsBy.set(row[0], new Set()).get(row[0])!).add(canonical.split('/')[0]!);
    const sellers = got.providers.rows.map((p) => ({ id: p.id, doc: p.doc, api: p.api, labs: [...(labsBy.get(p.id) ?? [])] }));
    const kinds = provenance(got.benchmarks.rows, sellers, new Set(got.models.rows.map((m) => m.id.split('/')[0]!)));
    const benchmarks = got.benchmarks.rows.map((b, i) => ({ ...b, ...kinds[i]! }));
    await apply(ctx.database, { providers: got.providers.rows, listings, models: got.models.rows, benchmarks, receipts: got.receipts, dropped, read, fingerprint }, started);
  }
  return { updates: view(ctx.state, await load(ctx.database, ctx.state)) };
}

/**
 * The weights host's facts (access, licence, parameters), an organisation at a time, the longest
 * unread first: the hourly trigger. Each organisation is one read, so one failing leaves the others.
 */
export async function refreshWeights(ctx: Context): Promise<{ updates: ReturnType<typeof view> }> {
  ctx.state = normalize(ctx.state);
  const now = new Date().toISOString();
  let calls = 0;
  const call: Call = (name, args) => { calls++; return ctx.callTool(name, args); };
  for (const org of await dueOrganisations(ctx.database, now, MAX_CALLS)) {
    if (calls >= MAX_CALLS) break;
    const started = Date.now();
    try {
      const got = await readAll(call, `Weights: ${org}`, weightsUrl(org), '/*', WEIGHT_COLUMNS, weights, MAX_CALLS - calls);
      await saveWeights(ctx.database, org, got.rows, now, Date.now() - started);
    } catch (e) {
      await weightsFailed(ctx.database, org, now, Date.now() - started, reason(e));
    }
  }
  return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'weights' || u.surface === 'pipeline') };
}

/** A GPU figure from the form: a positive number within reason, or nothing. */
const figure = (v: unknown, max: number) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').trim()); return Number.isFinite(n) && n > 0 && n <= max ? n : null; };

export async function handleAction(controlId: string, value: unknown, ctx: Context, action?: string) {
  ctx.state = normalize(ctx.state);
  // The GPU form's fields save as they are typed; the view changes only when they are saved.
  if (!action && (controlId === '/gpuDraft/memory' || controlId === '/gpuDraft/price')) {
    ctx.state.gpuDraft = { ...ctx.state.gpuDraft, [controlId === '/gpuDraft/memory' ? 'memory' : 'price']: value === '' || value === null ? '' : String(value).slice(0, 20) };
    return { updates: [] };
  }
  switch (action) {
    case 'set_gpu': {
      const memoryGb = figure(ctx.state.gpuDraft?.memory, 1_000), usdPerHour = figure(ctx.state.gpuDraft?.price, 1_000);
      if (memoryGb === null) throw new Error('Enter the memory of one GPU in gigabytes, a number up to 1,000');
      if (usdPerHour === null) throw new Error('Enter the rent of one GPU per hour in US dollars, a number up to 1,000');
      ctx.state.gpu = { memoryGb, usdPerHour };
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'weights') };
    }
    case 'show_changes': {
      const type = String((value as { type?: unknown } | null)?.type ?? 'all');
      if (type !== 'all' && !Object.hasOwn(TYPES, type)) throw new Error('That kind of change is not one this desk records');
      ctx.state.type = type;
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'changes') };
    }
    case 'set_workload': {
      const id = String((value as { id?: unknown } | null)?.id ?? '');
      if (!WORKLOADS.some((w) => w.id === id)) throw new Error('That request shape is not one this desk prices');
      ctx.state.workload = id;
      // Every price follows the request: only the pipeline's own records stay as they were.
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface !== 'changes' && u.surface !== 'pipeline') };
    }
    case 'set_volume': {
      const volume = Number((value as { volume?: unknown } | null)?.volume);
      if (!VOLUMES.includes(volume)) throw new Error('Choose one of the monthly volumes shown');
      ctx.state.volume = volume;
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'costs' || u.surface === 'compare') };
    }
    case 'compare_add': case 'compare_remove': {
      const id = String((value as { id?: unknown } | null)?.id ?? '');
      const list = ctx.state.compare ?? [];
      if (action === 'compare_add') {
        if (!id || id.length > 200 || !(await detail(ctx.database, id))) throw new Error('That model is not in the current snapshot; refresh and choose again');
        if (!list.includes(id) && list.length >= MAX_COMPARED) throw new Error(`Compare holds ${MAX_COMPARED} models; remove one first`);
        ctx.state.compare = [...new Set([...list, id])];
      } else ctx.state.compare = list.filter((x) => x !== id);
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'compare' || u.surface === 'models') };
    }
    case 'open_board': {
      const v = (value ?? {}) as { slug?: unknown; measure?: unknown };
      const slug = String(v.slug ?? ''), measure = String(v.measure ?? '');
      if (!(await boards(ctx.database)).some((b) => b.slug === slug && b.measure === measure)) throw new Error('That benchmark is not in the current snapshot; refresh and choose again');
      ctx.state.board = { slug, measure };
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'benchmarks') };
    }
    case 'open_model': {
      const id = String((value as { id?: unknown } | null)?.id ?? '');
      const focus = (value as { focus?: unknown } | null)?.focus === true;
      if (!id || id.length > 200 || !(await detail(ctx.database, id))) throw new Error('That model is not in the current snapshot; refresh and choose again');
      ctx.state.model = id;
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'models'), ...(focus ? { focusSurface: 'models' } : {}) };
    }
    default: throw new Error(`Model Desk has no action ${action ?? controlId}`);
  }
}

export async function renderApp(context: Context) {
  context.state = normalize(context.state);
  return { updates: view(context.state, await load(context.database, context.state)) };
}

export const surfaceFile = () => view({}, NOTHING).map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));
