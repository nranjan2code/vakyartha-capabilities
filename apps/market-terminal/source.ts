import type { Bar } from './analytics.ts';
type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an NSE object');
  return value as ObjectValue;
}
export function decode(value: unknown): ObjectValue {
  if (typeof value === 'string') return decode({ text: value });
  const result = object(value);
  if (result.isError) throw new Error('NSE returned an error');
  const body = typeof result.text === 'string' ? object(JSON.parse(result.text)) : result;
  // NSE reports an unknown symbol or index as {"error": "..."}; show its own sentence.
  if (typeof body.error === 'string' && Object.keys(body).length <= 2) throw new Error(`NSE: ${body.error.slice(0, 200)}`);
  return body;
}
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Missing or invalid NSE numeric field');
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Missing or invalid NSE text field');
  return value;
}
export function history(raw: ObjectValue, symbol: string): Bar[] {
  if (raw.symbol !== symbol || !Array.isArray(raw.data) || !raw.data.length || raw.data.length > 80) throw new Error('Empty, oversized or mismatched NSE history');
  // Other settlement series (such as T0) trade beside EQ on some days; the chart is the EQ series only.
  const rows = raw.data.map(object).filter((r) => r.series === 'EQ' || r.symbol !== symbol);
  if (!rows.length) throw new Error('NSE history has no EQ sessions');
  const dates = new Set<string>();
  const bars = rows.map(r => {
    const date = text(r.date);
    if (r.symbol !== symbol || r.series !== 'EQ' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0,10) !== date || dates.has(date)) throw new Error('Invalid or duplicate NSE history identity');
    dates.add(date);
    const b = { date, open: number(r.open), high: number(r.high), low: number(r.low), close: number(r.close), volume: number(r.volume) };
    if (b.low <= 0 || b.low > Math.min(b.open,b.close) || b.high < Math.max(b.open,b.close) || b.low > b.high || b.volume < 0 || !Number.isSafeInteger(b.volume)) throw new Error('Invalid NSE OHLCV observation');
    return b;
  }).sort((a,b)=>a.date.localeCompare(b.date));
  return bars;
}
// NSE publishes rounded two-decimal levels; low-priced indices magnify the
// implied return uncertainty, while high-priced stocks have closing auction VWAP
// variance between previous close and intraday base. Preserve the published percentage
// and validate mutual consistency with published absolute change and price interval.
function sessionChange(last: number, previous: number, reported: unknown, absChange?: unknown): { change: number; base: number } {
  const change = number(reported);
  if (previous <= 0.005 || last <= 0.005) throw new Error('Inconsistent NSE session return');

  // 1. When explicit absolute change is published (e.g. stock or index quote change),
  // verify reported percentage against (absChange / previous) * 100 within rounding precision,
  // and ensure absChange aligns with (last - previous) within closing auction settlement spread.
  if (typeof absChange === 'number' && Number.isFinite(absChange)) {
    const returnFromAbs = (absChange / previous) * 100;
    if (Math.abs(change - returnFromAbs) <= 0.05) {
      const impliedDiff = last - previous;
      if (Math.abs(absChange - impliedDiff) <= Math.max(1.0, previous * 0.02)) {
        return { change, base: previous };
      }
    }
  }

  // 2. Implied return check against (last / previous - 1) * 100:
  // Combines published percentage rounding precision (+-0.02%) with price-level rounding.
  const implied = ((last / previous) - 1) * 100;
  const priceUncertainty = (0.01 / previous) * 100;
  const tolerance = Math.max(0.15, priceUncertainty + 0.02);

  if (Math.abs(change - implied) <= tolerance) return { change, base: previous };

  // 3. Adjusted base: around an ex-date NSE adjusts the base behind its change figures but
  // leaves the previous close unadjusted. When the published change and percentage agree
  // with each other on last - change, that base is the one the return is measured from.
  if (typeof absChange === 'number' && Number.isFinite(absChange)) {
    const base = last - absChange;
    if (base > 0.005 && Math.abs(change - (absChange / base) * 100) <= 0.05) return { change, base: Number(base.toFixed(2)) };
  }
  throw new Error('Inconsistent NSE session return');
}
export function quote(raw: ObjectValue, symbol: string) {
  const s = object(raw.stock);
  if (s.symbol !== symbol || s.series !== 'EQ') throw new Error('NSE quote identity mismatch');
  const last = number(s.lastTradedPrice), previous = number(s.preClosePrice);
  if (last <= 0 || previous <= 0) throw new Error('Invalid NSE quote price');
  const { change: changePct, base } = sessionChange(last, previous, s.perChange, s.change);
  return { symbol, last, previous: base, changePct, open: number(s.openPrice), high: number(s.highPrice), low: number(s.lowPrice), volume: number(s.volume), exchangeAt: text(s.latestTimestamp), updatedAt: text(raw.updatedAt) };
}
export function indices(raw: ObjectValue, group: string) {
  const rows = object(raw.indices)[group];
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error('NSE index group unavailable');
  const names = new Set<string>();
  return rows.map(v=>{
    const r=object(v), label=text(r.indexName), last=number(r.last), previous=number(r.previousClose);
    if (names.has(label) || last<=0 || previous<=0) throw new Error('Invalid NSE index identity or price');
    names.add(label);
    const { change: changePct }=sessionChange(last, previous, r.percChange, r.change);
    return { label, last, changePct, exchangeAt: text(r.timeVal) };
  }).sort((a,b)=>b.changePct-a.changePct);
}

// --- extended reads -----------------------------------------------------------------
// Each parser checks the documented shape of one NSE tool and returns only the
// fields the views use; a value that fails its check is never shown.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function day(value: unknown): string {
  const d = text(value);
  if (!DAY.test(d) || new Date(d).toISOString().slice(0, 10) !== d) throw new Error('Invalid NSE date');
  return d;
}
const optional = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const list = (value: unknown, max: number, what: string) => {
  if (!Array.isArray(value) || value.length > max) throw new Error(`NSE ${what} unavailable or oversized`);
  return value.map(object);
};
const GROUPS = ['derivatives', 'broad', 'sectoral', 'strategy', 'thematic', 'fixed_income'] as const;
export type Group = typeof GROUPS[number];

/** Every live index group in one read; a row whose published change is inconsistent is dropped, not repaired. */
export function allIndices(raw: ObjectValue) {
  const groups = object(raw.indices), seen = new Set<string>();
  const rows: { label: string; group: Group; last: number; previous: number; changePct: number; open: number | null; high: number | null; low: number | null; exchangeAt: string }[] = [];
  const diagnostics: string[] = [];
  let dropped = 0;
  for (const group of GROUPS) {
    for (const r of list(groups[group] ?? [], 120, 'index group')) {
      try {
        const label = text(r.indexName), last = number(r.last), previous = number(r.previousClose);
        if (seen.has(label) || last <= 0 || previous <= 0) continue;
        rows.push({ label, group, last, ...(({ change, base }) => ({ previous: base, changePct: change }))(sessionChange(last, previous, r.percChange, r.change)), open: optional(r.open), high: optional(r.high), low: optional(r.low), exchangeAt: text(r.timeVal) });
        seen.add(label);
      } catch (e) {
        dropped++;
        if (diagnostics.length < 3) {
          const label = typeof r.indexName === 'string' ? r.indexName.slice(0, 60) : 'index row';
          const message = e instanceof Error ? e.message : 'Invalid NSE index row';
          diagnostics.push(`${label}: ${message}`);
        }
      }
    }
  }
  if (!rows.length) throw new Error('NSE returned no usable indices');
  return { rows, dropped, diagnostics, sourceAt: `${text(raw.nseTimestamp)} IST` };
}

const SYMBOL = /^[A-Z0-9][A-Z0-9&.-]{0,24}$/;
const symbolOf = (value: unknown) => { const s = text(value); if (!SYMBOL.test(s)) throw new Error('Invalid NSE symbol'); return s; };

/** Live gainers and losers for a segment (turnover and quantity stay as NSE's published lakh/crore text). */
export function movers(raw: ObjectValue) {
  const row = (r: ObjectValue) => {
    const last = number(r.ltp), previous = number(r.prev_price);
    if (last <= 0 || previous <= 0) throw new Error('Invalid NSE mover price');
    return { symbol: symbolOf(r.symbol), last, previous, changePct: sessionChange(last, previous, r.perChange).change, quantity: typeof r.trade_quantity === 'string' ? r.trade_quantity.slice(0, 20) : '', turnover: typeof r.turnover === 'string' ? r.turnover.slice(0, 20) : '' };
  };
  return { segment: text(raw.segment), at: text(raw.gainersUpdatedAt), gainers: list(raw.gainers, 50, 'gainers').map(row), losers: list(raw.losers, 50, 'losers').map(row) };
}

/** Market mood: benchmark closes, stock and index breadth, India VIX and its one-year percentile. */
export function mood(raw: ObjectValue) {
  const breadth = (b: ObjectValue) => {
    const up = number(b.up), down = number(b.down), unchanged = number(b.unchanged);
    if (![up, down, unchanged].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid NSE breadth');
    return { up, down, unchanged, reading: text(b.reading) };
  };
  const vix = object(raw.india_vix), range = object(vix.range);
  const percentile = number(range.percentile);
  if (percentile < 0 || percentile > 100) throw new Error('Invalid India VIX percentile');
  return {
    date: day(raw.date),
    benchmarks: Object.entries(object(raw.benchmarks)).slice(0, 12).map(([label, v]) => ({ label, close: number(object(v).close), changePct: number(object(v).change_pct) })),
    stocks: breadth(object(raw.stock_breadth)), indices: breadth(object(raw.index_breadth)),
    vix: { level: number(vix.level), change: number(vix.change_1d_pct), week: optional(object(vix.vs_1w_ago ?? {}).change_pct), month: optional(object(vix.vs_1m_ago ?? {}).change_pct), percentile, min: number(range.min), max: number(range.max), mean: number(range.mean), from: day(range.window_from) },
  };
}

/** Latest end-of-day closes for many symbols in one read. */
export function bulk(raw: ObjectValue, wanted: string[]) {
  const out: Record<string, { symbol: string; last: number; previous: number; changePct: number; open: number; high: number; low: number; volume: number; date: string }> = {};
  for (const r of list(raw.quotes, 50, 'bulk quotes')) {
    const symbol = symbolOf(r.symbol);
    if (!wanted.includes(symbol)) continue;
    const last = number(r.close), previous = number(r.prev_close);
    if (last <= 0 || previous <= 0) continue;
    out[symbol] = { symbol, last, previous, changePct: sessionChange(last, previous, r.pct_change).change, open: number(r.open), high: number(r.high), low: number(r.low), volume: number(r.volume), date: day(r.date) };
  }
  return out;
}

/** Most traded stocks on the latest session by value or quantity. */
export function active(raw: ObjectValue) {
  return { date: day(raw.date), rows: list(raw.stocks, 50, 'active stocks').map((r) => ({ symbol: symbolOf(r.symbol), close: number(r.close), changePct: number(r.pct_change), volume: number(r.volume), value: optional(r.traded_value) })) };
}

/** Best and worst indices over a period, close to close. */
export function indexMovers(raw: ObjectValue) {
  const row = (r: ObjectValue) => ({ label: text(r.index), close: number(r.close), returnPct: number(r.return_pct) });
  return { date: day(raw.date), period: text(raw.period), base: typeof raw.base_date === 'string' ? day(raw.base_date) : null, gainers: list(raw.gainers, 50, 'index gainers').map(row), losers: list(raw.losers, 50, 'index losers').map(row) };
}

/** Symbol search: matches with their last close. */
export function search(raw: ObjectValue) {
  return list(raw.results, 60, 'search results').map((r) => ({ symbol: symbolOf(r.symbol), close: optional(r.last_close), changePct: optional(r.pct_change), date: typeof r.last_date === 'string' && DAY.test(r.last_date) ? r.last_date : '' }));
}

/** 52-week range from end-of-day closes. */
export function range52(raw: ObjectValue, symbol: string) {
  if (raw.symbol !== symbol) throw new Error('NSE 52-week identity mismatch');
  const high = number(raw['52w_high']), low = number(raw['52w_low']), position = number(raw.position_in_range_pct);
  if (low <= 0 || high < low || position < 0 || position > 100) throw new Error('Invalid NSE 52-week range');
  return { high, highDate: day(raw['52w_high_date']), low, lowDate: day(raw['52w_low_date']), close: number(raw.last_close), position, fromHigh: number(raw.from_52w_high_pct), fromLow: number(raw.from_52w_low_pct) };
}

/** Dividends, splits, bonuses and rights with their ex-dates. */
export function corporateActions(raw: ObjectValue, symbol: string) {
  if (raw.symbol !== symbol) throw new Error('NSE corporate action identity mismatch');
  return list(raw.actions, 200, 'corporate actions').map((r) => ({ exDate: day(r.exDate), type: text(r.actionType), purpose: text(r.purpose), factor: optional(r.adjustmentFactor) })).sort((a, b) => b.exDate.localeCompare(a.exDate));
}

/** Stock against a benchmark index over the same dates. */
export function versus(raw: ObjectValue, symbol: string) {
  const stock = object(raw.stock), index = object(raw.index);
  if (stock.symbol !== symbol) throw new Error('NSE comparison identity mismatch');
  return { from: day(raw.base_date), to: day(raw.date), index: text(index.index), stockReturn: number(stock.return_pct), indexReturn: number(index.return_pct), outperformance: number(raw.outperformance_pct_points), beta: number(raw.beta), correlation: number(raw.correlation), observations: number(raw.daily_observations) };
}

/** Volume against its own average over recent sessions. */
export function volumeProfile(raw: ObjectValue, symbol: string) {
  if (raw.symbol !== symbol) throw new Error('NSE volume identity mismatch');
  return { days: number(raw.days_analysed), average: number(raw.avg_volume), max: number(raw.max_volume), last: number(raw.last_volume), lastVsAverage: number(raw.last_vs_avg_pct), spikes: number(raw.volume_spike_days) };
}

/** Index period returns and 52-week range. */
export function indexPerformance(raw: ObjectValue) {
  const returns = object(raw.returns), hl = object(raw.high_low_52w);
  return {
    label: text(raw.index), date: day(raw.date), close: number(raw.close),
    horizons: ['1D', '1W', '1M', '3M', '6M', '1Y', '2Y'].filter((k) => returns[k]).map((k) => ({ period: k, returnPct: number(object(returns[k]).return_pct) })),
    high: number(hl.high), highDate: day(hl.high_date), low: number(hl.low), lowDate: day(hl.low_date), belowHigh: number(hl.pct_below_high), aboveLow: number(hl.pct_above_low),
  };
}

export interface IndexBar { date: string; open: number; high: number; low: number; close: number; pe: number | null; pb: number | null; dy: number | null }
/** Daily index history with published valuation ratios. */
export function indexHistory(raw: ObjectValue): { bars: IndexBar[]; next: string | null } {
  const dates = new Set<string>();
  const bars = list(raw.data, 300, 'index history').map((r) => {
    const date = day(r.date);
    if (dates.has(date)) throw new Error('Duplicate NSE index session');
    dates.add(date);
    const b = { date, open: number(r.open), high: number(r.high), low: number(r.low), close: number(r.close), pe: optional(r.pe), pb: optional(r.pb), dy: optional(r.divYield) };
    if (b.low <= 0 || b.high < b.low || b.close > b.high + 1e-9 || b.close < b.low - 1e-9) throw new Error('Invalid NSE index observation');
    return b;
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (!bars.length) throw new Error('Empty NSE index history');
  return { bars, next: typeof raw.next_end_date === 'string' && DAY.test(raw.next_end_date) ? raw.next_end_date : null };
}

/** Index valuation ratios against their own window. */
export function valuation(raw: ObjectValue) {
  const ratio = (v: unknown) => { const r = object(v); return { current: number(r.current), min: number(r.min), max: number(r.max), median: number(r.median), percentile: number(r.percentile) }; };
  return { pe: ratio(raw.pe), pb: ratio(raw.pb), dy: ratio(raw.div_yield_pct), from: day(raw.window_from), to: day(raw.window_to) };
}

/** Several indices over the same dates: return, volatility, drawdown and valuation. */
export function compareIndices(raw: ObjectValue) {
  return { from: day(raw.base_date), to: day(raw.date), rows: list(raw.indices, 10, 'index comparison').map((r) => ({ label: text(r.index), returnPct: number(r.return_pct), volatility: number(r.volatility_annualised_pct), drawdown: number(r.max_drawdown_pct), pe: optional(r.pe), pb: optional(r.pb), dy: optional(r.div_yield_pct) })) };
}

/** Index names from the end-of-day snapshot, for choosing what to explore. */
export function indexNames(raw: ObjectValue) {
  return [...new Set(list(raw.indices, 400, 'index snapshot').map((r) => text(r.indexName)))].sort();
}

/** Stock history chunk with the source's pointer to the next older chunk. */
export function historyChunk(raw: ObjectValue, symbol: string) {
  return { bars: history(raw, symbol), next: typeof raw.next_end_date === 'string' && DAY.test(raw.next_end_date) ? raw.next_end_date : null };
}
