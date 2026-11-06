// The trading engine: price adjustment, indicators, strategy rules, a day-by-day
// book shared by backtests and paper trading, and the metrics of a run.
// Pure: no tools, no clock, no storage. Signals use data up to a session's close
// and fill at the next session's open, so no rule ever sees the future.

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface Action { exDate: string; kind: string; purpose: string; factor: number }

export type Template = 'ma_cross' | 'breakout' | 'rsi_revert' | 'momentum' | 'buy_hold';
export interface Params { fast: number; slow: number; entryDays: number; exitDays: number; rsiDays: number; rsiBuy: number; rsiSell: number; lookback: number; top: number; rebalanceDays: number }
export interface Rules { template: Template; params: Params; maxPositions: number; stopPct: number; targetPct: number; costBps: number; slippageBps: number }

export const TEMPLATES: { value: Template; label: string; summary: string }[] = [
  { value: 'ma_cross', label: 'Moving-average crossover', summary: 'Buy when the fast average of closes crosses above the slow one; sell when it crosses back below.' },
  { value: 'breakout', label: 'Channel breakout', summary: 'Buy when the close beats the highest high of the entry window; sell when it falls under the lowest low of the exit window.' },
  { value: 'rsi_revert', label: 'RSI mean reversion', summary: 'Buy when RSI falls below the buy level; sell when it rises above the sell level.' },
  { value: 'momentum', label: 'Momentum rotation', summary: 'Every rebalance, hold the strongest stocks by return over the lookback, only while that return is positive.' },
  { value: 'buy_hold', label: 'Buy and hold', summary: 'Buy every stock in equal weights on the first session and hold to the end; a baseline for the others.' },
];
export const DEFAULT_PARAMS: Params = { fast: 20, slow: 50, entryDays: 55, exitDays: 20, rsiDays: 14, rsiBuy: 30, rsiSell: 55, lookback: 120, top: 5, rebalanceDays: 21 };
export const LIMITS: Record<keyof Params, [number, number]> = { fast: [2, 200], slow: [3, 400], entryDays: [5, 250], exitDays: [3, 250], rsiDays: [2, 50], rsiBuy: [5, 50], rsiSell: [40, 95], lookback: [10, 250], top: [1, 20], rebalanceDays: [5, 126] };

// --- adjustment --------------------------------------------------------------------

/** Splits and bonuses scale every earlier price by NSE's published factor, so a
 * bonus never looks like a crash. Dividends and demergers (factor 1) leave prices
 * unchanged: returns are price returns. */
export function adjust(bars: Bar[], actions: Action[]): Bar[] {
  const scaling = actions.filter((a) => a.factor > 0 && a.factor !== 1).sort((a, b) => b.exDate.localeCompare(a.exDate));
  if (!scaling.length) return bars;
  return bars.map((b) => {
    let f = 1;
    for (const a of scaling) if (b.date < a.exDate) f *= a.factor;
    return f === 1 ? b : { date: b.date, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f, volume: b.volume / f };
  });
}

// --- indicators (value at i uses bars 0..i only; null until enough data) --------------

export function sma(v: number[], n: number): (number | null)[] {
  const out: (number | null)[] = []; let sum = 0;
  v.forEach((x, i) => { sum += x; if (i >= n) sum -= v[i - n]!; out.push(i >= n - 1 ? sum / n : null); });
  return out;
}
/** Wilder's RSI. */
export function rsi(v: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [null]; let gain = 0, loss = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i]! - v[i - 1]!, g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= n) { gain += g / n; loss += l / n; out.push(i === n ? (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)) : null); continue; }
    gain = (gain * (n - 1) + g) / n; loss = (loss * (n - 1) + l) / n;
    out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  }
  return out;
}
/** Highest of the n values before i (excluding i). */
export function priorMax(v: number[], n: number): (number | null)[] { return v.map((_, i) => i >= n ? Math.max(...v.slice(i - n, i)) : null); }
export function priorMin(v: number[], n: number): (number | null)[] { return v.map((_, i) => i >= n ? Math.min(...v.slice(i - n, i)) : null); }
export function roc(v: number[], n: number): (number | null)[] { return v.map((x, i) => i >= n && v[i - n]! > 0 ? x / v[i - n]! - 1 : null); }

// --- signals -----------------------------------------------------------------------

/** One symbol's prepared series: bars by date and the rule's indicators by bar index. */
export interface Series { symbol: string; bars: Bar[]; at: Map<string, number>; enter: boolean[]; exit: boolean[]; rank: (number | null)[] }

export function prepare(symbol: string, bars: Bar[], rules: Rules): Series {
  const c = bars.map((b) => b.close), p = rules.params, n = bars.length;
  const enter = new Array<boolean>(n).fill(false), exit = new Array<boolean>(n).fill(false);
  let rank: (number | null)[] = roc(c, 20);
  if (rules.template === 'ma_cross') {
    const f = sma(c, p.fast), s = sma(c, p.slow);
    for (let i = 1; i < n; i++) {
      const [f0, s0, f1, s1] = [f[i - 1], s[i - 1], f[i], s[i]];
      if (f0 == null || s0 == null || f1 == null || s1 == null) continue;
      enter[i] = f0 <= s0 && f1 > s1; exit[i] = f1 < s1;
    }
  } else if (rules.template === 'breakout') {
    const hi = priorMax(bars.map((b) => b.high), p.entryDays), lo = priorMin(bars.map((b) => b.low), p.exitDays);
    for (let i = 0; i < n; i++) { enter[i] = hi[i] != null && c[i]! > hi[i]!; exit[i] = lo[i] != null && c[i]! < lo[i]!; }
  } else if (rules.template === 'rsi_revert') {
    const r = rsi(c, p.rsiDays);
    for (let i = 0; i < n; i++) { enter[i] = r[i] != null && r[i]! < p.rsiBuy; exit[i] = r[i] != null && r[i]! > p.rsiSell; }
    rank = r.map((x) => (x == null ? null : -x));
  } else if (rules.template === 'momentum') {
    rank = roc(c, p.lookback);
  }
  return { symbol, bars, at: new Map(bars.map((b, i) => [b.date, i])), enter, exit, rank };
}

// --- the book ----------------------------------------------------------------------

export interface Position { symbol: string; qty: number; entryDate: string; entryPrice: number; cost: number }
export interface Order { symbol: string; side: 'buy' | 'sell'; signal: string; reason: string }
export interface Trade { symbol: string; qty: number; entryDate: string; entryPrice: number; exitDate: string; exitPrice: number; pnl: number; pnlPct: number; days: number; reason: string; costs: number }
export interface Fill { date: string; symbol: string; side: 'buy' | 'sell'; qty: number; price: number; costs: number; reason: string }
export interface Book { cash: number; positions: Position[]; pending: Order[]; trades: Trade[]; fills: Fill[]; costs: number; day: number; lastRebalance: number; started: boolean; skipped: number }

export const newBook = (capital: number): Book => ({ cash: capital, positions: [], pending: [], trades: [], fills: [], costs: 0, day: 0, lastRebalance: -1, started: false, skipped: 0 });

/** Equal-weight slots: every stock for buy and hold, the leaders for momentum, else the position limit. */
export const slotsOf = (rules: Rules, universe: number) => Math.max(1, rules.template === 'buy_hold' ? universe : rules.template === 'momentum' ? Math.min(rules.params.top, rules.maxPositions) : rules.maxPositions);

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Latest close at or before the date, for marking positions on a session a stock did not trade. */
function closeAt(s: Series, date: string, from: number): number | undefined {
  let i = s.at.get(date);
  if (i === undefined) { for (i = Math.min(from, s.bars.length - 1); i >= 0 && s.bars[i]!.date > date; i--); if (i < 0) return undefined; }
  return s.bars[i]!.close;
}

export function equityOf(book: Book, series: Map<string, Series>, date: string): number {
  return book.cash + book.positions.reduce((a, p) => { const s = series.get(p.symbol)!; return a + p.qty * (closeAt(s, date, s.bars.length - 1) ?? p.entryPrice); }, 0);
}

function sell(book: Book, rules: Rules, p: Position, date: string, price: number, reason: string) {
  const fill = price * (1 - rules.slippageBps / 1e4), gross = p.qty * fill, costs = gross * rules.costBps / 1e4;
  book.cash += gross - costs; book.costs += costs;
  book.positions = book.positions.filter((x) => x !== p);
  const pnl = gross - costs - p.qty * p.entryPrice - p.cost;
  book.trades.push({ symbol: p.symbol, qty: p.qty, entryDate: p.entryDate, entryPrice: p.entryPrice, exitDate: date, exitPrice: fill, pnl, pnlPct: pnl / (p.qty * p.entryPrice + p.cost) * 100, days: daysBetween(p.entryDate, date), reason, costs: p.cost + costs });
  book.fills.push({ date, symbol: p.symbol, side: 'sell', qty: p.qty, price: fill, costs, reason });
}

/**
 * One session for the book: fill yesterday's orders at today's open, apply stops
 * and targets inside today's range, then read today's close for tomorrow's orders.
 * `date` is a session of the calendar; `equityBefore` is the previous close's equity.
 */
export function step(book: Book, rules: Rules, series: Map<string, Series>, date: string, equityBefore: number) {
  // 1. Orders from the previous close fill at this open; a stock with no session today keeps its order.
  const waiting: Order[] = [];
  for (const o of book.pending.filter((x) => x.side === 'sell')) {
    const s = series.get(o.symbol)!, i = s.at.get(date), p = book.positions.find((x) => x.symbol === o.symbol);
    if (!p) continue;
    if (i === undefined) { waiting.push(o); continue; }
    sell(book, rules, p, date, s.bars[i]!.open, o.reason);
  }
  const slots = slotsOf(rules, series.size), slot = equityBefore / slots;
  for (const o of book.pending.filter((x) => x.side === 'buy')) {
    const s = series.get(o.symbol)!, i = s.at.get(date);
    if (book.positions.some((x) => x.symbol === o.symbol)) continue;
    if (i === undefined) { waiting.push(o); continue; }
    if (book.positions.length >= slots) continue;
    const price = s.bars[i]!.open * (1 + rules.slippageBps / 1e4), per = price * (1 + rules.costBps / 1e4);
    const qty = Math.floor(Math.min(slot, book.cash) / per);
    if (qty < 1) { book.skipped++; continue; }
    const costs = qty * price * rules.costBps / 1e4;
    book.cash -= qty * price + costs; book.costs += costs;
    book.positions.push({ symbol: o.symbol, qty, entryDate: date, entryPrice: price, cost: costs });
    book.fills.push({ date, symbol: o.symbol, side: 'buy', qty, price, costs, reason: o.reason });
  }
  book.pending = waiting;
  // 2. Stops and targets on positions held from earlier sessions; a gap through a level fills at the open.
  for (const p of [...book.positions]) {
    const s = series.get(p.symbol)!, i = s.at.get(date);
    if (i === undefined || p.entryDate === date) continue;
    const b = s.bars[i]!;
    const stop = rules.stopPct > 0 ? p.entryPrice * (1 - rules.stopPct / 100) : 0, target = rules.targetPct > 0 ? p.entryPrice * (1 + rules.targetPct / 100) : Infinity;
    if (stop && b.low <= stop) sell(book, rules, p, date, Math.min(b.open, stop), `Stop ${rules.stopPct}%`);
    else if (b.high >= target) sell(book, rules, p, date, Math.max(b.open, target), `Target ${rules.targetPct}%`);
  }
  // 3. Today's close decides tomorrow's orders.
  book.day++;
  const held = new Set(book.positions.map((p) => p.symbol)), queued = new Set(book.pending.map((o) => o.symbol));
  const orders: Order[] = [];
  if (rules.template === 'buy_hold') {
    if (!book.started) for (const s of series.values()) if (s.at.has(date)) orders.push({ symbol: s.symbol, side: 'buy', signal: date, reason: 'Initial purchase' });
  } else if (rules.template === 'momentum') {
    if (book.lastRebalance < 0 || book.day - book.lastRebalance >= rules.params.rebalanceDays) {
      const ranked = [...series.values()].map((s) => ({ s, r: s.at.has(date) ? s.rank[s.at.get(date)!] : null }))
        .filter((x): x is { s: Series; r: number } => x.r != null && x.r > 0).sort((a, b) => b.r - a.r || a.s.symbol.localeCompare(b.s.symbol));
      if (ranked.length || book.positions.length) {
        book.lastRebalance = book.day;
        const keep = new Set(ranked.slice(0, Math.min(rules.params.top, rules.maxPositions)).map((x) => x.s.symbol));
        for (const p of book.positions) if (!keep.has(p.symbol)) orders.push({ symbol: p.symbol, side: 'sell', signal: date, reason: 'Left the leaders' });
        for (const x of ranked) if (keep.has(x.s.symbol) && !held.has(x.s.symbol)) orders.push({ symbol: x.s.symbol, side: 'buy', signal: date, reason: `Leader by ${rules.params.lookback}-session return (${(x.r * 100).toFixed(1)}%)` });
      }
    }
  } else {
    const label = rules.template === 'ma_cross' ? ['Fast average crossed above slow', 'Fast average below slow'] : rules.template === 'breakout' ? [`Close above ${rules.params.entryDays}-session high`, `Close below ${rules.params.exitDays}-session low`] : [`RSI below ${rules.params.rsiBuy}`, `RSI above ${rules.params.rsiSell}`];
    for (const p of book.positions) { const s = series.get(p.symbol)!, i = s.at.get(date); if (i !== undefined && s.exit[i]) orders.push({ symbol: p.symbol, side: 'sell', signal: date, reason: label[1]! }); }
    const free = rules.maxPositions - book.positions.length + orders.length - [...queued].filter((q) => !held.has(q)).length;
    const entries = [...series.values()].filter((s) => !held.has(s.symbol) && !queued.has(s.symbol) && s.at.has(date) && s.enter[s.at.get(date)!])
      .sort((a, b) => (b.rank[b.at.get(date)!] ?? -Infinity) - (a.rank[a.at.get(date)!] ?? -Infinity) || a.symbol.localeCompare(b.symbol)).slice(0, Math.max(0, free));
    for (const s of entries) orders.push({ symbol: s.symbol, side: 'buy', signal: date, reason: label[0]! });
  }
  if (orders.length) book.started = true;
  book.pending.push(...orders.filter((o) => !book.pending.some((x) => x.symbol === o.symbol && x.side === o.side)));
}

// --- a backtest ----------------------------------------------------------------------

export interface Point { date: string; equity: number; benchmark: number | null; drawdown: number; exposure: number }
export interface Metrics {
  start: string; end: string; sessions: number; years: number; capital: number; final: number; totalPct: number; cagrPct: number | null;
  maxDrawdownPct: number; longestDrawdownDays: number; volatilityPct: number | null; sharpe: number | null; sortino: number | null; calmar: number | null;
  trades: number; winRatePct: number | null; avgWinPct: number | null; avgLossPct: number | null; profitFactor: number | null; expectancy: number | null;
  avgHoldDays: number | null; exposurePct: number; costs: number; skipped: number;
  benchmarkTotalPct: number | null; benchmarkCagrPct: number | null; benchmarkMaxDrawdownPct: number | null;
}
export interface Result { metrics: Metrics; curve: Point[]; trades: Trade[]; open: (Position & { last: number; pnl: number; pnlPct: number })[]; pending: Order[]; fills: Fill[] }

/**
 * Run the rules over the calendar (benchmark sessions) from `from` to the last
 * date. Benchmark closes are scaled to the starting capital for comparison.
 */
export function backtest(rules: Rules, capital: number, series: Map<string, Series>, calendar: string[], benchmark: Map<string, number>, from = ''): Result {
  const days = calendar.filter((d) => d >= from && [...series.values()].some((s) => s.at.has(d)));
  const book = newBook(capital), curve: Point[] = [];
  let equity = capital, peak = capital, base: number | undefined;
  for (const date of days) {
    step(book, rules, series, date, equity);
    equity = equityOf(book, series, date); peak = Math.max(peak, equity);
    const b = benchmark.get(date); if (base === undefined && b) base = b;
    curve.push({ date, equity, benchmark: b && base ? capital * b / base : null, drawdown: (equity / peak - 1) * 100, exposure: book.positions.length });
  }
  const last = days.at(-1) ?? '';
  const open = book.positions.map((p) => { const s = series.get(p.symbol)!, px = closeAt(s, last, s.bars.length - 1) ?? p.entryPrice, pnl = p.qty * px - p.qty * p.entryPrice - p.cost; return { ...p, last: px, pnl, pnlPct: pnl / (p.qty * p.entryPrice + p.cost) * 100 }; });
  return { metrics: metrics(curve, book, capital), curve, trades: book.trades, open, pending: book.pending, fills: book.fills };
}

function stats(curve: { equity: number }[]) {
  const r = curve.slice(1).map((p, i) => p.equity / curve[i]!.equity - 1);
  if (r.length < 2) return { vol: null, sharpe: null, sortino: null };
  const mean = r.reduce((a, x) => a + x, 0) / r.length, sd = Math.sqrt(r.reduce((a, x) => a + (x - mean) ** 2, 0) / (r.length - 1));
  const down = Math.sqrt(r.reduce((a, x) => a + Math.min(x, 0) ** 2, 0) / r.length);
  return { vol: sd * Math.sqrt(252) * 100, sharpe: sd > 0 ? mean / sd * Math.sqrt(252) : null, sortino: down > 0 ? mean / down * Math.sqrt(252) : null };
}
function drawdown(values: number[]) {
  let peak = -Infinity, worst = 0, since = 0, longest = 0;
  values.forEach((v, i) => { if (v >= peak) { peak = v; since = i; } else longest = Math.max(longest, i - since); worst = Math.min(worst, v / peak - 1); });
  return { worst: worst * 100, longest };
}

export function metrics(curve: Point[], book: Book, capital: number): Metrics {
  const first = curve[0], last = curve.at(-1);
  const years = first && last ? Math.max(daysBetween(first.date, last.date), 1) / 365.25 : 0;
  const final = last?.equity ?? capital, total = (final / capital - 1) * 100;
  const s = stats(curve), dd = drawdown(curve.map((p) => p.equity));
  const wins = book.trades.filter((t) => t.pnl > 0), losses = book.trades.filter((t) => t.pnl <= 0);
  const gw = wins.reduce((a, t) => a + t.pnl, 0), gl = -losses.reduce((a, t) => a + t.pnl, 0);
  const bench = curve.filter((p) => p.benchmark != null) as (Point & { benchmark: number })[];
  const bTotal = bench.length > 1 ? (bench.at(-1)!.benchmark / bench[0]!.benchmark - 1) * 100 : null;
  const cagr = (t: number) => years >= 0.25 ? ((1 + t / 100) ** (1 / years) - 1) * 100 : null;
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null;
  return {
    start: first?.date ?? '', end: last?.date ?? '', sessions: curve.length, years, capital, final, totalPct: total, cagrPct: cagr(total),
    maxDrawdownPct: dd.worst, longestDrawdownDays: dd.longest, volatilityPct: s.vol, sharpe: s.sharpe, sortino: s.sortino,
    calmar: cagr(total) != null && dd.worst < 0 ? cagr(total)! / -dd.worst : null,
    trades: book.trades.length, winRatePct: book.trades.length ? wins.length / book.trades.length * 100 : null,
    avgWinPct: avg(wins.map((t) => t.pnlPct)), avgLossPct: avg(losses.map((t) => t.pnlPct)), profitFactor: gl > 0 ? gw / gl : null,
    expectancy: avg(book.trades.map((t) => t.pnl)), avgHoldDays: avg(book.trades.map((t) => t.days)),
    exposurePct: curve.length ? curve.filter((p) => p.exposure > 0).length / curve.length * 100 : 0, costs: book.costs, skipped: book.skipped,
    benchmarkTotalPct: bTotal, benchmarkCagrPct: bTotal == null ? null : cagr(bTotal), benchmarkMaxDrawdownPct: bench.length > 1 ? drawdown(bench.map((p) => p.benchmark)).worst : null,
  };
}

/** Calendar-year returns of the strategy and the benchmark, from each year's last equity. */
export function yearly(curve: Point[]) {
  const out: { year: string; strategy: number; benchmark: number | null }[] = [];
  let prev = curve[0], prevB = curve.find((p) => p.benchmark != null)?.benchmark ?? null;
  curve.forEach((p, i) => {
    const next = curve[i + 1];
    if (next && next.date.slice(0, 4) === p.date.slice(0, 4)) return;
    out.push({ year: p.date.slice(0, 4), strategy: (p.equity / prev!.equity - 1) * 100, benchmark: p.benchmark != null && prevB ? (p.benchmark / prevB - 1) * 100 : null });
    prev = p; prevB = p.benchmark ?? prevB;
  });
  return out;
}
/** Month-by-month returns as year rows of twelve values; months outside the run are null. */
export function monthly(curve: Point[]) {
  const ends = new Map<string, number>();
  for (const p of curve) ends.set(p.date.slice(0, 7), p.equity);
  const keys = [...ends.keys()], rows = new Map<string, (number | null)[]>();
  let prev = curve[0]?.equity;
  for (const k of keys) {
    const row = rows.get(k.slice(0, 4)) ?? new Array<number | null>(12).fill(null);
    row[Number(k.slice(5, 7)) - 1] = prev ? Number(((ends.get(k)! / prev - 1) * 100).toFixed(2)) : null;
    rows.set(k.slice(0, 4), row); prev = ends.get(k);
  }
  return [...rows.entries()].map(([year, values]) => ({ year, values }));
}
