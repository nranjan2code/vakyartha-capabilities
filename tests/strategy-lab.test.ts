import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adjust, backtest, monthly, newBook, prepare, rsi, sma, step, type Bar, type Rules } from "../apps/strategy-lab/engine.ts";
import { bulk, decode, initialize, missing, monthsBefore, saveBars, stockChunk, type Database } from "../apps/strategy-lab/source.ts";
import { handleAction, MAX_UNIVERSE, normalize, surfaceFile, symbols, sync, type Context } from "../apps/strategy-lab/server.ts";

const days = (n: number, from = Date.UTC(2025, 0, 6)) => Array.from({ length: n }, (_, i) => new Date(from + i * 86_400_000).toISOString().slice(0, 10));
const bars = (closes: number[], dates = days(closes.length)): Bar[] => closes.map((c, i) => ({ date: dates[i]!, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1000 }));
const rules = (over: Partial<Rules> = {}): Rules => ({ template: "ma_cross", params: { fast: 2, slow: 3, entryDays: 3, exitDays: 2, rsiDays: 3, rsiBuy: 30, rsiSell: 70, lookback: 3, top: 1, rebalanceDays: 5 }, maxPositions: 1, stopPct: 0, targetPct: 0, costBps: 0, slippageBps: 0, ...over });

test("splits and bonuses scale earlier prices by NSE's factor; factor 1 leaves prices alone", () => {
  const raw = bars([200, 202, 101, 103]);
  const out = adjust(raw, [{ exDate: raw[2]!.date, kind: "BONUS", purpose: "Bonus 1:1", factor: 0.5 }, { exDate: raw[3]!.date, kind: "DIVIDEND", purpose: "", factor: 1 }]);
  assert.deepEqual(out.map((b) => b.close), [100, 101, 101, 103]);
  assert.equal(out[0]!.volume, 2000);
  assert.equal(raw[0]!.close, 200, "stored sessions are never rewritten");
});

test("indicators use only data up to each session", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const r = rsi([1, 2, 3, 4, 5], 3);
  assert.equal(r[2], null); assert.equal(r[3], 100);
});

test("a signal at a close fills at the next open, and a stop gaps to the open", () => {
  // Fast average crosses above slow on index 3; the buy fills on index 4's open.
  const b = bars([10, 9, 8, 12, 13, 13, 13]);
  b[4] = { ...b[4]!, open: 12.5 };
  b[6] = { ...b[6]!, open: 9, low: 8.9, high: 9.2, close: 9 };
  const series = new Map([["X", prepare("X", b, rules({ stopPct: 10 }))]]);
  const book = newBook(10_000);
  let equity = 10_000;
  for (const bar of b) { step(book, rules({ stopPct: 10 }), series, bar.date, equity); equity = book.cash + book.positions.reduce((a, p) => a + p.qty * bar.close, 0); }
  assert.equal(book.fills[0]!.date, b[4]!.date); assert.equal(book.fills[0]!.price, 12.5);
  const exit = book.trades[0]!;
  assert.equal(exit.exitDate, b[6]!.date); assert.equal(exit.exitPrice, 9, "a gap below the stop fills at the open");
  assert.equal(exit.reason, "Stop 10%");
});

test("a backtest compares with the benchmark and reports months outside the run as gaps", () => {
  const d = days(90), b = bars(d.map((_, i) => 100 + i), d);
  const series = new Map([["X", prepare("X", b, rules({ template: "buy_hold" }))]]);
  const r = backtest(rules({ template: "buy_hold", costBps: 10 }), 100_000, series, d, new Map(d.map((x, i) => [x, 1000 + i * 5])));
  assert.equal(r.metrics.trades, 0); assert.equal(r.open.length, 1);
  assert.ok(r.metrics.totalPct > 0 && r.metrics.benchmarkTotalPct! > 0);
  assert.ok(r.metrics.costs > 0);
  const m = monthly(r.curve);
  assert.equal(m[0]!.values[11], null); assert.equal(typeof m[0]!.values[0], "number");
});

test("NSE responses are validated before anything is saved", () => {
  const body = decode({ content: [{ type: "text", text: JSON.stringify({ symbol: "TCS", next_end_date: "2025-01-01", data: [{ symbol: "TCS", series: "EQ", date: "2025-03-03", open: 10, high: 11, low: 9, close: 10.5, volume: 100 }, { symbol: "TCS", series: "T0", date: "2025-03-03", open: 1, high: 1, low: 1, close: 1, volume: 1 }] }) }] });
  const c = stockChunk(body, "TCS");
  assert.equal(c.bars.length, 1); assert.equal(c.next, "2025-01-01");
  assert.throws(() => stockChunk({ ...body, symbol: "INFY" }, "TCS"), /mismatched/);
  assert.throws(() => bulk({ quotes: [{ symbol: "TCS", date: "2025-03-03", open: 10, high: 9, low: 9.5, close: 10, volume: 1 }] }), /Invalid NSE OHLCV/);
  assert.throws(() => decode({ text: JSON.stringify({ error: "Symbol not found: X", hint: "y" }) }), /NSE: Symbol not found/);
});

test("Strategy Lab starts with examples, validates rule edits and keeps surface.json in step", async () => {
  const database = { maxBytes: 1048576, async run() {}, async query() { return []; } };
  const ctx: Context = { state: {}, database, callTool: async () => { throw new Error("no reads in this test"); } };
  normalize(ctx.state);
  assert.equal(ctx.state.strategies!.length, 3); assert.equal(ctx.state.universe!.length, 10);
  await handleAction("/draft/params/fast", 80, ctx);
  await assert.rejects(handleAction("save_strategy", null, ctx, "save_strategy"), /fast average must be shorter/);
  await handleAction("/draft/params/fast", 10, ctx);
  await handleAction("/draft/symbols", "RELIANCE, NOTLISTED", ctx);
  await assert.rejects(handleAction("save_strategy", null, ctx, "save_strategy"), /NOTLISTED is not in the data universe/);
  await handleAction("/draft/symbols", "RELIANCE, TCS", ctx);
  await handleAction("save_strategy", null, ctx, "save_strategy");
  assert.equal(ctx.state.strategies![0]!.rules.params.fast, 10);
  assert.deepEqual(ctx.state.strategies![0]!.symbols, ["RELIANCE", "TCS"]);
  assert.deepEqual(JSON.parse(readFileSync(new URL("../apps/strategy-lab/surface.json", import.meta.url), "utf8")), JSON.parse(JSON.stringify(surfaceFile())));
});

// The saved-history contract, against a database that records its statements.
const app = JSON.parse(readFileSync(new URL("../apps/strategy-lab/app.json", import.meta.url), "utf8"));
const MIB = 1048576;

function recording(oldSchema = false): Database & { sql: string[] } {
  const sql: string[] = [];
  return {
    sql, maxBytes: 256 * MIB,
    async run(statement) { sql.push(statement); },
    async query(statement) {
      sql.push(statement);
      if (statement.includes('duckdb_tables')) return oldSchema ? [{ table_name: 'bars' }] : [];
      if (statement.includes('pragma_database_size')) return [{ total_blocks: 240, block_size: 262144 }];
      return [];
    },
  };
}
const bar = { date: '2026-11-02', open: 100, high: 110, low: 90, close: 105, volume: 1234 };

test('the app declares its database size and takes up to fifty stocks', () => {
  assert.equal(app.entitlements.storage.databaseMiB, 256);
  assert.equal(MAX_UNIVERSE, 50);
  const fifty = Array.from({ length: 50 }, (_, i) => `SYM${String.fromCharCode(65 + i % 26)}${i}`);
  assert.equal(symbols(fifty).length, 50);
});

test('sessions keep volume, one row per symbol and date, and the latest reading wins', async () => {
  const db = recording();
  await initialize(db);
  const create = db.sql.find((s) => s.includes('CREATE TABLE IF NOT EXISTS bars'))!;
  assert.match(create, /volume DOUBLE/);
  assert.match(create, /PRIMARY KEY\(symbol, date\)/);
  const values: unknown[][] = [];
  const run = db.run;
  db.run = async (s, v) => { if (v) values.push(v); await run(s, v); };
  await saveBars(db, 'INFY', [bar]);
  assert.ok(db.sql.some((s) => s.startsWith('INSERT OR REPLACE INTO bars')));
  assert.deepEqual(values[0], ['INFY', bar.date, 100, 110, 90, 105, 1234]);
});

test('a database from the earlier package without volume is replaced', async () => {
  const db = recording(true);
  await initialize(db);
  assert.ok(db.sql.indexOf('DROP TABLE bars') < db.sql.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS bars')));
  assert.ok(db.sql.includes('DROP TABLE bars'));
  const fresh = recording();
  await initialize(fresh);
  assert.ok(!fresh.sql.includes('DROP TABLE bars'));
});

test('storage is shown against the declared limit, not a fixed one', async () => {
  const context = { state: normalize({}), database: recording(), callTool: async () => { throw new Error('no reads'); }, now: () => new Date('2026-11-02T06:00:00Z') };
  const result = await sync(context);
  const text = JSON.stringify(result);
  assert.match(text, /storage 60 MiB of 256 MiB/);
  assert.doesNotMatch(text, /2 MiB/);
  assert.equal(context.state.storage, 60 * MIB);
});

/** An in-memory archive answering the statements source.ts sends, so a sync can run end to end. */
function archive(): Database & { bars: Map<string, Bar & { symbol: string }>; spans: Set<string> } {
  const barsBy = new Map<string, Bar & { symbol: string }>(), spans = new Set<string>();
  return {
    maxBytes: 256 * MIB, bars: barsBy, spans,
    async run(sql, v = []) {
      if (sql.startsWith('INSERT OR REPLACE INTO bars')) barsBy.set(`${v[0]}|${v[1]}`, { symbol: String(v[0]), date: String(v[1]), open: Number(v[2]), high: Number(v[3]), low: Number(v[4]), close: Number(v[5]), volume: Number(v[6]) });
      else if (sql.startsWith('INSERT OR REPLACE INTO spans')) { for (const k of [...spans]) if (k.startsWith(`${v[0]}|${v[1]}|${v[2]}|`)) spans.delete(k); spans.add(`${v[0]}|${v[1]}|${v[2]}|${v[3]}|${v[4]}`); }
      else if (sql.startsWith('DELETE FROM spans')) { for (const k of [...spans]) if (k.startsWith(`${v[0]}|`)) spans.delete(k); }
      else if (sql.startsWith('DELETE FROM bars')) { for (const k of [...barsBy.keys()]) if (k.startsWith(`${v[0]}|`)) barsBy.delete(k); }
    },
    async query(sql, v = []) {
      const all = [...barsBy.values()];
      if (sql.includes('FROM spans')) return [...spans].map((k) => k.split('|')).filter(([, , , n, at]) => Number(n) > 0 || at! >= String(v[0])).map(([symbol, from_date, to_date]) => ({ symbol, from_date, to_date })).sort((a, b) => `${a.symbol}|${a.from_date}`.localeCompare(`${b.symbol}|${b.from_date}`));
      if (sql.includes('GROUP BY symbol')) return [...new Set(all.map((b) => b.symbol))].map((symbol) => { const d = all.filter((b) => b.symbol === symbol).map((b) => b.date).sort(); return { symbol, first: d[0], last: d.at(-1), sessions: d.length }; });
      if (sql.includes('SELECT DISTINCT date')) return [...new Set(all.map((b) => b.date))].sort().reverse().slice(0, Number(/LIMIT (\d+)/.exec(sql)![1])).map((date) => ({ date }));
      if (sql.includes('FROM bars WHERE symbol')) return all.filter((b) => b.symbol === v[0]).sort((a, b) => a.date.localeCompare(b.date));
      if (sql.includes('pragma_database_size')) return [{ total_blocks: 1, block_size: 262144 }];
      return [];
    },
  };
}
/** NSE as it answers: weekday sessions inside its archive, its error sentence (with hints) outside it. */
function nse(archiveFrom: Record<string, string>, calls: { name: string; args: Record<string, unknown> }[] = []) {
  const weekdays = (from: string, to: string) => { const out: string[] = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) { const d = new Date(t); if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); } return out; };
  const back = (on: string, m: number) => { const d = new Date(`${on}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };
  return async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'nse__get_corporate_actions') return { text: JSON.stringify({ symbol: args.symbol, actions: [] }) };
    if (name === 'nse__get_bulk_quote') return { text: JSON.stringify({ quotes: [] }) };
    const key = String(args.symbol ?? `INDEX:${args.indexName}`), end = String(args.endDate), from = back(end, Number(args.months));
    const start = archiveFrom[key], dates = start ? weekdays(from > start ? from : start, end > '2026-11-17' ? '2026-11-17' : end) : [];
    if (!dates.length) return { text: JSON.stringify({ error: `No data for ${key}`, similar: ['X'], hint: 'Try another name' }) };
    const row = (date: string) => ({ symbol: args.symbol, series: 'EQ', indexName: args.indexName, date, open: 100, high: 101, low: 99, close: 100, volume: 10 });
    return { text: JSON.stringify({ ...(args.symbol ? { symbol: args.symbol } : { index: args.indexName }), data: dates.map(row), next_end_date: new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) }) };
  };
}
const steps = async (context: Context, n: number) => { for (let i = 0; i < n; i++) await sync(context); };

test('NSE answers with hints are its own answer, and what is missing comes from the answered ranges', () => {
  assert.throws(() => decode({ text: JSON.stringify({ error: 'No data for index', similar_indices: ['NIFTY 50'], hint: 'list names' }) }), /NSE: No data/);
  assert.deepEqual(missing([{ from: '2024-01-01', to: '2024-03-31' }, { from: '2024-06-01', to: '2024-12-31' }], '2023-11-17', '2026-11-17'),
    [{ from: '2023-11-17', to: '2023-12-31' }, { from: '2024-04-01', to: '2024-05-31' }, { from: '2025-01-01', to: '2026-11-17' }]);
  assert.equal(monthsBefore('2026-05-31', 3), '2026-02-28');
});

test('a benchmark whose archive is shorter completes, and stocks fill five years around holes and lost sessions', async () => {
  const db = archive(), calls: { name: string; args: Record<string, unknown> }[] = [];
  const state = normalize({ universe: ['INFY', 'NOPE'] });
  // An earlier database kept only an old stretch of INFY and no record of what was read.
  for (const d of ['2022-03-01', '2022-03-02']) db.bars.set(`INFY|${d}`, { symbol: 'INFY', date: d, open: 1, high: 1, low: 1, close: 1, volume: 1 });
  const context: Context = { state, database: db, callTool: nse({ 'INDEX:Nifty 50': '2024-10-07', INFY: '2021-11-17' }, calls), now: () => new Date('2026-11-17T12:00:00Z') };
  await steps(context, 12);
  const bench = state.covered!['INDEX:Nifty 50']!, infy = state.covered!.INFY!;
  assert.ok(bench.complete && bench.first === '2024-10-07', 'the benchmark stops where NSE has it, without retrying the same read');
  assert.ok(infy.complete && infy.first <= '2021-11-18' && infy.last === '2026-11-17', 'INFY is read over its whole window, the lost recent years included');
  assert.equal(state.covered!.NOPE!.complete && state.covered!.NOPE!.sessions, 0);
  assert.equal(calls.filter((c) => c.args.symbol === 'NOPE').length, 1, 'an unknown symbol is asked once');
  const before = calls.length; await sync(context);
  assert.ok(calls.slice(before).every((c) => c.name !== 'nse__get_stock_history'), 'a complete archive makes no history reads');
  // NSE's archive changes, so a range it had nothing for is asked again a week later, and only that range.
  const week = calls.length; context.now = () => new Date('2026-11-25T12:00:00Z');
  await sync(context);
  const again = calls.slice(week).filter((c) => c.name === 'nse__get_stock_history');
  assert.ok(again.some((c) => c.args.symbol === 'NOPE') && again.every((c) => c.args.symbol === 'NOPE' || String(c.args.endDate) < '2021-12-01' || String(c.args.endDate) >= '2026-11-17'), JSON.stringify(again.map((c) => c.args)));
  // Sync again asks for the whole window again.
  await handleAction('st-retry', { symbol: 'INFY' }, context, 'retry_symbol');
  assert.ok(calls.slice(before).some((c) => c.args.symbol === 'INFY'));
});

test('a backtest runs on the stocks\' own sessions and compares the benchmark over its span', () => {
  const d = days(400), late = d.slice(200);
  const series = new Map([['A', prepare('A', bars(d.map((_, i) => 100 + i)), rules({ template: 'buy_hold' }))]]);
  const r = backtest(rules({ template: 'buy_hold' }), 100_000, series, d, new Map(late.map((x, i) => [x, 1000 + i])));
  assert.equal(r.curve.length, 400);
  assert.equal(r.metrics.benchmarkFrom, late[0]);
  const at = r.curve.find((p) => p.date === late[0])!;
  assert.equal(Math.round(at.benchmark!), Math.round(at.equity));
  assert.ok(r.metrics.sameSpanCagrPct != null && r.metrics.benchmarkCagrPct != null);
});
