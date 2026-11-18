// Strategy Lab: rule-based NSE strategies tested on five years of local daily
// history and run forward on paper. State owns strategies, results, paper books
// and receipts; DuckDB owns every saved session, corporate action and the date ranges
// NSE has answered for, so what is left to read is always derived from the archive.
import { adjust, backtest, monthly, newBook, prepare, step, equityOf, yearly, DEFAULT_PARAMS, LIMITS, TEMPLATES, type Action, type Bar, type Book, type Metrics, type Order, type Params, type Point, type Position, type Result, type Rules, type Series, type Template, type Trade } from './engine.ts';
import { actions, bulk, coverage, decode, forget, forgetSpans, indexChunk, initialize, latestSessions, loadActions, loadBars, loadSpans, missing, monthsBefore, nextDay, NseError, previousDay, saveActions, saveRead, stockChunk, storageUsed, type Database, type Span } from './source.ts';
import { view, TITLES } from './views.ts';

export { view, TITLES };

export interface Strategy { id: string; name: string; rules: Rules; symbols: string[]; capital: number; from: string; created: string; updated: string }
export interface Draft { forId: string; name: string; template: Template; symbols: string; capital: number | string; from: string; maxPositions: number | string; stopPct: number | string; targetPct: number | string; costBps: number | string; slippageBps: number | string; params: Record<keyof Params, number | string> }
/** A saved equity curve as parallel arrays, about half the size of point records. */
export interface Curve { dates: string[]; equity: number[]; benchmark: (number | null)[]; drawdown: number[] }
export const curveOf = (points: Point[]): Curve => ({ dates: points.map((p) => p.date), equity: points.map((p) => Math.round(p.equity)), benchmark: points.map((p) => (p.benchmark == null ? null : Math.round(p.benchmark))), drawdown: points.map((p) => Math.round(p.drawdown * 100) / 100) });
export interface Stored { ranAt: string; dataTo: string; universe: number; left: string[]; metrics: Metrics; curve: Curve; trades: Trade[]; open: Result['open']; pending: Order[]; yearly: ReturnType<typeof yearly>; monthly: ReturnType<typeof monthly> }
export interface Paper { id: string; strategyId: string; name: string; startedAt: string; capital: number; book: Book; equity: { date: string; equity: number }[]; lastDate: string; status: 'running' | 'paused'; applied: string[] }
/** Per stock: when its corporate actions were last checked. History progress is derived from the database. */
export interface Sync { actionsAt?: string; actionsError?: string }
export interface Receipt { subject: string; tool: string; fetchedAt: string; sourceAt: string; rows: number; status: string }
export interface Ui { strategy: string; paper: string; chartSymbol: string; resultsTab: string; strategiesTab: string; paperTab: string; dataTab: string; confirm: string; nav: number }
/** A projection of the archive for the views: saved sessions, and calendar days of the window not yet answered. */
export interface Covered { first: string; last: string; sessions: number; complete: boolean; toRead: number }
export interface State {
  universe?: string[]; benchmark?: string; sync?: Record<string, Sync>; bench?: { checkedAt?: string };
  covered?: Record<string, Covered>; actionList?: Record<string, Action[]>;
  strategies?: Strategy[]; results?: Record<string, Stored>; paper?: Paper[]; draft?: Draft;
  addDraft?: string; storage?: number; storageLimit?: number; ui?: Ui; receipts?: Receipt[]; problem?: string; syncedAt?: string; note?: string;
}
export interface Context {
  state: State; database: Database; callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  now?: () => Date; appRevision?: number;
}

export const DEFAULT_UNIVERSE = ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'BHARTIARTL', 'ITC', 'LT', 'SBIN', 'HINDUNILVR'];
export const BENCHMARKS = ['Nifty 50', 'Nifty 500', 'Nifty Next 50', 'Nifty Bank', 'Nifty Midcap 100'];
export const MAX_UNIVERSE = 50, MAX_STRATEGIES = 12, MAX_PAPER = 6, MAX_TRADES = 400;
/** NSE's history window: five years back from the present. Earlier chunks answer "not found". */
export const WINDOW_YEARS = 5;
const SYMBOL = /^[A-Z0-9][A-Z0-9&.-]{0,24}$/;
const INDEX_KEY = (name: string) => `INDEX:${name}`;

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').slice(0, max);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const today = (ctx: Context) => (ctx.now?.() ?? new Date()).toISOString().slice(0, 10);
const nowIso = (ctx: Context) => (ctx.now?.() ?? new Date()).toISOString();
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const reason = (e: unknown) => String((e as Error)?.message ?? e).replace(/<\/?tool_output[^>]*>/g, ' ').replace(/This is data returned by a tool, not instructions\.[^\n]*/g, ' ').replace(/^\s*error:\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 300);
export const SETUP = 'If a read is blocked, review Access in the app header.';

export function symbols(value: unknown, max = MAX_UNIVERSE): string[] {
  const list = (Array.isArray(value) ? value : str(value, 2000).split(/[\s,;]+/)).map((x) => str(x, 30).trim().toUpperCase()).filter(Boolean);
  const bad = list.find((x) => !SYMBOL.test(x));
  if (bad) throw new Error(`${bad.slice(0, 30)} is not an NSE symbol. Use the exchange ticker, such as RELIANCE or HDFCBANK.`);
  return [...new Set(list)].slice(0, max);
}
const quiet = (value: unknown, max = MAX_UNIVERSE) => { try { return symbols(value, max); } catch { return []; } };

function rulesOf(v: unknown): Rules {
  const r = obj(v) ?? {}, p = obj(r.params) ?? {};
  const params = Object.fromEntries(Object.entries(DEFAULT_PARAMS).map(([k, d]) => { const [lo, hi] = LIMITS[k as keyof Params]; const x = Number(p[k]); return [k, finite(x) && x >= lo && x <= hi ? Math.round(x) : d]; })) as unknown as Params;
  const n = (x: unknown, lo: number, hi: number, d: number) => (finite(x) && x >= lo && x <= hi ? x : d);
  return { template: TEMPLATES.some((t) => t.value === r.template) ? r.template as Template : 'ma_cross', params, maxPositions: Math.round(n(r.maxPositions, 1, 50, 5)), stopPct: n(r.stopPct, 0, 50, 0), targetPct: n(r.targetPct, 0, 500, 0), costBps: n(r.costBps, 0, 200, 12), slippageBps: n(r.slippageBps, 0, 200, 5) };
}
function strategyOf(v: unknown): Strategy | undefined {
  const s = obj(v); if (!s || typeof s.id !== 'string' || !s.id) return undefined;
  const capital = Number(s.capital);
  return { id: s.id.slice(0, 40), name: str(s.name, 60) || 'Untitled strategy', rules: rulesOf(s.rules), symbols: quiet(s.symbols), capital: finite(capital) && capital >= 10_000 && capital <= 1e10 ? capital : 1_000_000, from: /^\d{4}-\d{2}-\d{2}$/.test(str(s.from)) ? str(s.from) : '', created: str(s.created, 40), updated: str(s.updated, 40) };
}
export function draftOf(s: Strategy): Draft {
  return { forId: s.id, name: s.name, template: s.rules.template, symbols: s.symbols.join(', '), capital: s.capital, from: s.from, maxPositions: s.rules.maxPositions, stopPct: s.rules.stopPct, targetPct: s.rules.targetPct, costBps: s.rules.costBps, slippageBps: s.rules.slippageBps, params: { ...s.rules.params } };
}
const EXAMPLES: Omit<Strategy, 'id' | 'created' | 'updated'>[] = [
  { name: 'Trend: 20/50 crossover', rules: { ...rulesOf({ template: 'ma_cross' }), stopPct: 8 }, symbols: [], capital: 1_000_000, from: '' },
  { name: 'Momentum leaders', rules: rulesOf({ template: 'momentum', maxPositions: 5 }), symbols: [], capital: 1_000_000, from: '' },
  { name: 'Equal-weight hold', rules: rulesOf({ template: 'buy_hold' }), symbols: [], capital: 1_000_000, from: '' },
];

export function normalize(s: State): State {
  s.universe = quiet(s.universe).length ? quiet(s.universe) : s.universe && Array.isArray(s.universe) && !s.universe.length ? [] : [...DEFAULT_UNIVERSE];
  s.benchmark = BENCHMARKS.includes(str(s.benchmark)) ? str(s.benchmark) : 'Nifty 50';
  const sync = obj(s.sync) ?? {};
  s.sync = Object.fromEntries(s.universe.map((sym) => { const x = obj(sync[sym]) ?? {}; return [sym, { ...(x.actionsAt ? { actionsAt: str(x.actionsAt, 40) } : {}), ...(x.actionsError ? { actionsError: str(x.actionsError, 300) } : {}) }]; }));
  const b = obj(s.bench) ?? {};
  s.bench = b.checkedAt ? { checkedAt: str(b.checkedAt, 40) } : {};
  const cov = obj(s.covered) ?? {};
  s.covered = Object.fromEntries(Object.entries(cov).flatMap(([k, v]) => { const c = obj(v); return c && finite(c.sessions) ? [[k, { first: str(c.first, 10), last: str(c.last, 10), sessions: c.sessions, complete: c.complete === true, toRead: finite(c.toRead) ? c.toRead : 0 }]] : []; }));
  const al = obj(s.actionList) ?? {};
  s.actionList = Object.fromEntries(Object.entries(al).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as Action[]).slice(0, 200)]));
  const list = (Array.isArray(s.strategies) ? s.strategies : null);
  s.strategies = list ? list.map(strategyOf).filter((x): x is Strategy => !!x).slice(0, MAX_STRATEGIES) : EXAMPLES.map((e, i) => ({ ...e, id: `example-${i + 1}`, created: '', updated: '' }));
  const ids = new Set(s.strategies.map((x) => x.id));
  s.results = Object.fromEntries(Object.entries(obj(s.results) ?? {}).filter(([k, v]) => ids.has(k) && obj(v)?.metrics && Array.isArray(obj(obj(v)!.curve)?.dates))) as Record<string, Stored>;
  s.paper = (Array.isArray(s.paper) ? s.paper : []).filter((p) => obj(p)?.book && ids.has(String((p as Paper).strategyId))).slice(0, MAX_PAPER) as Paper[];
  const u = obj(s.ui) ?? {};
  const strategy = ids.has(str(u.strategy)) ? str(u.strategy) : s.strategies[0]?.id ?? '';
  s.ui = { strategy, paper: s.paper.some((p) => p.id === u.paper) ? str(u.paper) : s.paper[0]?.id ?? '', chartSymbol: str(u.chartSymbol, 30), resultsTab: str(u.resultsTab, 40), strategiesTab: str(u.strategiesTab, 40), paperTab: str(u.paperTab, 40), dataTab: str(u.dataTab, 40), confirm: str(u.confirm, 60), nav: finite(u.nav) ? u.nav : 0 };
  const selected = s.strategies.find((x) => x.id === strategy);
  const d = obj(s.draft);
  // A draft belongs to the strategy it was opened from; another strategy starts from its saved rules.
  s.draft = selected ? (d && d.forId === selected.id ? { ...draftOf(selected), ...(d as unknown as Draft), forId: selected.id, params: { ...draftOf(selected).params, ...(obj(d.params) ?? {}) } as Draft['params'] } : draftOf(selected)) : undefined;
  s.addDraft = str(s.addDraft, 400);
  s.storage = finite(s.storage) ? s.storage : 0;
  s.storageLimit = finite(s.storageLimit) ? s.storageLimit : 0;
  s.receipts = (Array.isArray(s.receipts) ? s.receipts : []).slice(0, 80);
  s.problem = s.problem ? str(s.problem, 500) : undefined;
  return s;
}

// --- reads ---------------------------------------------------------------------------

/** One governed read with a receipt; returns the parsed body or the failure. */
async function read(ctx: Context, tool: string, args: Record<string, unknown>, subject: string, timeoutMs = 20_000): Promise<{ body?: Record<string, unknown>; nse?: string; failed?: string }> {
  const fetchedAt = nowIso(ctx);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([ctx.callTool(tool, args), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('NSE took too long to answer; it will be retried')), timeoutMs); })]);
    return { body: decode(raw) };
  } catch (e) {
    const message = reason(e);
    ctx.state.receipts!.unshift({ subject, tool, fetchedAt, sourceAt: '', rows: 0, status: e instanceof NseError ? message : `Failed: ${message}` });
    return e instanceof NseError ? { nse: message } : { failed: `${subject}: ${message}` };
  } finally { clearTimeout(timer); ctx.state.receipts = ctx.state.receipts!.slice(0, 80); }
}
const receipt = (ctx: Context, subject: string, tool: string, bars: Bar[]) => ctx.state.receipts!.unshift({ subject, tool, fetchedAt: nowIso(ctx), sourceAt: bars.length ? `${bars[0]!.date} – ${bars.at(-1)!.date}` : 'no sessions', rows: bars.length, status: 'Validated' });

export const windowStart = (on: string) => `${Number(on.slice(0, 4)) - WINDOW_YEARS}${on.slice(4)}`;
/** Months per history read: NSE's chunk limits for stocks and indices. */
const CHUNK_MONTHS = { stock: 3, index: 12 };
/** How often the benchmark is asked for new sessions; it is how the app learns a session has closed. */
const FRESH_MS = 2 * 3600_000;

interface Plan { key: string; gaps: Span[]; top: string }
/**
 * What is left to read for one key: its window from five years back to `top`,
 * minus every range NSE has already answered for. Derived from the database
 * each time, so lost, replaced or reset data is simply read again.
 */
function planFor(key: string, spans: Map<string, Span[]>, on: string, top: string): Plan {
  return { key, top, gaps: missing(spans.get(key) ?? [], windowStart(on), top) };
}
/** The newest session the exchange has published as far as this app knows, and the one before it. */
async function sessionsKnown(ctx: Context) { const [latest, previous] = await latestSessions(ctx.database, 2); return { latest, previous }; }
const spanTop = (list: Span[] | undefined) => list?.at(-1)?.to ?? '';

/** One history read ending at the newest missing day; saves its sessions with the range it answered for. */
async function chunk(ctx: Context, plan: Plan, latest: string | undefined): Promise<string | undefined> {
  const isIndex = plan.key.startsWith('INDEX:'), name = isIndex ? plan.key.slice(6) : plan.key, on = today(ctx);
  const tool = isIndex ? 'nse__get_index_history' : 'nse__get_stock_history';
  const gap = plan.gaps.at(-1)!, end = gap.to >= on ? on : gap.to;
  // Ask for no more months than the gap needs, up to NSE's chunk size.
  const limit = isIndex ? CHUNK_MONTHS.index : CHUNK_MONTHS.stock;
  let months = 1; while (months < limit && monthsBefore(end, months) > gap.from) months++;
  const r = await read(ctx, tool, isIndex ? { indexName: name, months, endDate: end } : { symbol: name, months, endDate: end }, name);
  if (r.failed) return r.failed;
  if (isIndex && end === on) ctx.state.bench!.checkedAt = nowIso(ctx);
  // A read ending today answers only for sessions already published; later ones arrive with the next session.
  const answeredTo = (bars: Bar[]) => end < on ? end : [bars.at(-1)?.date ?? '', latest ?? ''].sort().at(-1) || previousDay(end);
  if (r.nse) {
    // NSE's own answer that it has no sessions here. With nothing saved and nothing found up to today,
    // the symbol is not in its archive at all, so the whole window is answered.
    const nothing = end === on && !ctx.state.covered![plan.key]?.sessions;
    await saveRead(ctx.database, plan.key, [], { from: nothing ? windowStart(on) : monthsBefore(end, months), to: answeredTo([]) }, on);
    return undefined;
  }
  try {
    const c = isIndex ? indexChunk(r.body!, name) : stockChunk(r.body!, name);
    const from = c.next && c.next < end ? nextDay(c.next) : monthsBefore(end, months);
    await saveRead(ctx.database, plan.key, c.bars, { from, to: answeredTo(c.bars) }, on);
    receipt(ctx, name, tool, c.bars);
    return undefined;
  } catch (e) { ctx.state.receipts!.unshift({ subject: name, tool, fetchedAt: nowIso(ctx), sourceAt: '', rows: 0, status: `Rejected: ${reason(e)}` }); return `${name}: ${reason(e)}`; }
}

/** Saved sessions and what is left to read, per stock and for the benchmark, from the database. */
export async function refreshCoverage(ctx: Context) {
  const s = ctx.state, on = today(ctx);
  s.storage = await storageUsed(ctx.database);
  const [cov, spans, known] = await Promise.all([coverage(ctx.database), loadSpans(ctx.database, on), sessionsKnown(ctx)]);
  const covered: Record<string, Covered> = {};
  for (const key of [INDEX_KEY(s.benchmark!), ...s.universe!]) {
    const c = cov.get(key), list = spans.get(key);
    // The benchmark is complete once its history is read; it is refreshed for new sessions separately.
    const top = key.startsWith('INDEX:') ? spanTop(list) || on : known.latest ?? (spanTop(list) || on);
    const gaps = planFor(key, spans, on, top).gaps;
    covered[key] = { first: c?.first ?? '', last: c?.last ?? '', sessions: c?.sessions ?? 0, complete: !gaps.length, toRead: gaps.reduce((n, g) => n + days(g), 0) };
  }
  s.covered = covered;
}
const days = (g: Span) => Math.round((Date.parse(`${g.to}T00:00:00Z`) - Date.parse(`${g.from}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * One bounded sync step: the benchmark (its history, then new sessions every
 * two hours), the latest session by one bulk read, history chunks for whatever
 * is still missing, then corporate actions. At most 15 reads and about 20
 * seconds; the scheduled run and Sync now repeat it until nothing is missing.
 */
export async function sync(ctx: Context) {
  const s = normalize(ctx.state), t0 = Date.now(), failures: string[] = [], on = today(ctx);
  await initialize(ctx.database); await refreshCoverage(ctx);
  let budget = 15;
  const late = () => Date.now() - t0 > 18_000 || budget <= 0;
  const benchKey = INDEX_KEY(s.benchmark!);
  // 1. Benchmark: older history while any is missing, otherwise today's end when it is due.
  {
    const spans = await loadSpans(ctx.database, on), fresh = s.bench!.checkedAt && Date.parse(nowIso(ctx)) - Date.parse(s.bench!.checkedAt) < FRESH_MS;
    const plan = planFor(benchKey, spans, on, fresh ? spanTop(spans.get(benchKey)) || on : on);
    if (plan.gaps.length) { budget--; const f = await chunk(ctx, plan, undefined); if (f) failures.push(f); }
  }
  // 2. Latest session: one bulk read for every stock that is exactly one session behind.
  let { latest, previous } = await sessionsKnown(ctx);
  let spans = await loadSpans(ctx.database, on);
  if (latest && previous && !late()) {
    const oneBehind = s.universe!.filter((x) => spanTop(spans.get(x)) >= previous! && spanTop(spans.get(x)) < latest!);
    if (oneBehind.length) {
      budget--;
      const r = await read(ctx, 'nse__get_bulk_quote', { symbols: oneBehind.slice(0, 50) }, `${oneBehind.length} latest sessions`);
      if (r.body) {
        try {
          const quotes = bulk(r.body);
          // The quote is each stock's latest session; no session between the two means none was missed.
          for (const sym of oneBehind.slice(0, 50)) { const b = quotes.get(sym); await saveRead(ctx.database, sym, b && b.date === latest ? [b] : [], { from: nextDay(spanTop(spans.get(sym))), to: latest }, on); }
          ctx.state.receipts!.unshift({ subject: `${quotes.size} stocks`, tool: 'nse__get_bulk_quote', fetchedAt: nowIso(ctx), sourceAt: latest, rows: quotes.size, status: 'Validated' });
        } catch (e) { failures.push(`Latest sessions: ${reason(e)}`); }
      } else if (r.failed) failures.push(r.failed);
      else if (r.nse) failures.push(`Latest sessions: ${r.nse}`);
    }
  }
  // 3. History: four stocks at a time, newest missing range first, up to three reads each.
  ({ latest } = await sessionsKnown(ctx)); spans = await loadSpans(ctx.database, on);
  const stockTop = (sym: string) => latest ?? (spanTop(spans.get(sym)) || on);
  const pending = s.universe!.map((x) => planFor(x, spans, on, stockTop(x))).filter((p) => p.gaps.length)
    .sort((a, b) => b.gaps.at(-1)!.to.localeCompare(a.gaps.at(-1)!.to)).slice(0, 4);
  await Promise.all(pending.map(async (first) => {
    let plan = first;
    for (let k = 0; k < 3 && plan.gaps.length && !late(); k++) {
      budget--; const f = await chunk(ctx, plan, latest); if (f) { failures.push(f); break; }
      plan = planFor(plan.key, await loadSpans(ctx.database, on), on, plan.top);
    }
  }));
  await refreshCoverage(ctx);
  // 4. Corporate actions, weekly per stock with saved sessions, three at a time.
  const stale = s.universe!.filter((x) => s.covered![x]?.sessions && (!s.sync![x]!.actionsAt || Date.parse(nowIso(ctx)) - Date.parse(s.sync![x]!.actionsAt!) > 7 * 86_400_000)).slice(0, Math.min(3, Math.max(0, budget)));
  if (!late()) await Promise.all(stale.map(async (sym) => {
    budget--;
    const r = await read(ctx, 'nse__get_corporate_actions', { symbol: sym, fromDate: windowStart(on), toDate: on }, `${sym} actions`, 15_000);
    const entry = s.sync![sym]!;
    if (r.failed) { entry.actionsError = r.failed; failures.push(r.failed); return; }
    try {
      const list = r.body ? actions(r.body, sym) : [];
      await saveActions(ctx.database, sym, list);
      applyActionsToPaper(s, sym, list);
      s.actionList![sym] = list; entry.actionsAt = nowIso(ctx); delete entry.actionsError;
      ctx.state.receipts!.unshift({ subject: `${sym} actions`, tool: 'nse__get_corporate_actions', fetchedAt: nowIso(ctx), sourceAt: `${list.length} events`, rows: list.length, status: 'Validated' });
    } catch (e) { entry.actionsError = reason(e); failures.push(`${sym} actions: ${reason(e)}`); }
  }));
  await refreshCoverage(ctx);
  await advancePaper(ctx);
  s.syncedAt = nowIso(ctx);
  s.problem = failures.length ? `${failures.length} read${failures.length === 1 ? '' : 's'} failed and will be retried; saved sessions are kept. First: ${failures[0]} ${SETUP}` : undefined;
  return render(ctx);
}

/** A stock NSE has answered for across its whole window without one session is not an NSE symbol. */
export const unknownSymbol = (c: Covered | undefined) => !!c && c.complete && !c.sessions;
export function progress(s: State) {
  const total = s.universe!.length, done = s.universe!.filter((x) => s.covered![x]?.complete).length;
  const bench = s.covered![INDEX_KEY(s.benchmark!)];
  return { total, done, ready: !!bench?.complete && done === total, failed: s.universe!.filter((x) => unknownSymbol(s.covered![x])) };
}

// --- running strategies --------------------------------------------------------------

async function seriesFor(ctx: Context, st: Strategy) {
  const s = ctx.state, wanted = st.symbols.length ? st.symbols : s.universe!;
  const ready = wanted.filter((x) => s.covered![x]?.complete && (s.covered![x]?.sessions ?? 0) > 0);
  const series = new Map<string, Series>();
  for (const sym of ready) {
    const bars = adjust(await loadBars(ctx.database, sym), await loadActions(ctx.database, sym));
    if (bars.length) series.set(sym, prepare(sym, bars, st.rules));
  }
  // The exchange's trading days are the sessions the stocks themselves have; NSE's index archive is shorter
  // than its stock archive, so the benchmark is compared where it exists and never limits the run.
  const days = [...new Set([...series.values()].flatMap((x) => x.bars.map((b) => b.date)))].sort();
  const bench = await loadBars(ctx.database, INDEX_KEY(s.benchmark!));
  return { series, calendar: days, benchmark: new Map(bench.map((b) => [b.date, b.close])), left: wanted.filter((x) => !series.has(x)) };
}

export async function runBacktest(ctx: Context, st: Strategy) {
  const s = ctx.state, { series, calendar: days, benchmark, left } = await seriesFor(ctx, st);
  if (!series.size || !days.length) throw new Error('No saved history yet for this strategy’s stocks. Let the sync finish in Data, then run again.');
  const r = backtest(st.rules, st.capital, series, days, benchmark, st.from);
  s.results![st.id] = { ranAt: nowIso(ctx), dataTo: days.at(-1)!, universe: series.size, left, metrics: r.metrics, curve: curveOf(r.curve), trades: r.trades.slice(-MAX_TRADES), open: r.open, pending: r.pending, yearly: yearly(r.curve), monthly: monthly(r.curve) };
}

/** Advance every running paper book through each complete new session. */
export async function advancePaper(ctx: Context) {
  const s = ctx.state;
  for (const p of s.paper!.filter((x) => x.status === 'running')) {
    const st = s.strategies!.find((x) => x.id === p.strategyId); if (!st) continue;
    const { series, calendar: days } = await seriesFor(ctx, st); if (!series.size) continue;
    // A session counts once every stock in the book's universe has saved it.
    const lastComplete = [...series.values()].map((x) => x.bars.at(-1)!.date).sort()[0]!;
    let equity = p.equity.at(-1)?.equity ?? p.capital;
    for (const date of days.filter((d) => d > p.lastDate && d <= lastComplete)) {
      step(p.book, st.rules, series, date, equity);
      equity = equityOf(p.book, series, date);
      p.equity.push({ date, equity }); p.lastDate = date;
    }
    p.equity = p.equity.slice(-1500); p.book.fills = p.book.fills.slice(-MAX_TRADES); p.book.trades = p.book.trades.slice(-MAX_TRADES);
  }
}

/** A split or bonus after a paper entry rescales that position the way a broker would. */
export function applyActionsToPaper(s: State, symbol: string, list: Action[]) {
  for (const p of s.paper!) for (const a of list.filter((x) => x.factor !== 1)) {
    const key = `${symbol}:${a.exDate}:${a.kind}`;
    if (p.applied.includes(key) || a.exDate <= p.startedAt) continue;
    for (const pos of p.book.positions.filter((x: Position) => x.symbol === symbol && x.entryDate < a.exDate)) { pos.qty = Math.round(pos.qty / a.factor * 1e4) / 1e4; pos.entryPrice *= a.factor; }
    p.applied.push(key);
  }
}

// --- actions -------------------------------------------------------------------------

export interface Chart { symbol: string; bars: Bar[] }
/** The selected result's chart stock, adjusted, over the backtest's window. */
async function chartOf(ctx: Context): Promise<Chart | undefined> {
  const s = ctx.state, st = selected(s), r = st && s.results![st.id];
  if (!st || !r) return undefined;
  const pool = st.symbols.length ? st.symbols : s.universe!;
  const symbol = pool.includes(s.ui!.chartSymbol) ? s.ui!.chartSymbol : r.trades.at(-1)?.symbol ?? r.open[0]?.symbol ?? pool[0];
  if (!symbol) return undefined;
  const bars = adjust(await loadBars(ctx.database, symbol), await loadActions(ctx.database, symbol)).filter((b) => b.date >= r.metrics.start && b.date <= r.metrics.end);
  return { symbol, bars };
}
async function render(ctx: Context, focusSurface?: string) {
  const s = ctx.state;
  s.storageLimit = ctx.database.maxBytes;
  await initialize(ctx.database);
  return { updates: view(s, today(ctx), await chartOf(ctx)), ...(focusSurface ? { focusSurface } : {}) };
}
const selected = (s: State) => s.strategies!.find((x) => x.id === s.ui!.strategy);
const go = (s: State, key: keyof Ui, tab: string) => { s.ui!.nav++; (s.ui as unknown as Record<string, unknown>)[key] = `${tab}#${s.ui!.nav}`; };

function applyDraft(s: State): Strategy {
  const st = selected(s); if (!st || !s.draft) throw new Error('Choose a strategy first.');
  const d = s.draft, n = (v: unknown, label: string, lo: number, hi: number) => {
    const x = typeof v === 'number' ? v : Number(str(v).replace(/[,\s₹%]/g, ''));
    if (!finite(x) || x < lo || x > hi) throw new Error(`${label} must be a number from ${lo.toLocaleString('en-IN')} to ${hi.toLocaleString('en-IN')}.`);
    return x;
  };
  const template = TEMPLATES.some((t) => t.value === d.template) ? d.template : st.rules.template;
  const params = Object.fromEntries(Object.entries(DEFAULT_PARAMS).map(([k]) => { const [lo, hi] = LIMITS[k as keyof Params]; return [k, Math.round(n(d.params[k as keyof Params], PARAM_LABELS[k as keyof Params], lo, hi))]; })) as unknown as Params;
  if (template === 'ma_cross' && params.fast >= params.slow) throw new Error('The fast average must be shorter than the slow one.');
  if (template === 'rsi_revert' && params.rsiBuy >= params.rsiSell) throw new Error('The RSI buy level must be below the sell level.');
  const from = str(d.from, 10);
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('Start date must be a date, or blank for all saved history.');
  const list = symbols(d.symbols);
  const outside = list.filter((x) => !s.universe!.includes(x));
  if (outside.length) throw new Error(`${outside.join(', ')} ${outside.length === 1 ? 'is' : 'are'} not in the data universe. Add ${outside.length === 1 ? 'it' : 'them'} in Data first.`);
  Object.assign(st, { name: str(d.name, 60).trim() || 'Untitled strategy', symbols: list, capital: n(d.capital, 'Capital', 10_000, 1e10), from, updated: new Date().toISOString(),
    rules: { template, params, maxPositions: Math.round(n(d.maxPositions, 'Maximum positions', 1, 50)), stopPct: n(d.stopPct, 'Stop loss', 0, 50), targetPct: n(d.targetPct, 'Profit target', 0, 500), costBps: n(d.costBps, 'Costs', 0, 200), slippageBps: n(d.slippageBps, 'Slippage', 0, 200) } });
  s.draft = draftOf(st);
  return st;
}
export const PARAM_LABELS: Record<keyof Params, string> = { fast: 'Fast average (sessions)', slow: 'Slow average (sessions)', entryDays: 'Entry window (sessions)', exitDays: 'Exit window (sessions)', rsiDays: 'RSI length (sessions)', rsiBuy: 'Buy below RSI', rsiSell: 'Sell above RSI', lookback: 'Return lookback (sessions)', top: 'Leaders to hold', rebalanceDays: 'Rebalance every (sessions)' };

export async function handleAction(controlId: string, value: unknown, ctx: Context, action?: string) {
  const s = normalize(ctx.state); await initialize(ctx.database);
  // A confirmation belongs to the action that set it; the next action clears it.
  if (action) s.note = undefined;
  const payload = obj(value) ?? {};
  if (!action) {
    // Field edits: drafts and pickers save as typed; buttons validate and apply them.
    if (controlId === '/addDraft') s.addDraft = str(value, 400);
    else if (controlId.startsWith('/draft/params/') && s.draft) (s.draft.params as Record<string, unknown>)[controlId.slice(14)] = typeof value === 'number' ? value : str(value, 20);
    else if (controlId.startsWith('/draft/') && s.draft) (s.draft as unknown as Record<string, unknown>)[controlId.slice(7)] = typeof value === 'number' ? value : str(value, 2000);
    else if (controlId === '/benchmark') {
      const b = str(value);
      if (BENCHMARKS.includes(b) && b !== s.benchmark) { s.benchmark = b; s.bench = {}; s.results = {}; s.note = `Benchmark changed to ${b}; its history syncs next and results run again on demand.`; }
    } else if (controlId === '/chartSymbol') s.ui!.chartSymbol = str(value, 30);
    else if (controlId === '/strategyPick') { const x = s.strategies!.find((y) => y.id === str(value)); if (x) { s.ui!.strategy = x.id; s.draft = draftOf(x); } }
    else if (controlId === '/paperPick') { if (s.paper!.some((p) => p.id === str(value))) s.ui!.paper = str(value); }
    else throw new Error('That field is not part of Strategy Lab.');
    return render(ctx);
  }
  switch (action) {
    case 'sync': return sync(ctx);
    case 'add_symbols': {
      const add = symbols(s.addDraft).filter((x) => !s.universe!.includes(x));
      if (!add.length) throw new Error('Type one or more NSE symbols to add, separated by commas.');
      if (s.universe!.length + add.length > MAX_UNIVERSE) throw new Error(`The universe holds up to ${MAX_UNIVERSE} stocks; remove some before adding ${add.length}.`);
      s.universe!.push(...add); for (const x of add) s.sync![x] = {};
      s.addDraft = ''; s.note = `${add.join(', ')} added; history syncs in the background.`;
      return render(ctx);
    }
    case 'remove_symbol': {
      const sym = str(payload.symbol, 30);
      if (s.ui!.confirm !== `remove:${sym}`) { s.ui!.confirm = `remove:${sym}`; return render(ctx); }
      s.universe = s.universe!.filter((x) => x !== sym); delete s.sync![sym]; delete s.actionList![sym];
      for (const st of s.strategies!) st.symbols = st.symbols.filter((x) => x !== sym);
      await forget(ctx.database, sym); await refreshCoverage(ctx); s.ui!.confirm = '';
      s.note = `${sym} removed with its saved history.`;
      return render(ctx);
    }
    case 'retry_symbol': {
      // Ask NSE again for the whole window; saved sessions stay and each reading replaces its day.
      const sym = str(payload.symbol, 30); if (!s.universe!.includes(sym)) throw new Error('That stock is not in the data universe.');
      await forgetSpans(ctx.database, sym); s.sync![sym] = {}; s.note = `${sym} is read again from NSE over the whole window.`;
      return sync(ctx);
    }
    case 'cancel': s.ui!.confirm = ''; return render(ctx);
    case 'new_strategy': {
      if (s.strategies!.length >= MAX_STRATEGIES) throw new Error(`Strategy Lab keeps up to ${MAX_STRATEGIES} strategies; delete one first.`);
      const template = TEMPLATES.some((t) => t.value === payload.template) ? payload.template as Template : 'ma_cross';
      const st: Strategy = { id: id('st'), name: `New ${TEMPLATES.find((t) => t.value === template)!.label.toLowerCase()}`, rules: rulesOf({ template }), symbols: [], capital: 1_000_000, from: '', created: new Date().toISOString(), updated: new Date().toISOString() };
      s.strategies!.push(st); s.ui!.strategy = st.id; s.draft = draftOf(st); go(s, 'strategiesTab', 'rules');
      return render(ctx, 'strategies');
    }
    case 'open_strategy': {
      const st = s.strategies!.find((x) => x.id === str(payload.id)); if (!st) throw new Error('That strategy no longer exists.');
      s.ui!.strategy = st.id; s.draft = draftOf(st); s.ui!.confirm = '';
      const to = str(payload.to, 20);
      if (to === 'results') { go(s, 'resultsTab', 'performance'); return render(ctx, 'results'); }
      return render(ctx, 'strategies');
    }
    case 'save_strategy': { applyDraft(s); s.note = 'Strategy saved. Run the backtest to see its results.'; return render(ctx); }
    case 'discard_draft': { const st = selected(s); if (st) s.draft = draftOf(st); return render(ctx); }
    case 'duplicate_strategy': {
      const st = selected(s); if (!st) throw new Error('Choose a strategy first.');
      if (s.strategies!.length >= MAX_STRATEGIES) throw new Error(`Strategy Lab keeps up to ${MAX_STRATEGIES} strategies; delete one first.`);
      const copy: Strategy = { ...structuredClone(st), id: id('st'), name: `${st.name} (copy)`.slice(0, 60), created: new Date().toISOString(), updated: new Date().toISOString() };
      s.strategies!.push(copy); s.ui!.strategy = copy.id; s.draft = draftOf(copy);
      return render(ctx);
    }
    case 'delete_strategy': {
      const st = selected(s); if (!st) throw new Error('Choose a strategy first.');
      if (s.ui!.confirm !== `delete:${st.id}`) { s.ui!.confirm = `delete:${st.id}`; return render(ctx); }
      s.strategies = s.strategies!.filter((x) => x !== st); delete s.results![st.id]; s.paper = s.paper!.filter((p) => p.strategyId !== st.id);
      s.ui!.confirm = ''; s.ui!.strategy = s.strategies[0]?.id ?? ''; normalize(s);
      return render(ctx);
    }
    case 'run_backtest': {
      const st = payload.id ? s.strategies!.find((x) => x.id === str(payload.id)) : applyDraft(s);
      if (!st) throw new Error('That strategy no longer exists.');
      s.ui!.strategy = st.id; s.draft = draftOf(st);
      await runBacktest(ctx, st); go(s, 'resultsTab', 'performance');
      return render(ctx, 'results');
    }
    case 'run_all': {
      let ran = 0;
      for (const st of s.strategies!) { try { await runBacktest(ctx, st); ran++; } catch { /* reported below */ } }
      if (!ran) throw new Error('No saved history yet. Let the sync finish in Data, then run again.');
      s.note = `${ran} of ${s.strategies!.length} strategies ran on data to ${s.results![s.strategies![0]!.id]?.dataTo ?? 'the latest session'}.`;
      return render(ctx, 'lab');
    }
    case 'chart_symbol': s.ui!.chartSymbol = str(payload.symbol, 30); go(s, 'resultsTab', 'chart'); return render(ctx, 'results');
    case 'start_paper': {
      const st = s.strategies!.find((x) => x.id === str(payload.id)) ?? selected(s); if (!st) throw new Error('Choose a strategy first.');
      if (s.paper!.length >= MAX_PAPER) throw new Error(`Up to ${MAX_PAPER} paper accounts run at once; stop one first.`);
      const days = (await latestSessions(ctx.database, 2)).reverse(); if (days.length < 2) throw new Error('Paper trading starts once history has synced. See Data.');
      const p: Paper = { id: id('pa'), strategyId: st.id, name: st.name, startedAt: days.at(-1)!, capital: st.capital, book: newBook(st.capital), equity: [], lastDate: days.at(-2)!, status: 'running', applied: [] };
      s.paper!.push(p); s.ui!.paper = p.id;
      await advancePaper(ctx);
      s.note = `Paper account started from the ${p.startedAt} close. Orders fill at the next session's open as each day's data arrives.`;
      return render(ctx, 'paper');
    }
    case 'pause_paper': case 'resume_paper': {
      const p = s.paper!.find((x) => x.id === str(payload.id)); if (!p) throw new Error('That paper account no longer exists.');
      p.status = action === 'pause_paper' ? 'paused' : 'running'; if (p.status === 'running') await advancePaper(ctx);
      return render(ctx);
    }
    case 'stop_paper': {
      const pid = str(payload.id);
      if (s.ui!.confirm !== `stop:${pid}`) { s.ui!.confirm = `stop:${pid}`; return render(ctx); }
      s.paper = s.paper!.filter((x) => x.id !== pid); s.ui!.confirm = ''; s.ui!.paper = s.paper[0]?.id ?? '';
      return render(ctx);
    }
    case 'open_paper': { if (s.paper!.some((p) => p.id === str(payload.id))) s.ui!.paper = str(payload.id); go(s, 'paperTab', 'positions'); return render(ctx, 'paper'); }
    default: throw new Error('That action is not part of Strategy Lab.');
  }
}

/** Read-only queries for the assistant and other apps. */
export async function handleQuery(toolName: string, params: Record<string, unknown> = {}, context: Context): Promise<unknown> {
  const s = normalize(context.state);
  const summary = (st: Strategy) => { const r = s.results![st.id]; return { id: st.id, name: st.name, template: st.rules.template, stocks: st.symbols.length || s.universe!.length, capital: st.capital, ...(r ? { ranAt: r.ranAt, dataTo: r.dataTo, metrics: r.metrics } : { metrics: null }) }; };
  if (toolName === 'get_strategy_results') {
    const one = str(params.strategy, 60).toLowerCase();
    const list = s.strategies!.filter((st) => !one || st.id === one || st.name.toLowerCase().includes(one));
    return { note: 'Backtests on delayed end-of-day NSE data adjusted for splits and bonuses, price returns only, costs as configured. Historical simulation, not advice or a forecast.', benchmark: s.benchmark, strategies: list.map(summary) };
  }
  if (toolName === 'get_paper_accounts') {
    return { note: 'Paper accounts simulate fills at the next session open from end-of-day NSE data. No orders reach any broker.', accounts: s.paper!.map((p) => ({ id: p.id, strategy: p.name, status: p.status, startedAt: p.startedAt, lastSession: p.lastDate, capital: p.capital, equity: p.equity.at(-1)?.equity ?? p.capital, cash: p.book.cash, positions: p.book.positions, nextOrders: p.book.pending, closedTrades: p.book.trades.length })) };
  }
  throw new Error(`Unknown Strategy Lab query ${toolName}`);
}

export const surfaceFile = () => view(normalize({}), '2026-11-02').map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));
export async function renderApp(context: Context) { context.state = normalize(context.state); await initialize(context.database); await refreshCoverage(context); return render(context); }
