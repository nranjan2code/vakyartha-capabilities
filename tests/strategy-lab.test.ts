import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adjust, backtest, monthly, newBook, prepare, rsi, sma, step, type Bar, type Rules } from "../apps/strategy-lab/engine.ts";
import { bulk, decode, stockChunk } from "../apps/strategy-lab/source.ts";
import { handleAction, normalize, surfaceFile, type Context } from "../apps/strategy-lab/server.ts";

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
  const database = { async run() {}, async query() { return []; } };
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
