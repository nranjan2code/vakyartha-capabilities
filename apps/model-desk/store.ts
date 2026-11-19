// The pipeline's database. DuckDB is the only owner of catalog data: the current snapshot
// (providers, listings, models, benchmarks), the change events between snapshots, the price
// history, and a record of every refresh with its reads and quality findings.
//
// A refresh loads what it read into staging tables, checks the whole candidate, and only then
// replaces the snapshot, in one transaction. A refresh that fails a check is recorded with its
// findings and leaves the last good snapshot in place, so the desk keeps working and says why.
// Rows go in with one statement per chunk (`from_json` over the chunk's JSON): 10,010 listings
// load in about 30 ms that way, against about 4 s inserting row by row.

import type { Benchmark, ListingRow, Model, Provider, Receipt } from './source.ts';

export interface Database {
  run(sql: string, values?: (string | number | boolean | null)[]): Promise<void>;
  query(sql: string, values?: (string | number | boolean | null)[]): Promise<Record<string, unknown>[]>;
}

/** Listing columns after provider and model, in source order (LISTING_COLUMNS), with their types. */
const LISTING_FIELDS: [string, string][] = [
  ['name', 'VARCHAR'], ['family', 'VARCHAR'], ['upstream', 'VARCHAR'], ['status', 'VARCHAR'], ['release_date', 'VARCHAR'], ['last_updated', 'VARCHAR'], ['knowledge', 'VARCHAR'],
  ['open_weights', 'BOOLEAN'], ['reasoning', 'BOOLEAN'], ['tool_call', 'BOOLEAN'], ['attachment', 'BOOLEAN'], ['structured_output', 'BOOLEAN'],
  ['context', 'BIGINT'], ['input_limit', 'BIGINT'], ['output_limit', 'BIGINT'],
  ['input', 'DOUBLE'], ['output', 'DOUBLE'], ['cache_read', 'DOUBLE'], ['cache_write', 'DOUBLE'], ['reasoning_price', 'DOUBLE'],
  ['input_200k', 'DOUBLE'], ['output_200k', 'DOUBLE'],
  ['modalities_in', 'VARCHAR'], ['modalities_out', 'VARCHAR'],
];
const LISTING_TABLE: [string, string][] = [['provider', 'VARCHAR'], ['model', 'VARCHAR'], ['canonical', 'VARCHAR'], ['lab', 'VARCHAR'], ...LISTING_FIELDS];
const PROVIDER_TABLE: [string, string][] = [['id', 'VARCHAR'], ['name', 'VARCHAR'], ['doc', 'VARCHAR'], ['api', 'VARCHAR']];
const MODEL_TABLE: [string, string][] = [['id', 'VARCHAR'], ['lab', 'VARCHAR'], ['name', 'VARCHAR'], ['family', 'VARCHAR'], ['license', 'VARCHAR'], ['open_weights', 'BOOLEAN'], ['knowledge', 'VARCHAR'], ['release_date', 'VARCHAR'], ['last_updated', 'VARCHAR'], ['context', 'BIGINT'], ['output_limit', 'BIGINT']];
const BENCHMARK_TABLE: [string, string][] = [['model', 'VARCHAR'], ['position', 'INTEGER'], ['name', 'VARCHAR'], ['score', 'DOUBLE'], ['metric', 'VARCHAR'], ['source', 'VARCHAR'], ['date', 'VARCHAR']];
/** The prices a listing's history follows, per million tokens. */
const PRICES = ['input', 'output', 'cache_read', 'cache_write', 'reasoning_price', 'input_200k', 'output_200k'];
/** What a change event compares, with the field name it reports. */
const COMPARED: [string, string][] = [
  ['name', 'name'], ['family', 'family'], ['status', 'status'], ['knowledge', 'knowledge'], ['release_date', 'release_date'], ['last_updated', 'last_updated'],
  ['open_weights', 'open_weights'], ['reasoning', 'reasoning'], ['tool_call', 'tool_call'], ['attachment', 'attachment'], ['structured_output', 'structured_output'],
  ['modalities_in', 'modalities.input'], ['modalities_out', 'modalities.output'],
  ['context', 'limit.context'], ['input_limit', 'limit.input'], ['output_limit', 'limit.output'],
  ['input', 'cost.input'], ['output', 'cost.output'], ['cache_read', 'cost.cache_read'], ['cache_write', 'cost.cache_write'], ['reasoning_price', 'cost.reasoning'],
  ['input_200k', 'cost.input_over_200k'], ['output_200k', 'cost.output_over_200k'],
];

const columns = (cols: [string, string][]) => cols.map(([n, t]) => `${n} ${t}`).join(', ');

export async function initialize(db: Database) {
  await db.run('CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, started_at VARCHAR, finished_at VARCHAR, day VARCHAR, status VARCHAR, fingerprint VARCHAR, providers INTEGER, listings INTEGER, models INTEGER, events INTEGER, note VARCHAR)');
  await db.run('CREATE TABLE IF NOT EXISTS receipts(run INTEGER, what VARCHAR, url VARCHAR, pages INTEGER, rows INTEGER, total INTEGER, ms INTEGER, status VARCHAR)');
  await db.run('CREATE TABLE IF NOT EXISTS findings(run INTEGER, check_id VARCHAR, level VARCHAR, message VARCHAR)');
  await db.run(`CREATE TABLE IF NOT EXISTS providers(${columns(PROVIDER_TABLE)})`);
  await db.run(`CREATE TABLE IF NOT EXISTS listings(${columns(LISTING_TABLE)})`);
  await db.run(`CREATE TABLE IF NOT EXISTS models(${columns(MODEL_TABLE)})`);
  await db.run(`CREATE TABLE IF NOT EXISTS benchmarks(${columns(BENCHMARK_TABLE)})`);
  await db.run('CREATE TABLE IF NOT EXISTS events(id VARCHAR PRIMARY KEY, run INTEGER, day VARCHAR, type VARCHAR, provider VARCHAR, model VARCHAR, canonical VARCHAR, lab VARCHAR, name VARCHAR, changes JSON)');
  await db.run(`CREATE TABLE IF NOT EXISTS price_history(provider VARCHAR, model VARCHAR, canonical VARCHAR, valid_from VARCHAR, valid_to VARCHAR, ${PRICES.map((p) => `${p} DOUBLE`).join(', ')})`);
}

const CHUNK = 2_000;
async function load(db: Database, table: string, cols: [string, string][], rows: unknown[][]) {
  const select = cols.map(([, type], i) => `r[${i + 1}]::${type}`).join(', ');
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.run(`INSERT INTO ${table} SELECT ${select} FROM (SELECT from_json(j, '["VARCHAR"]') r FROM (SELECT unnest(from_json(?::JSON, '["JSON"]')) j))`, [JSON.stringify(rows.slice(i, i + CHUNK))]);
  }
}

export interface Candidate {
  providers: Provider[];
  /** Each listing with its canonical model id (or null) after the source columns. */
  listings: { row: ListingRow; canonical: string | null }[];
  models: Model[];
  benchmarks: Benchmark[];
  receipts: Receipt[];
  /** Malformed rows the reads left out, across all reads, and the rows they read. */
  dropped: number;
  read: number;
  fingerprint: string;
}

export interface Finding { check: string; level: 'fail' | 'warn'; message: string }

async function stage(db: Database, c: Candidate) {
  await db.run(`CREATE OR REPLACE TEMP TABLE stage_providers(${columns(PROVIDER_TABLE)})`);
  await db.run(`CREATE OR REPLACE TEMP TABLE stage_listings(${columns(LISTING_TABLE)})`);
  await db.run(`CREATE OR REPLACE TEMP TABLE stage_models(${columns(MODEL_TABLE)})`);
  await db.run(`CREATE OR REPLACE TEMP TABLE stage_benchmarks(${columns(BENCHMARK_TABLE)})`);
  await load(db, 'stage_providers', PROVIDER_TABLE, c.providers.map((p) => [p.id, p.name, p.doc, p.api]));
  await load(db, 'stage_listings', LISTING_TABLE, c.listings.map(({ row, canonical }) => [row[0], row[1], canonical, canonical ? canonical.split('/')[0]! : null, ...row.slice(2)]));
  await load(db, 'stage_models', MODEL_TABLE, c.models.map((m) => [m.id, m.id.split('/')[0]!, m.name, m.family, m.license, m.openWeights, m.knowledge, m.releaseDate, m.lastUpdated, m.context, m.output]));
  await load(db, 'stage_benchmarks', BENCHMARK_TABLE, c.benchmarks.map((b) => [b.model, b.position, b.name, b.score, b.metric, b.source, b.date]));
}

const int = (v: unknown) => Number(v ?? 0);
const MAX_CONTEXT = 10_000_000, MAX_PRICE = 1_000, LISTED = 5;
const names = (rows: Record<string, unknown>[]) => rows.slice(0, LISTED).map((r) => String(r.k)).join(', ') + (rows.length > LISTED ? ` and ${rows.length - LISTED} more` : '');

/** The quality checks over the staged candidate, against the last applied snapshot. */
export async function check(db: Database, c: Candidate): Promise<{ findings: Finding[]; stats: { providers: number; listings: number; models: number } }> {
  const [now] = await db.query(`SELECT (SELECT count(*) FROM stage_providers)::INTEGER providers, (SELECT count(*) FROM stage_listings)::INTEGER listings,
    (SELECT count(*) FROM stage_listings WHERE canonical IS NOT NULL)::INTEGER attributed, (SELECT count(*) FROM stage_listings WHERE upstream IS NOT NULL AND upstream NOT IN (SELECT id FROM stage_models))::INTEGER unknown_upstream,
    (SELECT count(*) FROM stage_models)::INTEGER models`);
  const [before] = await db.query(`SELECT listings, models FROM runs WHERE status = 'applied' ORDER BY id DESC LIMIT 1`);
  const s = { providers: int(now!.providers), listings: int(now!.listings), models: int(now!.models) };
  const findings: Finding[] = [];
  const fail = (check: string, message: string) => findings.push({ check, level: 'fail', message });
  const warn = (check: string, message: string) => findings.push({ check, level: 'warn', message });
  if (c.dropped > c.read * 0.01) fail('malformed', `${c.dropped} of ${c.read} rows were malformed, more than 1 in 100`);
  else if (c.dropped) warn('malformed', `${c.dropped} malformed rows were left out`);
  if (s.providers < 10 || s.listings < 100 || s.models < 10) fail('empty', `The source returned only ${s.providers} providers, ${s.listings} listings and ${s.models} models`);
  if (before && s.listings < int(before.listings) * 0.5) fail('shrink', `Listings fell from ${int(before.listings)} to ${s.listings}, more than half`);
  if (before && s.models < int(before.models) * 0.5) fail('shrink', `Models fell from ${int(before.models)} to ${s.models}, more than half`);
  const attributed = int(now!.attributed);
  if (s.listings && attributed < s.listings * 0.5) fail('identity', `Only ${attributed} of ${s.listings} listings could be matched to a model`);
  else if (s.listings - attributed) warn('identity', `${s.listings - attributed} listings are not matched to a model and appear under their provider only`);
  if (int(now!.unknown_upstream)) warn('identity', `${int(now!.unknown_upstream)} listings name an underlying model the model list does not hold`);
  const wide = await db.query(`SELECT provider || '/' || model k FROM stage_listings WHERE context > ? ORDER BY context DESC, k`, [MAX_CONTEXT]);
  if (wide.length) warn('context', `${wide.length} listings claim a context over 10 million tokens: ${names(wide)}`);
  const dear = await db.query(`SELECT provider || '/' || model k FROM stage_listings WHERE greatest(coalesce(input, 0), coalesce(output, 0)) > ? ORDER BY k`, [MAX_PRICE]);
  if (dear.length) warn('price', `${dear.length} listings price over ${MAX_PRICE} USD per million tokens: ${names(dear)}`);
  const dup = await db.query(`SELECT provider || '/' || model k FROM stage_listings GROUP BY provider, model HAVING count(*) > 1 ORDER BY k`);
  if (dup.length) fail('duplicate', `${dup.length} listings appear more than once: ${names(dup)}`);
  return { findings, stats: s };
}

/** Change events between the current snapshot and the staged one, written in SQL. */
async function diff(db: Database, run: number, day: string): Promise<number> {
  const changes = `list_filter([${COMPARED.map(([col, field]) => `{'field': '${field}', 'old': to_json(o.${col}), 'new': to_json(n.${col})}`).join(', ')}], lambda c: c.old IS DISTINCT FROM c.new)`;
  await db.run(`INSERT INTO events
    WITH known AS (SELECT DISTINCT provider FROM listings), staying AS (SELECT DISTINCT provider FROM stage_listings),
    pairs AS (
      SELECT coalesce(n.provider, o.provider) provider, coalesce(n.model, o.model) model, coalesce(n.canonical, o.canonical) canonical, coalesce(n.lab, o.lab) lab, coalesce(n.name, o.name) name,
        o.provider IS NULL added, n.provider IS NULL removed, ${changes} changes,
        coalesce(n.provider, o.provider) IN (SELECT provider FROM known) provider_known, coalesce(n.provider, o.provider) IN (SELECT provider FROM staying) provider_stays
      FROM listings o FULL OUTER JOIN stage_listings n ON o.provider = n.provider AND o.model = n.model),
    typed AS (
      SELECT *, CASE
        WHEN added THEN CASE WHEN provider_known THEN 'model_added' ELSE 'provider_added' END
        WHEN removed THEN CASE WHEN provider_stays THEN 'model_removed' ELSE 'provider_removed' END
        WHEN len(list_filter(changes, lambda c: c.field = 'status' AND c.new::VARCHAR = '"deprecated"')) > 0 THEN 'deprecated'
        WHEN len(list_filter(changes, lambda c: starts_with(c.field, 'cost.'))) > 0 THEN 'repriced'
        WHEN len(list_filter(changes, lambda c: starts_with(c.field, 'limit.'))) > 0 THEN 'context_changed'
        ELSE 'capability_changed' END type
      FROM pairs WHERE added OR removed OR len(changes) > 0)
    SELECT md5(? || '|' || type || '|' || provider || '/' || model)[1:16], ?, ?, type, provider, model, canonical, lab, name,
      CASE WHEN added OR removed THEN '[]'::JSON ELSE to_json(changes) END
    FROM typed`, [String(run), run, day]);
  const [n] = await db.query('SELECT count(*)::INTEGER n FROM events WHERE run = ?', [run]);
  return int(n!.n);
}

/** Close each open price span that no longer holds, then open one for each priced listing without one. */
async function history(db: Database, at: string) {
  const same = PRICES.map((p) => `s.${p} IS NOT DISTINCT FROM h.${p}`).join(' AND ');
  await db.run(`UPDATE price_history h SET valid_to = ? WHERE valid_to IS NULL AND NOT EXISTS (SELECT 1 FROM stage_listings s WHERE s.provider = h.provider AND s.model = h.model AND ${same})`, [at]);
  await db.run(`INSERT INTO price_history SELECT s.provider, s.model, s.canonical, ?, NULL, ${PRICES.map((p) => `s.${p}`).join(', ')} FROM stage_listings s
    WHERE (s.input IS NOT NULL OR s.output IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM price_history h WHERE h.valid_to IS NULL AND h.provider = s.provider AND h.model = s.model)`, [at]);
}

export interface Outcome { run: number; status: 'applied' | 'unchanged' | 'blocked' | 'failed'; events: number; findings: Finding[] }

async function record(db: Database, run: number, started: string, status: Outcome['status'], fingerprint: string | null, stats: { providers: number; listings: number; models: number } | null, events: number, note: string, receipts: Receipt[], findings: Finding[]) {
  await db.run('INSERT INTO runs VALUES (?,?,?,?,?,?,?,?,?,?,?)', [run, started, new Date().toISOString(), started.slice(0, 10), status, fingerprint, stats?.providers ?? null, stats?.listings ?? null, stats?.models ?? null, events, note]);
  for (const r of receipts) await db.run('INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?)', [run, r.what, r.url, r.pages, r.rows, r.total, r.ms, r.status]);
  for (const f of findings) await db.run('INSERT INTO findings VALUES (?,?,?,?)', [run, f.check, f.level, f.message]);
}

export async function nextRun(db: Database): Promise<number> {
  const [r] = await db.query('SELECT coalesce(max(id), 0)::INTEGER + 1 n FROM runs');
  return int(r!.n);
}

/** A refresh whose reads failed: recorded with what was read, the snapshot untouched. */
export async function failed(db: Database, started: string, reason: string, receipts: Receipt[]): Promise<Outcome> {
  await initialize(db);
  const run = await nextRun(db);
  const findings: Finding[] = [{ check: 'read', level: 'fail', message: reason }];
  await record(db, run, started, 'failed', null, null, 0, reason, receipts, findings);
  return { run, status: 'failed', events: 0, findings };
}

/** Stage, check, and apply a candidate snapshot, all or nothing. */
export async function apply(db: Database, c: Candidate, started: string): Promise<Outcome> {
  await initialize(db);
  const run = await nextRun(db);
  await stage(db, c);
  const { findings, stats } = await check(db, c);
  if (findings.some((f) => f.level === 'fail')) {
    await record(db, run, started, 'blocked', c.fingerprint, stats, 0, 'A quality check failed; the previous snapshot is kept', c.receipts, findings);
    return { run, status: 'blocked', events: 0, findings };
  }
  const [last] = await db.query(`SELECT fingerprint FROM runs WHERE status IN ('applied', 'unchanged') ORDER BY id DESC LIMIT 1`);
  if (last && last.fingerprint === c.fingerprint) {
    await record(db, run, started, 'unchanged', c.fingerprint, stats, 0, 'The source has not changed since the last refresh', c.receipts, findings);
    return { run, status: 'unchanged', events: 0, findings };
  }
  const [prior] = await db.query('SELECT count(*)::INTEGER n FROM listings');
  const baseline = !int(prior!.n);
  await db.run('BEGIN TRANSACTION');
  try {
    // The first snapshot is the baseline: every listing would be "added", which says nothing.
    const events = baseline ? 0 : await diff(db, run, started.slice(0, 10));
    await history(db, started);
    for (const t of ['providers', 'listings', 'models', 'benchmarks']) {
      await db.run(`DELETE FROM ${t}`);
      await db.run(`INSERT INTO ${t} SELECT * FROM stage_${t}`);
    }
    await record(db, run, started, 'applied', c.fingerprint, stats, events, baseline ? 'First snapshot: the baseline later changes are measured against' : `${events} changes`, c.receipts, findings);
    await db.run('COMMIT');
    return { run, status: 'applied', events, findings };
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
}

// Reads for the views. Each is bounded: a view reads summaries and the newest rows, never a table.

export interface Snapshot {
  totals: { providers: number; listings: number; priced: number; models: number; labs: number; attributed: number; benchmarks: number; spans: number; events: number };
  latest: Record<string, unknown> | null;
  applied: Record<string, unknown> | null;
  runs: Record<string, unknown>[];
  findings: Record<string, unknown>[];
  receipts: Record<string, unknown>[];
  recent: Record<string, unknown>[];
  byType: Record<string, unknown>[];
}

export const RECENT = 300, RUNS = 30;

export async function snapshot(db: Database): Promise<Snapshot> {
  await initialize(db);
  const [t] = await db.query(`SELECT (SELECT count(*) FROM providers)::INTEGER providers, (SELECT count(*) FROM listings)::INTEGER listings,
    (SELECT count(*) FROM listings WHERE input IS NOT NULL OR output IS NOT NULL)::INTEGER priced, (SELECT count(*) FROM models)::INTEGER models,
    (SELECT count(DISTINCT lab) FROM models)::INTEGER labs, (SELECT count(*) FROM listings WHERE canonical IS NOT NULL)::INTEGER attributed,
    (SELECT count(*) FROM benchmarks)::INTEGER benchmarks, (SELECT count(*) FROM price_history)::INTEGER spans, (SELECT count(*) FROM events)::INTEGER events`);
  const runs = await db.query(`SELECT id, started_at, finished_at, status, providers, listings, models, events, note FROM runs ORDER BY id DESC LIMIT ${RUNS}`);
  const latest = runs[0] ?? null;
  const [applied] = await db.query(`SELECT id, started_at, finished_at, status, providers, listings, models, events, note FROM runs WHERE status = 'applied' ORDER BY id DESC LIMIT 1`);
  const findings = latest ? await db.query('SELECT check_id, level, message FROM findings WHERE run = ? ORDER BY level, check_id', [int(latest.id)]) : [];
  const receipts = latest ? await db.query('SELECT what, url, pages, rows, total, ms, status FROM receipts WHERE run = ? ORDER BY rowid', [int(latest.id)]) : [];
  const recent = await db.query(`SELECT e.id, e.run, e.day, e.type, e.provider, e.model, e.canonical, e.lab, e.name, e.changes::VARCHAR changes, coalesce(p.name, e.provider) provider_name
    FROM events e LEFT JOIN providers p ON p.id = e.provider ORDER BY e.run DESC, e.type, e.provider, e.model LIMIT ${RECENT}`);
  const byType = applied ? await db.query('SELECT type, count(*)::INTEGER n FROM events WHERE run = ? GROUP BY type ORDER BY n DESC, type', [int(applied.id)]) : [];
  const n = (k: string) => int(t![k]);
  return {
    totals: { providers: n('providers'), listings: n('listings'), priced: n('priced'), models: n('models'), labs: n('labs'), attributed: n('attributed'), benchmarks: n('benchmarks'), spans: n('spans'), events: n('events') },
    latest, applied: applied ?? null, runs, findings, receipts, recent, byType,
  };
}

export const EMPTY: Snapshot = { totals: { providers: 0, listings: 0, priced: 0, models: 0, labs: 0, attributed: 0, benchmarks: 0, spans: 0, events: 0 }, latest: null, applied: null, runs: [], findings: [], receipts: [], recent: [], byType: [] };
