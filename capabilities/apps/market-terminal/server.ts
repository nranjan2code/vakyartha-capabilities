// NSE Market Terminal: delayed NSE observations from the declared NSE read tools.
// Quotes, index snapshots, breadth, movers, research, holdings, alerts and
// receipts live in `context.state`; daily stock OHLCV lives in DuckDB `prices`.
// `view()` (views.ts) derives every surface from those two owners on each run, and
// a failed read is recorded, never filled in. A run allows 16 governed tool calls,
// so each action reads only what its view needs.
import { initialize, saveHistory, analyze, type Database, type Bar } from './analytics.ts';
import {
  active as parseActive, allIndices, bulk, compareIndices, corporateActions, decode, historyChunk, indexHistory, indexMovers, indexNames,
  indexPerformance, mood as parseMood, movers as parseMovers, quote, range52, search as parseSearch, valuation, versus, volumeProfile,
  type Group, type IndexBar,
} from './source.ts';
import { draftView, view, TITLES, EMPTY_ANALYSIS, marketBrief, portfolio, session, type Analysis } from './views.ts';
import { marketProgramme } from './show.ts';

export { view, TITLES, EMPTY_ANALYSIS, type Analysis };
export interface Quote { symbol: string; last: number; previous: number; changePct: number; open: number | null; high: number; low: number; volume: number; asOf: string; basis: 'live' | 'close'; fetchedAt: string }
export interface Index { label: string; group: Group; last: number; previous: number; changePct: number; open: number | null; high: number | null; low: number | null; exchangeAt: string }
export interface Holding { symbol: string; qty: number; cost: number }
export interface Alert { id: string; symbol: string; kind: 'above' | 'below' | 'move'; value: number; createdAt: string; triggeredAt?: string; triggeredValue?: number }
export interface Receipt { subject: string; tool: string; fetchedAt: string; sourceAt: string; rows: number; status: string }
export type Movers = ReturnType<typeof parseMovers>;
export type Mood = ReturnType<typeof parseMood>;
export interface Research {
  range?: ReturnType<typeof range52>; versus?: ReturnType<typeof versus>; actions?: ReturnType<typeof corporateActions>;
  volume?: ReturnType<typeof volumeProfile>; news?: { title: string; source: string; url: string; publishedAt: string | null; publishers: number }[]; window?: string; at?: string;
}
export interface Intraday { day: string; series: Record<string, { t: string; v: number }[]> }
export const INTRADAY_KEYS = ['NIFTY 50', 'NIFTY BANK', 'NIFTY NEXT 50', 'NIFTY MIDCAP 100', 'NIFTY SMLCAP 100', 'INDIA VIX'], MAX_POINTS = 400;
export interface IndexStudy { label: string; performance?: ReturnType<typeof indexPerformance>; bars?: IndexBar[]; valuation?: ReturnType<typeof valuation>; at?: string }
export interface State {
  watchlist?: string[]; watchDraft?: string; groups?: Record<string, string[]>; group?: string; groupDraft?: string; holdings?: Holding[]; holdingDraft?: { symbol?: string; qty?: string; cost?: string };
  alerts?: Alert[]; alertDraft?: { symbol?: string; kind?: string; value?: string };
  symbol?: string; symbolDraft?: string; months?: string; benchmark?: string; research?: Record<string, Research>; historyFor?: Record<string, string>;
  quotes?: Record<string, Quote>; indices?: Index[]; indexGroup?: string; segment?: string; movers?: Movers; mood?: Mood;
  active?: { byValue?: ReturnType<typeof parseActive>; byVolume?: ReturnType<typeof parseActive> }; period?: string; indexMovers?: ReturnType<typeof indexMovers>;
  searchDraft?: string; searchQuery?: string; searchMessage?: string; results?: ReturnType<typeof parseSearch>; indexNames?: string[]; study?: IndexStudy; studyDraft?: string;
  compareSet?: string[]; compareMonths?: string; comparison?: ReturnType<typeof compareIndices>;
  receipts?: Receipt[]; problem?: string; checkedAt?: string; triggered?: string[];
  /** Today's readings (India time) of the headline indices and live watchlist quotes, one point per refresh, for live charts. */
  intraday?: Intraday;
  // Version 2 fields, read once by normalize().
  broad?: unknown[]; sectoral?: unknown[]; derivatives?: unknown[];
}
export interface Context {
  state: State; surfaces?: Record<string, unknown>; database: Database;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

const DEFAULT_WATCH = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC'];
export const MAX_WATCH = 30, MAX_HOLDINGS = 50, MAX_ALERTS = 40, LIVE_QUOTES = 12;
export const BENCHMARKS = ['Nifty 50', 'Nifty Bank', 'Nifty Next 50', 'Nifty Midcap 100', 'Nifty IT', 'Nifty 500'];
export const SEGMENTS = [{ label: 'NIFTY 50', value: 'NIFTY' }, { label: 'NIFTY BANK', value: 'BANKNIFTY' }, { label: 'NIFTY NEXT 50', value: 'NIFTYNEXT50' }, { label: 'All securities', value: 'ALL' }];
export const moverSegment = (value: string) => SEGMENTS.find((s) => s.value === value || s.label === value)?.value ?? (value === 'allSec' ? 'ALL' : value);
export const WINDOWS: Record<string, number> = { '1': 1, '3': 3, '6': 6, '12': 12 };
export const PERIODS = ['1D', '1W', '1M', '3M', '6M', '1Y'];

// --- canonical state ---------------------------------------------------------------

const SYMBOL = /^[A-Z0-9][A-Z0-9&.-]{0,24}$/;
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v : '').slice(0, max);
// Projection number inputs emit numbers; draft text must preserve those edits.
const draftText = (v: unknown, max = 40) => str(typeof v === 'number' && Number.isFinite(v) ? String(v) : v, max);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined);
/** Comma or space separated symbols to an exact, de-duplicated list; throws a sentence the person can act on. */
export function symbols(value: unknown, max = MAX_WATCH): string[] {
  const list = [...new Set(String(value ?? '').toUpperCase().split(/[\s,]+/).filter(Boolean))];
  const bad = list.find((s) => !SYMBOL.test(s));
  if (bad) throw new Error(`"${bad}" is not an NSE equity symbol`);
  if (!list.length || list.length > max) throw new Error(`Enter 1–${max} NSE symbols, separated by commas`);
  return list;
}
const one = (value: unknown) => { const list = symbols(value, 1); return list[0]!; };
function validQuote(q: Record<string, unknown>): Quote | undefined {
  if (!q || typeof q.symbol !== 'string' || ![q.last, q.previous, q.changePct, q.high, q.low, q.volume].every(finite)) return undefined;
  const asOf = typeof q.asOf === 'string' ? q.asOf : typeof q.exchangeAt === 'string' ? `${q.exchangeAt} IST` : '';
  if (!asOf) return undefined;
  return { symbol: q.symbol, last: q.last as number, previous: q.previous as number, changePct: q.changePct as number, open: finite(q.open) ? q.open : null, high: q.high as number, low: q.low as number, volume: q.volume as number, asOf, basis: q.basis === 'close' ? 'close' : 'live', fetchedAt: str(q.fetchedAt, 40) };
}
function validIndex(r: Record<string, unknown>, group?: Group): Index | undefined {
  if (!r || typeof r.label !== 'string' || !finite(r.last) || !finite(r.changePct) || typeof r.exchangeAt !== 'string') return undefined;
  return { label: r.label, group: (r.group as Group) ?? group ?? 'broad', last: r.last, previous: finite(r.previous) ? r.previous : r.last / (1 + r.changePct / 100), changePct: r.changePct, open: finite(r.open) ? r.open : null, high: finite(r.high) ? r.high : null, low: finite(r.low) ? r.low : null, exchangeAt: r.exchangeAt };
}
/** Named watchlists: the active one is `watchlist`; the others wait in `groups`. */
function groupsOf(s: State, watchlist: string[]) {
  const groups: Record<string, string[]> = Object.create(null);
  const group = typeof s.group === 'string' && s.group.trim() ? str(s.group, 30).trim() : 'Main';
  for (const [name, list] of Object.entries(obj(s.groups) ?? {}).slice(0, 10)) {
    const n = str(name, 30).trim();
    try { if (n && n !== group && Object.keys(groups).length < 9) groups[n] = symbols(Array.isArray(list) ? list.join(',') : ''); } catch { /* drop an unusable group */ }
  }
  groups[group] = watchlist;
  return { groups, group };
}
const choice = (v: unknown, options: string[], fallback: string) => (options.includes(String(v)) ? String(v) : fallback);

/** State arrives as untrusted JSON, possibly from version 1 (watchlist string) or 2 (index groups as separate arrays). */
export function normalize(s: State): State {
  let watchlist = DEFAULT_WATCH;
  try { watchlist = symbols(Array.isArray(s.watchlist) ? s.watchlist.join(',') : s.watchlist ?? DEFAULT_WATCH.join(',')); } catch { /* keep the default */ }
  const quotes: Record<string, Quote> = {};
  for (const [k, q] of Object.entries(obj(s.quotes) ?? {})) { const v = SYMBOL.test(k) ? validQuote(q as Record<string, unknown>) : undefined; if (v) quotes[k] = v; }
  const legacy = ([['derivatives', s.derivatives], ['broad', s.broad], ['sectoral', s.sectoral]] as const).flatMap(([g, rows]) => (Array.isArray(rows) ? rows.map((r) => validIndex(r as Record<string, unknown>, g)) : []));
  const indices = [...new Map([...(Array.isArray(s.indices) ? s.indices.map((r) => validIndex(r as unknown as Record<string, unknown>)) : []), ...legacy].filter((r): r is Index => !!r).map((r) => [r.label, r])).values()].slice(0, 200);
  const holdings = (Array.isArray(s.holdings) ? s.holdings : []).filter((h) => h && SYMBOL.test(h.symbol) && Number.isSafeInteger(h.qty) && h.qty > 0 && Number.isSafeInteger(h.cost) && h.cost > 0).slice(0, MAX_HOLDINGS);
  const alerts = (Array.isArray(s.alerts) ? s.alerts : []).filter((a) => a && typeof a.id === 'string' && SYMBOL.test(a.symbol) && ['above', 'below', 'move'].includes(a.kind) && finite(a.value) && a.value > 0).slice(0, MAX_ALERTS);
  const symbol = typeof s.symbol === 'string' && SYMBOL.test(s.symbol) ? s.symbol : watchlist[0]!;
  const research: Record<string, Research> = {};
  for (const [k, v] of Object.entries(obj(s.research) ?? {}).slice(-20)) if (SYMBOL.test(k) && obj(v)) research[k] = v as Research;
  const historyFor: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(s.historyFor) ?? {})) if (SYMBOL.test(k) && typeof v === 'string') historyFor[k] = v.slice(0, 200);
  const hd = obj(s.holdingDraft) ?? {}, ad = obj(s.alertDraft) ?? {};
  const names = Array.isArray(s.indexNames) ? s.indexNames.filter((n) => typeof n === 'string').slice(0, 400) : [];
  const compareSet = (Array.isArray(s.compareSet) ? s.compareSet : ['Nifty 50', 'Nifty Bank', 'Nifty IT']).filter((n) => typeof n === 'string').slice(0, 10);
  const study = obj(s.study) && typeof s.study!.label === 'string' ? s.study : undefined;
  return {
    watchlist, watchDraft: str(s.watchDraft, 40), ...groupsOf(s, watchlist), groupDraft: str(s.groupDraft, 30), holdings, holdingDraft: { symbol: str(hd.symbol, 30), qty: draftText(hd.qty, 20), cost: draftText(hd.cost, 20) },
    alerts, alertDraft: { symbol: str(ad.symbol, 30), kind: choice(ad.kind, ['above', 'below', 'move'], 'above'), value: str(ad.value, 20) },
    symbol, symbolDraft: typeof s.symbolDraft === 'string' ? str(s.symbolDraft, 30) : symbol, months: choice(s.months, Object.keys(WINDOWS), '3'),
    benchmark: choice(s.benchmark, BENCHMARKS, 'Nifty 50'), research, historyFor,
    quotes, indices, indexGroup: choice(s.indexGroup, ['all', 'derivatives', 'broad', 'sectoral', 'strategy', 'thematic', 'fixed_income'], 'all'),
    segment: choice(s.segment, SEGMENTS.map((x) => x.value), 'NIFTY'), ...(obj(s.movers) ? { movers: s.movers } : {}), ...(obj(s.mood) ? { mood: s.mood } : {}),
    active: obj(s.active) ?? {}, period: choice(s.period, PERIODS, '1D'), ...(obj(s.indexMovers) ? { indexMovers: s.indexMovers } : {}),
    searchDraft: str(s.searchDraft, 40), searchQuery: str(s.searchQuery, 40), searchMessage: str(s.searchMessage, 500), results: s.searchQuery && s.searchQuery === str(s.searchDraft, 40).trim() && Array.isArray(s.results) ? s.results.slice(0, 60) : [], indexNames: names,
    ...(study ? { study } : {}), studyDraft: str(s.studyDraft, 80) || study?.label || 'Nifty 50',
    compareSet, compareMonths: choice(s.compareMonths, ['3', '6', '12'], '6'), ...(obj(s.comparison) ? { comparison: s.comparison } : {}),
    receipts: (Array.isArray(s.receipts) ? s.receipts : []).filter((r) => r && typeof r.tool === 'string').slice(0, 60),
    problem: typeof s.problem === 'string' ? s.problem.slice(0, 800) : undefined, checkedAt: typeof s.checkedAt === 'string' ? s.checkedAt : undefined,
    triggered: (Array.isArray(s.triggered) ? s.triggered : []).filter((id) => alerts.some((a) => a.id === id)),
    ...((d) => d ? { intraday: d } : {})(intradayOf(s.intraday)),
  };
}
function intradayOf(raw: unknown): Intraday | undefined {
  const o = obj(raw), day = str(o?.day, 10);
  if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const series: Intraday['series'] = {};
  for (const [k, list] of Object.entries(obj(o.series) ?? {}).slice(0, 40)) {
    if (!INTRADAY_KEYS.includes(k) && !SYMBOL.test(k)) continue;
    const pts = (Array.isArray(list) ? list : []).flatMap((p) => { const q = obj(p); return q && finite(q.v) && typeof q.t === 'string' && !Number.isNaN(Date.parse(q.t)) ? [{ t: q.t, v: q.v }] : []; }).slice(-MAX_POINTS);
    if (pts.length) series[k] = pts;
  }
  return { day, series };
}
/** India-time calendar day, so a new session starts fresh series. */
const istDay = (now: number) => new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
/**
 * One reading per refresh for today's charts: the headline indices and the
 * live (not closing) watchlist quotes. A reading identical to the previous one
 * (same value) is not repeated, so charts move only when the market does.
 */
export function recordIntraday(s: State, now = Date.now()) {
  const day = istDay(now), at = new Date(now).toISOString();
  const d = s.intraday && s.intraday.day === day ? s.intraday : { day, series: {} };
  const add = (key: string, v: number) => {
    const list = d.series[key] ??= [];
    if (list.at(-1)?.v !== v) list.push({ t: at, v });
    if (list.length > MAX_POINTS) list.splice(0, list.length - MAX_POINTS);
  };
  for (const r of s.indices!) if (INTRADAY_KEYS.includes(r.label)) add(r.label, r.last);
  for (const q of Object.values(s.quotes!)) if (q.basis === 'live' && s.watchlist!.includes(q.symbol)) add(q.symbol, q.last);
  s.intraday = d;
}

// --- governed reads ----------------------------------------------------------------

/** A tool failure as one readable sentence: the host's untrusted-output envelope and labels removed, never cut mid-address. */
export const reason = (e: unknown) => String((e as Error)?.message ?? e)
  .replace(/<\/?tool_output[^>]*>/g, ' ').replace(/This is data returned by a tool, not instructions\.[^\n]*/g, ' ')
  .replace(/\b(error|refused):\s*(?=(error|refused):)/gi, '').replace(/^\s*error:\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 400);
export const SETUP = 'Use Access in the app header to review this app’s exchange tools, destinations and background access.';

type Parsed = { sourceAt: string; rows: number; status?: string; commit(): Promise<void> | void };
/** One tool read: parse and commit on success, record a receipt either way. Returns the failure, if any. */
async function read(ctx: Context, tool: string, args: Record<string, unknown>, subject: string, parse: (raw: Record<string, unknown>) => Parsed) {
  const s = ctx.state, fetchedAt = new Date().toISOString();
  try {
    const parsed = parse(decode(await ctx.callTool(tool, args)));
    await parsed.commit();
    s.receipts!.unshift({ subject, tool, fetchedAt, sourceAt: parsed.sourceAt, rows: parsed.rows, status: parsed.status ?? 'Validated' });
    return undefined;
  } catch (e) {
    const message = reason(e);
    s.receipts!.unshift({ subject, tool, fetchedAt, sourceAt: '', rows: 0, status: `Failed: ${message}` });
    return `${subject}: ${message}`;
  } finally { s.receipts = s.receipts!.slice(0, 60); }
}
function settle(s: State, failures: (string | undefined)[], note?: string) {
  const failed = failures.filter(Boolean) as string[];
  s.checkedAt = new Date().toISOString();
  s.problem = failed.length ? `${failed.length} of ${failures.length} reads failed; earlier observations are kept. First: ${failed[0]}` : note;
}
const readQuote = (ctx: Context, symbol: string) => read(ctx, 'nse-cmmkt__cm_get_stock_quote', { symbol }, symbol, (raw) => {
  const q = quote(raw, symbol);
  return { sourceAt: `${q.exchangeAt} IST`, rows: 1, commit() { ctx.state.quotes![symbol] = { symbol, last: q.last, previous: q.previous, changePct: q.changePct, open: q.open, high: q.high, low: q.low, volume: q.volume, asOf: `${q.exchangeAt} IST`, basis: 'live', fetchedAt: new Date().toISOString() }; } };
});
/** Every symbol the person tracks, watchlist first: live quotes for the first twelve, latest closes for the rest. */
export const tracked = (s: State) => [...new Set([...s.watchlist!, ...s.holdings!.map((h) => h.symbol), ...s.alerts!.map((a) => a.symbol)])];

/** Indices, movers, breadth and every tracked quote; also the scheduled refresh. At most 16 reads. */
export async function refreshMarket(ctx: Context) {
  const s = (ctx.state = normalize(ctx.state));
  const failures: (string | undefined)[] = [];
  failures.push(await read(ctx, 'nse-cmmkt__cm_get_live_indices', { group: 'all', nameFilter: '' }, 'all indices', (raw) => {
    const r = allIndices(raw);
    return { sourceAt: r.sourceAt, rows: r.rows.length, ...(r.dropped ? { status: `Validated with ${r.dropped} row(s) dropped. First: ${r.diagnostics[0]}` } : {}), commit() { s.indices = r.rows; } };
  }));
  failures.push(await readMovers(ctx));
  failures.push(await read(ctx, 'nse__get_market_mood', { date: 'today' }, 'market mood', (raw) => {
    const m = parseMood(raw);
    return { sourceAt: `${m.date} (end of day)`, rows: m.benchmarks.length, commit() { s.mood = m; } };
  }));
  const all = tracked(s), live = all.slice(0, LIVE_QUOTES), rest = all.slice(LIVE_QUOTES, LIVE_QUOTES + 50);
  if (rest.length) failures.push(await read(ctx, 'nse__get_bulk_quote', { symbols: rest }, `${rest.length} closes`, (raw) => {
    const closes = bulk(raw, rest);
    return { sourceAt: `${Object.values(closes)[0]?.date ?? '—'} close`, rows: Object.keys(closes).length, commit() {
      for (const c of Object.values(closes)) s.quotes![c.symbol] = { ...c, asOf: `${c.date} close`, basis: 'close', fetchedAt: new Date().toISOString() };
    } };
  }));
  for (const symbol of live) failures.push(await readQuote(ctx, symbol));
  checkAlerts(s);
  if (session().tone === 'success') recordIntraday(s);
  settle(s, failures);
  return render(ctx);
}
const readMovers = (ctx: Context) => read(ctx, 'nse-cmmkt__nse_get_market_movers', { indexName: ctx.state.segment === 'ALL' ? 'allSec' : ctx.state.segment, limit: 15 }, `movers ${ctx.state.segment}`, (raw) => {
  const m = parseMovers(raw);
  if (moverSegment(m.segment) !== ctx.state.segment) throw new Error(`NSE movers identity mismatch: requested ${ctx.state.segment}, received ${m.segment}`);
  return { sourceAt: m.at, rows: m.gainers.length + m.losers.length, commit() { ctx.state.movers = m; } };
});

/** Marks alerts whose condition the latest quote meets; a triggered alert stays until re-armed. */
export function checkAlerts(s: State) {
  const now = new Date().toISOString(), fired: string[] = [];
  for (const a of s.alerts!) {
    const q = s.quotes![a.symbol];
    if (!q || a.triggeredAt) continue;
    const hit = a.kind === 'above' ? q.last >= a.value : a.kind === 'below' ? q.last <= a.value : Math.abs(q.changePct) >= a.value;
    if (hit) { a.triggeredAt = now; a.triggeredValue = a.kind === 'move' ? q.changePct : q.last; fired.push(a.id); }
  }
  s.triggered = fired;
}

async function fetchInstrument(ctx: Context) {
  const s = ctx.state, symbol = s.symbol!, months = WINDOWS[s.months!]!;
  await initialize(ctx.database);
  const failures = [await readQuote(ctx, symbol)];
  // History arrives in chunks of up to three months; each chunk names the next older one.
  const bars: Bar[] = [];
  let end = 'today', remaining = months, chunkFailed: string | undefined;
  while (remaining > 0 && !chunkFailed) {
    const take = Math.min(3, remaining);
    let next: string | null = null;
    chunkFailed = await read(ctx, 'nse__get_stock_history', { symbol, months: take, endDate: end }, symbol, (raw) => {
      const chunk = historyChunk(raw, symbol);
      return { sourceAt: `${chunk.bars[0]!.date} – ${chunk.bars.at(-1)!.date} (daily)`, rows: chunk.bars.length, commit() { bars.push(...chunk.bars); next = chunk.next; } };
    });
    remaining -= take;
    if (!next) break;
    end = next;
  }
  failures.push(chunkFailed);
  if (bars.length) {
    const merged = [...new Map(bars.map((b) => [b.date, b])).values()].sort((a, b) => a.date.localeCompare(b.date));
    await saveHistory(ctx.database, symbol, merged);
    s.historyFor![symbol] = `${merged[0]!.date} – ${merged.at(-1)!.date} · ${merged.length} sessions${chunkFailed ? ` · older history unavailable (${chunkFailed.replace(/^[^:]+: /, '')})` : ''}`;
  }
  const r: Research = { ...(s.research![symbol] ?? {}), window: s.months, at: new Date().toISOString() };
  const from = new Date(Date.now() - 2 * 365 * 86400_000).toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
  failures.push(await read(ctx, 'nse__get_52_week_high_low', { symbol }, `${symbol} 52-week`, (raw) => { const v = range52(raw, symbol); return { sourceAt: `close ${v.close}`, rows: 1, commit() { r.range = v; } }; }));
  failures.push(await read(ctx, 'nse__get_stock_vs_index', { symbol, indexName: s.benchmark, months: Math.max(3, months), date: 'today' }, `${symbol} vs ${s.benchmark}`, (raw) => { const v = versus(raw, symbol); return { sourceAt: `${v.from} – ${v.to}`, rows: v.observations, commit() { r.versus = v; } }; }));
  failures.push(await read(ctx, 'nse__get_corporate_actions', { symbol, fromDate: from, toDate: today }, `${symbol} actions`, (raw) => { const v = corporateActions(raw, symbol); return { sourceAt: `${from} – ${today}`, rows: v.length, commit() { r.actions = v; } }; }));
  failures.push(await read(ctx, 'nse__get_volume_analysis', { symbol, days: 30 }, `${symbol} volume`, (raw) => { const v = volumeProfile(raw, symbol); return { sourceAt: `${v.days} sessions`, rows: v.days, commit() { r.volume = v; } }; }));
  // News is optional: a missing News Desk is noted in the ledger but is not a market failure.
  await read(ctx, 'app-news-desk__get_latest_articles', { query: symbol, limit: 6 }, `${symbol} news`, (raw) => {
    const stories = Array.isArray(raw.stories) ? raw.stories.slice(0, 6) : [];
    const news = stories.flatMap((x) => { const o = obj(x); return o && typeof o.title === 'string' && typeof o.url === 'string' && /^https:\/\//.test(o.url) ? [{ title: o.title.slice(0, 240), source: str(o.source, 80), url: o.url, publishedAt: typeof o.publishedAt === 'string' ? o.publishedAt : null, publishers: Array.isArray(o.publishers) ? o.publishers.length : 1 }] : []; });
    return { sourceAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : 'News Desk', rows: news.length, commit() { r.news = news; } };
  });
  s.research![symbol] = r;
  checkAlerts(s);
  settle(s, failures);
}

async function studyIndex(ctx: Context) {
  const s = ctx.state, label = s.studyDraft!.trim();
  if (!label) throw new Error('Choose an index to explore');
  const study: IndexStudy = { label, ...(s.study?.label.toLowerCase() === label.toLowerCase() ? s.study : {}), at: new Date().toISOString() };
  const failures: (string | undefined)[] = [];
  if (!s.indexNames!.length) failures.push(await read(ctx, 'nse__get_index_snapshot', { date: 'today', filter: '' }, 'index list', (raw) => { const names = indexNames(raw); return { sourceAt: 'end of day', rows: names.length, commit() { s.indexNames = names; } }; }));
  failures.push(await read(ctx, 'nse__get_index_performance', { indexName: label, date: 'today' }, `${label} performance`, (raw) => { const v = indexPerformance(raw); return { sourceAt: v.date, rows: v.horizons.length, commit() { study.performance = v; study.label = v.label; } }; }));
  failures.push(await read(ctx, 'nse__get_index_history', { indexName: label, months: 12, endDate: 'today' }, `${label} history`, (raw) => { const v = indexHistory(raw); return { sourceAt: `${v.bars[0]!.date} – ${v.bars.at(-1)!.date}`, rows: v.bars.length, commit() { study.bars = v.bars; } }; }));
  failures.push(await read(ctx, 'nse__get_index_valuation', { indexName: label, months: 24, date: 'today' }, `${label} valuation`, (raw) => { const v = valuation(raw); return { sourceAt: `${v.from} – ${v.to}`, rows: 3, commit() { study.valuation = v; } }; }));
  s.study = study;
  settle(s, failures);
}

// --- actions ---------------------------------------------------------------------

async function render(ctx: Context, focusSurface?: string) {
  await initialize(ctx.database);
  const analysis = await analyze(ctx.database, ctx.state.symbol!);
  return { updates: view(ctx.state, analysis), ...(focusSurface ? { focusSurface } : {}) };
}
/** Rupees text to whole paise, at most two decimals; throws a sentence the person can act on. */
export function paise(value: unknown, what: string): number {
  const t = String(value ?? '').replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t) || Number(t) <= 0) throw new Error(`${what} must be a positive amount with at most two decimals`);
  const [whole, frac = ''] = t.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
const payload = (value: unknown, key: string) => String(obj(value)?.[key] ?? '');
const FIELDS = new Set(['/groupDraft', '/watchDraft', '/searchDraft', '/symbolDraft', '/months', '/benchmark', '/segment', '/period', '/indexGroup', '/studyDraft', '/compareSet', '/compareMonths',
  '/holdingDraft/symbol', '/holdingDraft/qty', '/holdingDraft/cost', '/alertDraft/symbol', '/alertDraft/kind', '/alertDraft/value']);

export async function handleAction(controlId: string, value: unknown, ctx: Context, action?: string) {
  const s = (ctx.state = normalize(ctx.state));
  if (!action) {
    // Drafts and filters save as they change; buttons validate and apply them.
    if (!FIELDS.has(controlId)) throw new Error(`Unknown terminal field: ${controlId}`);
    if (controlId === '/searchDraft' && str(value, 40) !== s.searchDraft) { s.results = []; s.searchQuery = ''; s.searchMessage = ''; }
    const [, head, key] = controlId.split('/') as [string, string, string | undefined];
    if (key) (s as Record<string, Record<string, string>>)[head]![key] = draftText(value);
    else if (controlId === '/compareSet') s.compareSet = (Array.isArray(value) ? value : [value]).map((v) => str(v, 80)).filter(Boolean).slice(0, 10);
    else (s as Record<string, unknown>)[head] = controlId === '/symbolDraft' ? str(value, 30).toUpperCase() : str(value, 80);
    ctx.state = normalize(s);
    const updated = draftView(ctx.state, head);
    return updated ? { updates: [updated] } : render(ctx);
  }
  const symbolArg = payload(value, 'symbol');
  switch (action) {
    case 'refresh_market': return refreshMarket(ctx);
    case 'add_watch': {
      const added = symbolArg ? [one(symbolArg)] : symbols(s.watchDraft);
      const next = [...new Set([...s.watchlist!, ...added])];
      if (next.length > MAX_WATCH) throw new Error(`The watchlist keeps up to ${MAX_WATCH} symbols; remove some first`);
      s.watchlist = next; if (!symbolArg) s.watchDraft = '';
      const failures: (string | undefined)[] = [];
      for (const symbol of added.filter((x) => !s.quotes![x]).slice(0, 12)) failures.push(await readQuote(ctx, symbol));
      settle(s, failures);
      return render(ctx);
    }
    case 'switch_group': {
      const name = payload(value, 'group');
      if (!Object.hasOwn(s.groups!, name)) throw new Error('That watchlist no longer exists');
      s.groups![s.group!] = s.watchlist!; s.group = name; s.watchlist = s.groups![name];
      ctx.state = normalize(s);
      return render(ctx);
    }
    case 'save_group': {
      const name = s.groupDraft!.trim();
      if (!name) throw new Error('Name the new watchlist, such as Banks or Long term');
      if (Object.hasOwn(s.groups!, name)) throw new Error('A watchlist with that name exists');
      if (Object.keys(s.groups!).length >= 10) throw new Error('Keep up to 10 watchlists; delete one first');
      s.groups![s.group!] = s.watchlist!; s.groups![name] = [...s.watchlist!]; s.group = name; s.groupDraft = '';
      ctx.state = normalize(s);
      return render(ctx);
    }
    case 'delete_group': {
      const names = Object.keys(s.groups!).filter((n) => n !== s.group);
      if (!names.length) throw new Error('Keep at least one watchlist');
      delete s.groups![s.group!]; s.group = names[0]!; s.watchlist = s.groups![s.group]!;
      ctx.state = normalize(s);
      return render(ctx);
    }
    case 'remove_watch':
      if (s.watchlist!.length <= 1) throw new Error('Keep at least one symbol on the watchlist');
      s.watchlist = s.watchlist!.filter((x) => x !== symbolArg);
      return render(ctx);
    case 'move_watch': {
      const i = s.watchlist!.indexOf(symbolArg);
      if (i > 0) [s.watchlist![i - 1], s.watchlist![i]] = [s.watchlist![i]!, s.watchlist![i - 1]!];
      return render(ctx);
    }
    case 'clear_search':
      s.searchDraft = s.searchQuery = s.searchMessage = ''; s.results = [];
      return { updates: [draftView(s, 'searchDraft')!] };
    case 'clear_holding_draft':
      s.holdingDraft = { symbol: '', qty: '', cost: '' };
      return { updates: [draftView(s, 'holdingDraft')!] };
    case 'clear_alert_draft':
      s.alertDraft = { symbol: '', kind: 'above', value: '' };
      return { updates: [draftView(s, 'alertDraft')!] };
    case 'search': {
      const query = s.searchDraft!.trim();
      if (query.length < 2) throw new Error('Type at least two letters of a symbol or company');
      const failure = await read(ctx, 'nse__search_symbols', { query }, `search ${query}`, (raw) => { const r = parseSearch(raw); return { sourceAt: 'symbol master', rows: r.length, commit() { s.results = r; s.searchQuery = query; } }; });
      s.searchMessage = failure ? `Search failed: ${failure}` : s.results!.length ? '' : `No NSE symbols match “${query}”. Try a shorter part of the symbol.`;
      return { updates: [draftView(s, 'searchDraft')!, draftView(s, 'receipts')!] };
    }
    case 'fetch_instrument':
    case 'open_instrument': {
      const symbol = symbolArg ? one(symbolArg) : one(s.symbolDraft);
      s.symbol = s.symbolDraft = symbol;
      await fetchInstrument(ctx);
      return render(ctx, 'instrument');
    }
    case 'save_holding': {
      const d = s.holdingDraft!, symbol = one(d.symbol), qty = Number(String(d.qty).replace(/,/g, ''));
      if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 10_000_000) throw new Error('Quantity must be a whole number of shares');
      const cost = paise(d.cost, 'Average cost');
      const existing = s.holdings!.find((h) => h.symbol === symbol);
      if (existing) Object.assign(existing, { qty, cost });
      else { if (s.holdings!.length >= MAX_HOLDINGS) throw new Error(`The portfolio keeps up to ${MAX_HOLDINGS} holdings`); s.holdings!.push({ symbol, qty, cost }); }
      s.holdingDraft = { symbol: '', qty: '', cost: '' };
      const failure = s.quotes![symbol] ? undefined : await readQuote(ctx, symbol);
      settle(s, [failure]);
      return render(ctx);
    }
    case 'edit_holding': {
      const h = s.holdings!.find((x) => x.symbol === symbolArg);
      if (!h) throw new Error('That holding is no longer in the portfolio');
      s.holdingDraft = { symbol: h.symbol, qty: String(h.qty), cost: (h.cost / 100).toFixed(2) };
      return render(ctx);
    }
    case 'remove_holding':
      s.holdings = s.holdings!.filter((h) => h.symbol !== symbolArg);
      if (s.holdingDraft!.symbol?.trim().toUpperCase() === symbolArg) s.holdingDraft = { symbol: '', qty: '', cost: '' };
      return render(ctx);
    case 'add_alert': {
      const d = s.alertDraft!, symbol = one(d.symbol || symbolArg), v = Number(String(d.value).replace(/[₹,%\s]/g, ''));
      if (!Number.isFinite(v) || v <= 0) throw new Error(d.kind === 'move' ? 'Enter the session move in percent, such as 3' : 'Enter a positive price in rupees');
      if (s.alerts!.length >= MAX_ALERTS) throw new Error(`Keep up to ${MAX_ALERTS} alerts; delete some first`);
      s.alerts!.push({ id: `${symbol}-${d.kind}-${v}-${Date.now()}`, symbol, kind: d.kind as Alert['kind'], value: v, createdAt: new Date().toISOString() });
      s.alertDraft = { symbol: '', kind: d.kind, value: '' };
      checkAlerts(s);
      return render(ctx);
    }
    case 'prepare_alert': {
      const symbol = one(symbolArg);
      s.alertDraft = { ...s.alertDraft, symbol, value: s.alertDraft!.symbol === symbol ? s.alertDraft!.value : '' };
      return { updates: [draftView(s, 'alertDraft')!], focusSurface: 'alerts' };
    }
    case 'rearm_alert': { const a = s.alerts!.find((x) => x.id === payload(value, 'id')); if (a) { delete a.triggeredAt; delete a.triggeredValue; s.triggered = s.triggered!.filter((id) => id !== a.id); } return render(ctx); }
    case 'delete_alert': s.alerts = s.alerts!.filter((x) => x.id !== payload(value, 'id')); return render(ctx);
    case 'show_movers': {
      const segment = payload(value, 'segment');
      if (segment) {
        if (!SEGMENTS.some((x) => x.value === segment)) throw new Error('Choose an offered movers index');
        s.segment = segment;
      }
      settle(s, [await readMovers(ctx)]);
      return render(ctx);
    }
    case 'refresh_movers': {
      const failures = [await readMovers(ctx)];
      for (const [key, sortBy] of [['byValue', 'value'], ['byVolume', 'volume']] as const) {
        failures.push(await read(ctx, 'nse__get_top_by_volume', { date: 'today', n: 15, sortBy }, `most active by ${sortBy}`, (raw) => { const v = parseActive(raw); return { sourceAt: v.date, rows: v.rows.length, commit() { s.active![key] = v; } }; }));
      }
      failures.push(await read(ctx, 'nse__get_index_movers', { date: 'today', period: s.period, n: 8, scope: 'all' }, `index movers ${s.period}`, (raw) => { const v = indexMovers(raw); return { sourceAt: v.base ? `${v.base} – ${v.date}` : v.date, rows: v.gainers.length + v.losers.length, commit() { s.indexMovers = v; } }; }));
      settle(s, failures);
      return render(ctx);
    }
    case 'study_index': if (payload(value, 'label')) s.studyDraft = payload(value, 'label'); await studyIndex(ctx); return render(ctx, payload(value, 'label') ? 'indices' : undefined);
    case 'compare_indices': {
      if (s.compareSet!.length < 2) throw new Error('Choose 2 to 10 indices to compare');
      const failure = await read(ctx, 'nse__compare_indices', { indexNames: s.compareSet, months: Number(s.compareMonths), date: 'today' }, 'index comparison', (raw) => { const v = compareIndices(raw); return { sourceAt: `${v.from} – ${v.to}`, rows: v.rows.length, commit() { s.comparison = v; } }; });
      settle(s, [failure]);
      return render(ctx);
    }
    case 'recalculate': case 'apply': return render(ctx);
    default: throw new Error(`Unknown terminal action: ${action}`);
  }
}

/** Read-only queries for other apps and the assistant, from the same saved observations as the views. */
export async function handleQuery(toolName: string, params: Record<string, unknown> = {}, context: Context): Promise<unknown> {
  const s = normalize(context.state);
  const quoteOf = (symbol: string) => { const q = s.quotes![symbol]; return q ? { symbol, last: q.last, previousClose: q.previous, changePct: q.changePct, high: q.high, low: q.low, volume: q.volume, asOf: q.asOf, basis: q.basis } : null; };
  if (toolName === 'get_market_summary') {
    const name = typeof params.watchlist === 'string' ? params.watchlist : s.group!;
    if (!Object.hasOwn(s.groups!, name)) throw new Error('Unknown watchlist; use one of: ' + Object.keys(s.groups!).join(', '));
    const selected = s.groups![name]!;
    return {
    checkedAt: s.checkedAt ?? null, watchlistName: name, availableWatchlists: Object.keys(s.groups!), watchlist: selected,
    quotes: (params.watchlist ? selected : tracked(s)).flatMap((symbol) => quoteOf(symbol) ?? []),
    unpricedSymbols: selected.filter((symbol) => !s.quotes![symbol]),
    indices: s.indices!.filter((r) => ['derivatives', 'broad', 'sectoral'].includes(r.group)).map((r) => ({ label: r.label, group: r.group, last: r.last, changePct: r.changePct, exchangeAt: r.exchangeAt })),
    breadth: s.mood ? { date: s.mood.date, stocks: s.mood.stocks, indices: s.mood.indices, indiaVix: s.mood.vix } : null,
    movers: s.movers ? { segment: s.movers.segment, gainers: s.movers.gainers.slice(0, 10), losers: s.movers.losers.slice(0, 10) } : null,
  };
  }
  if (toolName === 'get_market_brief') {
    // The programme is the shareable show: another app publishes it at its own voice.listen path to play or watch it.
    let analysis = EMPTY_ANALYSIS;
    try { await initialize(context.database); analysis = await analyze(context.database, s.symbol!); } catch { /* The show is complete without the instrument study. */ }
    const prog = marketProgramme(s, analysis, Date.now());
    return { checkedAt: s.checkedAt ?? null, text: marketBrief(s, Date.now()) || 'No market data has been read yet; refresh NSE Market Terminal first.', ...(prog.segments.length ? { programme: prog } : {}) };
  }
  if (toolName === 'get_portfolio') {
    const p = portfolio(s), r = (paise: number | null) => (paise == null ? null : paise / 100);
    const unpriced = p.rows.length > 0 && p.missing === p.rows.length;
    return {
      checkedAt: s.checkedAt ?? null, currency: 'INR', invested: r(p.invested), value: unpriced ? null : r(p.value), dayChange: unpriced ? null : r(p.day), unrealisedPnl: unpriced ? null : r(p.pnl), unpricedHoldings: p.missing,
      holdings: p.rows.map((x) => ({ symbol: x.h.symbol, shares: x.h.qty, averageCost: x.h.cost / 100, last: x.q?.last ?? null, value: r(x.value), dayChange: r(x.day), unrealisedPnl: r(x.pnl), priceBasis: x.q ? `${x.q.basis} · ${x.q.asOf}` : 'not priced' })),
      note: `${p.rows.length - p.missing} of ${p.rows.length} holdings priced. Invested includes all holdings; value and gains cover priced holdings only. Computed in paise from saved quotes; charges, taxes and realised gains are not included.`,
    };
  }
  if (toolName === 'get_instrument') {
    const symbol = String(params.symbol ?? s.symbol).toUpperCase().trim();
    if (!SYMBOL.test(symbol)) throw new Error('Pass an NSE symbol, such as TCS');
    let analysis: Analysis | null = null;
    try { await initialize(context.database); const a = await analyze(context.database, symbol); if (a.sessions) analysis = a; } catch { /* no saved history */ }
    const research = s.research![symbol];
    return {
      symbol, quote: quoteOf(symbol), history: s.historyFor![symbol] ?? null,
      analytics: analysis ? { sessions: analysis.sessions, priceReturnPct: analysis.priceReturn, annualisedVolatilityPct: analysis.volatility, maxDrawdownPct: analysis.maxDrawdown, averageVolume: analysis.averageVolume, lastBars: analysis.rows.slice(-10).map((x) => ({ date: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume, sma20: x.sma20, sma50: x.sma50 })) } : null,
      range52Week: research?.range ?? null, versusBenchmark: research?.versus ?? null, corporateActions: research?.actions?.slice(0, 10) ?? [], volumeProfile: research?.volume ?? null, news: research?.news ?? [],
      ...(analysis || research ? {} : { note: `Nothing saved for ${symbol}; open it in NSE Market Terminal's Instrument view first.` }),
    };
  }
  throw new Error(`Unknown query tool: ${toolName}`);
}

/** The shipped surface.json: every view of a new, empty app. */
export const surfaceFile = () => view({}).map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) { context.state=normalize(context.state);return render(context); }
