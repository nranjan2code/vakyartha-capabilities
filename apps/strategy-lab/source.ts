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
  // Whole paise, real dates, no volume and no index, appended only: with the host's
  // checkpoint after every command, five years of 15 stocks measured 1.5 MiB of the
  // 2 MiB database snapshot (the file grows in 256 KiB blocks).
  await db.run('CREATE TABLE IF NOT EXISTS bars(symbol VARCHAR, date DATE, open INTEGER, high INTEGER, low INTEGER, close INTEGER)');
  await db.run('CREATE TABLE IF NOT EXISTS actions(symbol VARCHAR, ex_date VARCHAR, kind VARCHAR, purpose VARCHAR, factor DOUBLE, PRIMARY KEY(symbol, ex_date, kind))');
}
const paise = (rupees: number) => Math.round(rupees * 100);
/** Add sessions not saved yet; a saved session keeps its first validated reading. Appending
 * only avoids the deleted blocks a file never gives back. */
export async function saveBars(db: Database, symbol: string, bars: Bar[]) {
  if (!bars.length) return;
  return serial(db, async () => {
  await db.run('BEGIN TRANSACTION');
  try {
    const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
    const saved = new Set(((await db.query("SELECT strftime(date, '%Y-%m-%d') AS d FROM bars WHERE symbol=? AND date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)", [symbol, sorted[0]!.date, sorted.at(-1)!.date])) as { d: string }[]).map((r) => r.d));
    const fresh = sorted.filter((b) => !saved.has(b.date));
    for (let i = 0; i < fresh.length; i += 100) {
      const part = fresh.slice(i, i + 100);
      await db.run(`INSERT INTO bars VALUES ${part.map(() => '(?,CAST(? AS DATE),?,?,?,?)').join(',')}`, part.flatMap((b) => [symbol, b.date, paise(b.open), paise(b.high), paise(b.low), paise(b.close)]));
    }
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
  // Volume is validated on arrival but not kept: no rule uses it, and it is the costliest column.
  return ((await db.query("SELECT strftime(date, '%Y-%m-%d') AS date, open, high, low, close FROM bars WHERE symbol=? ORDER BY date", [symbol])) as Record<string, unknown>[])
    .map((r) => ({ date: String(r.date), open: Number(r.open) / 100, high: Number(r.high) / 100, low: Number(r.low) / 100, close: Number(r.close) / 100, volume: 0 }));
}
export async function loadActions(db: Database, symbol: string): Promise<Action[]> {
  return ((await db.query('SELECT ex_date, kind, purpose, factor FROM actions WHERE symbol=? ORDER BY ex_date', [symbol])) as { ex_date: string; kind: string; purpose: string; factor: number }[])
    .map((a) => ({ exDate: a.ex_date, kind: a.kind, purpose: a.purpose, factor: a.factor }));
}
export interface Coverage { symbol: string; first: string; last: string; sessions: number }
export async function coverage(db: Database): Promise<Map<string, Coverage>> {
  const rows = await db.query("SELECT symbol, strftime(min(date), '%Y-%m-%d') AS first, strftime(max(date), '%Y-%m-%d') AS last, count(*)::INTEGER AS sessions FROM bars GROUP BY symbol");
  return new Map(rows.map((r) => [String(r.symbol), { symbol: String(r.symbol), first: String(r.first), last: String(r.last), sessions: Number(r.sessions) }]));
}
/** The database file's size in blocks, free ones included; the host refuses a snapshot over 2 MiB. */
export const STORAGE_LIMIT = 2 * 1024 * 1024, STORAGE_GUARD = 1.75 * 1024 * 1024;
export async function storageUsed(db: Database): Promise<number> {
  // Recent writes sit in the write-ahead log until a checkpoint; measure the file they become.
  await serial(db, () => db.run('CHECKPOINT'));
  const r = (await db.query('SELECT total_blocks, block_size FROM pragma_database_size()'))[0];
  return r ? Number(r.total_blocks) * Number(r.block_size) : 0;
}
export async function forget(db: Database, symbol: string) {
  await db.run('DELETE FROM bars WHERE symbol=?', [symbol]);
  await db.run('DELETE FROM actions WHERE symbol=?', [symbol]);
}
