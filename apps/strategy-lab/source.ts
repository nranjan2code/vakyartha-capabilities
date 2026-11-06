// NSE responses in their documented shapes, validated before anything is stored,
// and the DuckDB archive that owns every saved session.
import type { Action, Bar } from './engine.ts';

type O = Record<string, unknown>;
export function object(value: unknown): O {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an NSE object');
  return value as O;
}
/** Tool output (text or object) as the NSE body; NSE's own error sentence when it sent one. */
export function decode(value: unknown): O {
  if (typeof value === 'string') return decode({ text: value });
  const result = object(value);
  if (result.isError) throw new Error('NSE returned an error');
  const content = Array.isArray(result.content) ? (result.content as O[]).find((c) => typeof c?.text === 'string')?.text : undefined;
  const text = typeof result.text === 'string' ? result.text : content;
  const body = typeof text === 'string' ? object(JSON.parse(text)) : result;
  if (typeof body.error === 'string' && Object.keys(body).length <= 2) throw new NseError(body.error.slice(0, 200));
  return body;
}
/** An answer from NSE itself (an unknown symbol, a date before its window), not a failed read. */
export class NseError extends Error { constructor(message: string) { super(`NSE: ${message}`); } }

const num = (v: unknown) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Missing or invalid NSE number'); return v; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown) => { if (typeof v !== 'string' || !DATE.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new Error('Invalid NSE date'); return v; };
function bar(r: O): Bar {
  const b = { date: date(r.date), open: num(r.open), high: num(r.high), low: num(r.low), close: num(r.close), volume: num(r.volume) };
  if (b.low <= 0 || b.low > Math.min(b.open, b.close) || b.high < Math.max(b.open, b.close) || b.volume < 0 || !Number.isSafeInteger(b.volume)) throw new Error(`Invalid NSE OHLCV on ${b.date}`);
  return b;
}
function unique(bars: Bar[]) {
  const seen = new Set<string>();
  for (const b of bars) { if (seen.has(b.date)) throw new Error(`Duplicate NSE session ${b.date}`); seen.add(b.date); }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

/** One chunk of daily EQ history and the end date of the next older chunk (none at the window's start). */
export function stockChunk(raw: O, symbol: string): { bars: Bar[]; next: string | null } {
  if (raw.symbol !== symbol || !Array.isArray(raw.data) || raw.data.length > 80) throw new Error('Oversized or mismatched NSE history');
  const rows = (raw.data as unknown[]).map(object);
  if (rows.some((r) => r.symbol !== symbol)) throw new Error('NSE history mixes symbols');
  // Other settlement series (such as T0) trade beside EQ on some days; the archive keeps EQ.
  const bars = unique(rows.filter((r) => r.series === 'EQ').map(bar));
  const next = typeof raw.next_end_date === 'string' && DATE.test(raw.next_end_date) ? raw.next_end_date : null;
  return { bars, next };
}
/** One chunk of an index's daily history. */
export function indexChunk(raw: O, name: string): { bars: Bar[]; next: string | null } {
  if (typeof raw.index !== 'string' || raw.index.toLowerCase() !== name.toLowerCase() || !Array.isArray(raw.data) || raw.data.length > 300) throw new Error('Oversized or mismatched NSE index history');
  const bars = unique((raw.data as unknown[]).map(object).map((r) => {
    const b = { date: date(r.date), open: num(r.open), high: num(r.high), low: num(r.low), close: num(r.close), volume: typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.max(0, Math.round(r.volume)) : 0 };
    if (b.close <= 0 || b.low > b.high) throw new Error(`Invalid NSE index level on ${b.date}`);
    return b;
  }));
  const next = typeof raw.next_end_date === 'string' && DATE.test(raw.next_end_date) ? raw.next_end_date : null;
  return { bars, next };
}
/** Corporate actions with NSE's published price adjustment factor. */
export function actions(raw: O, symbol: string): Action[] {
  if (raw.symbol !== symbol || !Array.isArray(raw.actions) || raw.actions.length > 200) throw new Error('Mismatched NSE corporate actions');
  return (raw.actions as unknown[]).map(object).map((a) => {
    const factor = num(a.adjustmentFactor);
    if (factor <= 0 || factor > 50) throw new Error('Invalid NSE adjustment factor');
    return { exDate: date(a.exDate), kind: String(a.actionType ?? 'OTHER').slice(0, 30), purpose: String(a.purpose ?? '').slice(0, 160), factor };
  });
}
/** The latest session of up to 50 stocks, with the date it belongs to. */
export function bulk(raw: O): Map<string, Bar> {
  if (!Array.isArray(raw.quotes) || raw.quotes.length > 50) throw new Error('Invalid NSE bulk quote');
  const out = new Map<string, Bar>();
  for (const q of (raw.quotes as unknown[]).map(object)) {
    if (typeof q.symbol !== 'string') throw new Error('NSE quote without a symbol');
    out.set(q.symbol, bar(q));
  }
  return out;
}

// --- the archive ---------------------------------------------------------------------

export interface Database {
  run(sql: string, values?: (string | number | null)[]): Promise<void>;
  query(sql: string, values?: (string | number | null)[]): Promise<Record<string, unknown>[]>;
}
/** Reads run four at a time, but one database session takes one transaction at a time. */
const queues = new WeakMap<Database, Promise<unknown>>();
function serial<T>(db: Database, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(db) ?? Promise.resolve()).then(work, work);
  queues.set(db, next.catch(() => undefined));
  return next;
}
export async function initialize(db: Database) {
  await db.run('CREATE TABLE IF NOT EXISTS bars(symbol VARCHAR, date VARCHAR, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, volume DOUBLE, PRIMARY KEY(symbol, date))');
  await db.run('CREATE TABLE IF NOT EXISTS actions(symbol VARCHAR, ex_date VARCHAR, kind VARCHAR, purpose VARCHAR, factor DOUBLE, PRIMARY KEY(symbol, ex_date, kind))');
}
/** Insert or replace sessions; NSE's latest reading of a day wins. */
export async function saveBars(db: Database, symbol: string, bars: Bar[]) {
  if (!bars.length) return;
  return serial(db, async () => {
  await db.run('BEGIN TRANSACTION');
  try {
    for (const b of bars) await db.run('INSERT OR REPLACE INTO bars VALUES(?,?,?,?,?,?,?)', [symbol, b.date, b.open, b.high, b.low, b.close, b.volume]);
    await db.run('COMMIT');
  } catch (e) { await db.run('ROLLBACK'); throw e; }
  });
}
export async function saveActions(db: Database, symbol: string, list: Action[]) {
  return serial(db, async () => {
  await db.run('BEGIN TRANSACTION');
  try {
    await db.run('DELETE FROM actions WHERE symbol=?', [symbol]);
    for (const a of list) await db.run('INSERT OR REPLACE INTO actions VALUES(?,?,?,?,?)', [symbol, a.exDate, a.kind, a.purpose, a.factor]);
    await db.run('COMMIT');
  } catch (e) { await db.run('ROLLBACK'); throw e; }
  });
}
/** Saved sessions oldest first. One symbol is about 1,250 rows, inside the query bound. */
export async function loadBars(db: Database, symbol: string): Promise<Bar[]> {
  return (await db.query('SELECT date, open, high, low, close, volume FROM bars WHERE symbol=? ORDER BY date', [symbol])) as unknown as Bar[];
}
export async function loadActions(db: Database, symbol: string): Promise<Action[]> {
  return ((await db.query('SELECT ex_date, kind, purpose, factor FROM actions WHERE symbol=? ORDER BY ex_date', [symbol])) as { ex_date: string; kind: string; purpose: string; factor: number }[])
    .map((a) => ({ exDate: a.ex_date, kind: a.kind, purpose: a.purpose, factor: a.factor }));
}
export interface Coverage { symbol: string; first: string; last: string; sessions: number }
export async function coverage(db: Database): Promise<Map<string, Coverage>> {
  const rows = await db.query('SELECT symbol, min(date) AS first, max(date) AS last, count(*)::INTEGER AS sessions FROM bars GROUP BY symbol');
  return new Map(rows.map((r) => [String(r.symbol), { symbol: String(r.symbol), first: String(r.first), last: String(r.last), sessions: Number(r.sessions) }]));
}
export async function forget(db: Database, symbol: string) {
  await db.run('DELETE FROM bars WHERE symbol=?', [symbol]);
  await db.run('DELETE FROM actions WHERE symbol=?', [symbol]);
}
