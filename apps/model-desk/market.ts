// Who sells each model, and at what. The same weights reach buyers from the lab that made them
// and from resellers; a price is a function of the workload; and a price no other provider comes
// near is unconfirmed. Everything here is SQL over the current snapshot, so a whole catalog of
// spreads is one query.

import type { Database } from './store.ts';

/** A request shape: what a price is measured against. */
export interface Workload { id: string; name: string; description: string; inputTokens: number; outputTokens: number; reasoningTokens: number; cacheHitRate: number; cacheWriteRate: number; contextTokens: number }

/** Short turns, light history, little caching: an assistant in a product. */
export const CHAT: Workload = { id: 'chat', name: 'Chat', description: 'Short turns, light history, little caching: an assistant in a product.', inputTokens: 1_500, outputTokens: 500, reasoningTokens: 0, cacheHitRate: 0.2, cacheWriteRate: 0.05, contextTokens: 8_000 };

/** The context a listing's long-context prices start at. */
const LONG_CONTEXT = 200_000;
/** Listings this far from the model's median price are taken as data errors, not prices. */
export const OUTLIER_FACTOR = 20;
/** Below this many priced listings there is no median worth trusting. */
const MIN_FOR_MEDIAN = 5;
/** A second provider within this multiple confirms a price. */
export const CORROBORATION = 1.5;
/** Within this share of the full context still counts as full context. */
const CONTEXT_TOLERANCE = 0.9;
/** No model is served with this much context; a larger figure is a data error. */
const IMPLAUSIBLE_CONTEXT = 16_000_000;
/** With three or more sources, a context this many times their median is one source's error. */
const CONTEXT_OUTLIER = 4;

const num = (n: number) => { if (!Number.isFinite(n)) throw new Error('A workload figure must be a finite number'); return String(n); };

/**
 * US dollars per million billable tokens for one request of the workload, or NULL when the
 * listing publishes no price. An unpublished cache or reasoning rate is charged at the full input
 * or output rate: assuming a discount nobody published would recommend the wrong provider.
 */
export function rateSql(w: Workload, a = 'l'): string {
  const long = w.contextTokens >= LONG_CONTEXT;
  const input = long ? `coalesce(${a}.input_200k, ${a}.input)` : `${a}.input`;
  const output = long ? `coalesce(${a}.output_200k, ${a}.output)` : `${a}.output`;
  const hit = Math.min(1, Math.max(0, w.cacheHitRate)), write = Math.min(1, Math.max(0, w.cacheWriteRate));
  const billable = w.inputTokens + w.outputTokens + w.reasoningTokens;
  if (billable <= 0) throw new Error('A workload needs some tokens');
  const total = [
    `${num(w.inputTokens * (1 - hit))} * ${input}`,
    `${num(w.inputTokens * hit)} * coalesce(${a}.cache_read, ${input})`,
    `${num(w.inputTokens * write)} * coalesce(${a}.cache_write, ${input})`,
    `${num(w.reasoningTokens)} * coalesce(${a}.reasoning_price, ${output})`,
    `${num(w.outputTokens)} * ${output}`,
  ].join(' + ');
  return `CASE WHEN ${a}.input IS NULL OR ${a}.output IS NULL OR (${a}.input = 0 AND ${a}.output = 0) THEN NULL ELSE (${total}) / ${num(billable)} END`;
}

/**
 * The lab sells this listing itself: the provider is the lab, or one of its own services named
 * after it ("lab-cloud"). Read from the catalog's ids, so no list of companies is kept.
 */
export const firstPartySql = (a = 'l') => `(${a}.provider = ${a}.lab OR starts_with(${a}.provider, ${a}.lab || '-'))`;

/** Text in, text out: only then is a token the same unit at every provider. */
const comparableSql = (a = 'l') => `(coalesce(${a}.modalities_in, '') LIKE '%text%' AND coalesce(${a}.modalities_out, '') = 'text')`;

/** Every live listing of matched models, priced and judged: outlier, confirmed, full context. */
function judged(w: Workload, where = 'TRUE') {
  return `
    WITH live AS (
      SELECT l.*, ${rateSql(w)} rate, ${firstPartySql()} first_party, ${comparableSql()} comparable
      FROM listings l WHERE l.canonical IS NOT NULL AND coalesce(l.status, '') <> 'deprecated' AND ${where}),
    -- A model's full context, as its sources establish it: the largest plausible value, once
    -- three or more sources have spoken, leaving out any over ${CONTEXT_OUTLIER} times their
    -- median (one listing claims 5 million where the model and its other hosts say 1 million).
    contexts AS (
      SELECT canonical, context v FROM live WHERE context > 0 AND context < ${IMPLAUSIBLE_CONTEXT}
      UNION ALL SELECT m.id, m.context FROM models m WHERE m.context > 0 AND m.context < ${IMPLAUSIBLE_CONTEXT} AND m.id IN (SELECT canonical FROM live)),
    spans AS (SELECT canonical, median(v) median, count(*) n FROM contexts GROUP BY canonical),
    widest AS (
      SELECT c.canonical, max(c.v) FILTER (WHERE s.n < 3 OR c.v <= s.median * ${CONTEXT_OUTLIER}) full_context
      FROM contexts c JOIN spans s USING (canonical) GROUP BY c.canonical),
    stats AS (
      SELECT live.canonical, median(live.rate) median, count(live.rate)::INTEGER priced, any_value(w.full_context) full_context
      FROM live LEFT JOIN widest w USING (canonical) GROUP BY live.canonical),
    flagged AS (
      SELECT live.*, s.median, s.priced, s.full_context,
        rate IS NOT NULL AND NOT (s.priced >= ${MIN_FOR_MEDIAN} AND s.median > 0 AND (rate > s.median * ${OUTLIER_FACTOR} OR rate < s.median / ${OUTLIER_FACTOR})) inside
      FROM live JOIN stats s USING (canonical)),
    kept AS (
      -- With fewer than two prices left inside the band, the band says nothing: keep them all.
      SELECT *, rate IS NOT NULL AND (inside OR count(*) FILTER (WHERE inside) OVER (PARTITION BY canonical) < 2) kept FROM flagged)
    SELECT k.*,
      k.kept AND EXISTS (SELECT 1 FROM kept o WHERE o.canonical = k.canonical AND o.kept AND o.provider <> k.provider AND o.rate <= k.rate * ${CORROBORATION}) confirmed,
      k.full_context IS NULL OR coalesce(k.context, 0) >= k.full_context * ${CONTEXT_TOLERANCE} fits
    FROM kept k`;
}

/** A model in the list: just what its card and the spread ranking need. */
export interface ModelRow {
  id: string; name: string; lab: string; providers: number; priced: number; comparable: boolean;
  own_provider: string | null; own_rate: number | null; pick_provider: string | null; pick_rate: number | null;
  credible_rate: number | null; low_rate: number | null; high_rate: number | null;
}
/** One model in full: the list's row, the prices behind its picks and why the cheapest was passed over. */
export interface ModelDetail extends ModelRow {
  own_input: number | null; own_output: number | null; pick_input: number | null; pick_output: number | null;
  low_provider: string | null; low_context: number | null; low_fits: boolean | null; low_status: string | null; full_context: number | null; outliers: number;
}

const ROUND = (x: string) => `round(${x}, 4)`;

function rows(w: Workload, one: boolean) {
  const at = (rank: string, col: string, as: string, round = false) => `any_value(${round ? ROUND(`r.${col}`) : `r.${col}`}) FILTER (WHERE r.${rank} = 1) ${as}`;
  return `
    WITH j AS (${judged(w, one ? 'l.canonical = ?' : 'TRUE')}),
    ranked AS (
      SELECT j.*, coalesce(p.name, j.provider) provider_name,
        CASE WHEN kept THEN row_number() OVER (PARTITION BY canonical, kept ORDER BY rate, provider) END low_rank,
        CASE WHEN kept AND confirmed THEN row_number() OVER (PARTITION BY canonical, kept AND confirmed ORDER BY rate, provider) END credible_rank,
        -- The original's order: a confirmed, generally available full-context offer, then a
        -- confirmed one, then any full-context one.
        CASE WHEN kept AND fits THEN row_number() OVER (PARTITION BY canonical, kept AND fits ORDER BY confirmed DESC, (status IS NULL) DESC, rate, provider) END pick_rank,
        CASE WHEN rate IS NOT NULL AND first_party THEN row_number() OVER (PARTITION BY canonical, rate IS NOT NULL AND first_party ORDER BY rate, provider) END own_rank
      FROM j LEFT JOIN providers p ON p.id = j.provider)
    SELECT m.id, coalesce(m.name, m.id) name, m.lab,
      count(DISTINCT r.provider)::INTEGER providers, count(DISTINCT r.provider) FILTER (WHERE r.rate IS NOT NULL)::INTEGER priced, bool_or(r.comparable) comparable,
      ${at('own_rank', 'provider_name', 'own_provider')}, ${at('own_rank', 'rate', 'own_rate', true)},
      ${at('pick_rank', 'provider_name', 'pick_provider')}, ${at('pick_rank', 'rate', 'pick_rate', true)},
      ${at('credible_rank', 'rate', 'credible_rate', true)}, ${at('low_rank', 'rate', 'low_rate', true)}, ${ROUND('max(r.rate) FILTER (WHERE r.kept)')} high_rate
      ${one ? `, ${at('own_rank', 'input', 'own_input')}, ${at('own_rank', 'output', 'own_output')}, ${at('pick_rank', 'input', 'pick_input')}, ${at('pick_rank', 'output', 'pick_output')},
      ${at('low_rank', 'provider_name', 'low_provider')}, ${at('low_rank', 'context', 'low_context')}, ${at('low_rank', 'fits', 'low_fits')}, ${at('low_rank', 'status', 'low_status')},
      any_value(r.full_context) full_context, count(*) FILTER (WHERE r.rate IS NOT NULL AND NOT r.kept)::INTEGER outliers` : ''}
    FROM models m JOIN ranked r ON r.canonical = m.id
    GROUP BY m.id, m.name, m.lab ORDER BY providers DESC, name, m.id`;
}

/**
 * One row per model with at least one live listing: its own lab's price, the cheapest confirmed
 * full-context offer (the honest recommendation), the cheapest confirmed and the outright cheapest
 * price, and the dearest kept one. Kept lean, and read in chunks.
 */
export async function catalog(db: Database, w: Workload = CHAT): Promise<ModelRow[]> {
  // Read in chunks: each query result is bounded to 256 KiB, and the catalog keeps growing.
  const out: ModelRow[] = [];
  for (let offset = 0; ; offset += CHUNK) {
    const page = await db.query(`${rows(w, false)} LIMIT ${CHUNK} OFFSET ${offset}`) as unknown as ModelRow[];
    out.push(...page);
    if (page.length < CHUNK) return out;
  }
}
const CHUNK = 400;

/** The same judgement for one model, with the details its page shows. */
export async function detail(db: Database, id: string, w: Workload = CHAT): Promise<ModelDetail | null> {
  const [row] = await db.query(rows(w, true), [id]);
  return (row as unknown as ModelDetail) ?? null;
}

/** How much shopping around can save: the dearest kept price over the cheapest confirmed one. */
export const spread = (r: ModelRow) => {
  const floor = r.credible_rate ?? r.low_rate;
  return floor && r.high_rate ? r.high_rate / floor : null;
};

export interface Offer {
  provider: string; provider_name: string; model: string; name: string | null; status: string | null;
  input: number | null; output: number | null; cache_read: number | null; context: number | null; output_limit: number | null;
  rate: number | null; first_party: boolean; kept: boolean; confirmed: boolean; fits: boolean; comparable: boolean;
}

/** Every live listing of one model, cheapest first, with how it was judged. */
export async function offers(db: Database, id: string, w: Workload = CHAT): Promise<Offer[]> {
  return await db.query(`
    WITH j AS (${judged(w, 'l.canonical = ?')})
    SELECT j.provider, coalesce(p.name, j.provider) provider_name, j.model, j.name, j.status, j.input, j.output, j.cache_read, j.context, j.output_limit,
      j.rate, j.first_party, j.kept, j.confirmed, j.fits, j.comparable
    FROM j LEFT JOIN providers p ON p.id = j.provider
    ORDER BY j.rate IS NULL, j.rate, j.provider, j.model LIMIT 500`, [id]) as unknown as Offer[];
}

export interface Facts { id: string; name: string; lab: string; family: string | null; license: string | null; open_weights: boolean | null; knowledge: string | null; release_date: string | null; last_updated: string | null; context: number | null; output_limit: number | null }
export interface Score { name: string; score: number; metric: string | null; source: string | null; date: string | null }

export async function model(db: Database, id: string): Promise<{ facts: Facts; scores: Score[] } | null> {
  const [facts] = await db.query('SELECT id, coalesce(name, id) name, lab, family, license, open_weights, knowledge, release_date, last_updated, context, output_limit FROM models WHERE id = ?', [id]);
  if (!facts) return null;
  const scores = await db.query('SELECT name, score, metric, source, date FROM benchmarks WHERE model = ? ORDER BY position LIMIT 100', [id]);
  return { facts: facts as unknown as Facts, scores: scores as unknown as Score[] };
}
