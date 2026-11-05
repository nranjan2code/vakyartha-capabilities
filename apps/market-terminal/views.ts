// Every Market Terminal surface, derived from saved state and the DuckDB analysis
// of the selected symbol. Pure: the same inputs always give the same views.
import names from './names.json' with { type: 'json' };
import type { analyze } from './analytics.ts';
import { marketProgramme } from './show.ts';
import type { Alert, Index, Quote, State } from './server.ts';
import { BENCHMARKS, LIVE_QUOTES, MAX_WATCH, PERIODS, SEGMENTS, moverSegment, SETUP, normalize, tracked } from './server.ts';

export type Analysis = Awaited<ReturnType<typeof analyze>>;
interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
interface Update { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] }
export const TITLES: Record<string, string> = { overview: 'Overview', watchlist: 'Watchlist', portfolio: 'Portfolio', instrument: 'Instrument', indices: 'Indices', movers: 'Movers', alerts: 'Alerts', sources: 'Sources' };
export const EMPTY_ANALYSIS: Analysis = { rows: [], sessions: 0, averageVolume: null, low: null, high: null, volatility: null, priceReturn: null, maxDrawdown: null };
const HEADLINE = ['NIFTY 50', 'NIFTY BANK', 'NIFTY NEXT 50', 'NIFTY MIDCAP 100', 'NIFTY SMLCAP 100', 'INDIA VIX'];

// --- formatting ----------------------------------------------------------------------

const num = (n: number, digits = 2) => n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const inr = (n: number) => `₹${num(n)}`;
const rupees = (paise: number) => `${paise < 0 ? '−' : ''}₹${num(Math.abs(paise) / 100)}`;
const signedRupees = (paise: number) => `${paise > 0 ? '+' : paise < 0 ? '−' : ''}₹${num(Math.abs(paise) / 100)}`;
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);
const count = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-IN'));
const crore = (n: number | null | undefined) => (n == null ? '—' : `₹${num(n / 1e7)} Cr`);
const tone = (n: number) => (n > 0 ? 'success' : n < 0 ? 'danger' : 'neutral');
const trend = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
const ist = (iso: string | undefined) => {
  const d = new Date(iso ?? '');
  return Number.isFinite(d.getTime()) ? `${d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST` : '';
};
const replaceAll = (value: Record<string, unknown>) => [{ op: 'replace' as const, path: '/' as const, value }];
/** "2026-10-30" as "30 Oct"; other text unchanged. */
const day = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }) : iso;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const problemNode = (id: string): Node => ({ id, type: 'alert', props: { title: 'Refresh notice', body: '{/problem}', tone: 'warning' } });
const toPaise = (rupee: number) => Math.round(rupee * 100);

/** Trading session from the India clock: weekday hours only; exchange holidays are not known here. */
export function session(now = Date.now()) {
  const t = new Date(now + 5.5 * 3600_000), d = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (d === 0 || d === 6) return { label: 'Market closed · weekend', tone: 'neutral' };
  if (m >= 555 && m < 930) return { label: 'Market hours · NSE delays quotes about 1–3 min', tone: 'success' };
  if (m >= 540 && m < 555) return { label: 'Pre-open session', tone: 'info' };
  return { label: m < 540 ? 'Before market hours' : 'After market hours', tone: 'neutral' };
}

/** Holdings priced from the latest quotes, in whole paise; day change uses each quote's own previous close. */
export function portfolio(s: State) {
  const rows = s.holdings!.map((h) => {
    const q = s.quotes![h.symbol], invested = h.qty * h.cost;
    const value = q ? h.qty * toPaise(q.last) : null, day = q ? h.qty * (toPaise(q.last) - toPaise(q.previous)) : null;
    return { h, q, invested, value, day, pnl: value == null ? null : value - invested };
  });
  const priced = rows.filter((r) => r.value != null);
  const invested = rows.reduce((a, r) => a + r.invested, 0), value = priced.reduce((a, r) => a + r.value!, 0);
  const pricedCost = priced.reduce((a, r) => a + r.invested, 0), day = priced.reduce((a, r) => a + r.day!, 0);
  return { rows, invested, value, day, pnl: value - pricedCost, pricedCost, missing: rows.length - priced.length };
}

/** Sub-views as tabs: only the chosen panel renders, so a view stays one screen. Empty panels are left out. */
function tabbed(id: string, panels: [string, string[]][]): Node[] {
  const live = panels.filter(([, children]) => children.length);
  const pid = (title: string) => `${id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return live.length ? [{ id, type: 'tabs', children: live.map(([t]) => pid(t)) }, ...live.map(([t, children]) => ({ id: pid(t), type: 'section', props: { title: t }, children }))] : [];
}

function moversPicker(id: string, s: State): Node[] {
  return [
    { id, type: 'stack', props: { gap: 'sm' }, children: [`${id}-label`, `${id}-choices`] },
    { id: `${id}-label`, type: 'text', props: { content: 'Stock movers in', variant: 'caption' } },
    { id: `${id}-choices`, type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: SEGMENTS.map((x) => `${id}-${x.value}`) },
    ...SEGMENTS.map((x) => ({ id: `${id}-${x.value}`, type: 'button', props: { label: x.label, action: 'show_movers', payload: { segment: x.value }, style: x.value === s.segment ? 'primary' : 'secondary' } })),
  ];
}

const segmentLabel = (segment: string) => SEGMENTS.find((s) => s.value === moverSegment(segment))?.label ?? segment;
function moversNote(s: State) {
  const selected = segmentLabel(s.segment!);
  return s.movers
    ? `Showing ${segmentLabel(s.movers.segment)} · snapshot ${ist(s.movers.at)}. ${moverSegment(s.movers.segment) !== s.segment ? `Selection pending: ${selected}. ` : ''}Choose an index to load its movers.`
    : `Choose an index to load its movers.`;
}

// --- spoken brief ------------------------------------------------------------------

export const spokenPct = (n: number) => `${Math.abs(n).toFixed(Math.abs(n) >= 10 ? 1 : 2).replace(/\.?0+$/, '')} percent`;
export const move = (n: number) => (n > 0 ? `rose ${spokenPct(n)}` : n < 0 ? `fell ${spokenPct(n)}` : 'was unchanged');
export const level = (n: number) => Math.round(n).toLocaleString('en-IN');
// NSE abbreviates index names to fit its feed ("NIFTY MS FIN SERV"); screens and speech use the words.
const WORDS: Record<string, string> = {
  SMLCAP: 'Smallcap', SML: 'Smallcap', MIDCAP: 'Midcap', MIDSML: 'MidSmall', MS: 'MidSmall', M: 'Midcap', HLTH: 'Healthcare', HEALTH: 'Healthcare', FIN: 'Financial', FINSRV: 'Financial Services',
  SERV: 'Services', SERVICE: 'Services', CONSR: 'Consumer', DURBL: 'Durables', FINSEREXBNK: 'Financial Services ex-Bank', PVT: 'Private', TELCM: 'Telecom',
  INFRA: 'Infrastructure', MKT: 'Market', MFG: 'Manufacturing', IND: 'India', CONS: 'Consumption', CONSUMP: 'Consumption', NONCYC: 'Non-cyclical',
  TRANS: 'Transport', LOGIS: 'Logistics', QLTY: 'Quality', QUALTY: 'Quality', EQL: 'Equal', WGT: 'Weight', LOWVOL: 'Low Volatility', MOMENTM: 'Momentum',
  MOMNTM: 'Momentum', DIV: 'Dividend', OPPS: 'Opportunities', GROWSECT: 'Growth Sectors', LIQ: 'Liquid', LARGEMID: 'LargeMid', SECT: 'Sector', AND: 'and',
  REITS: 'REITs', COMPSITE: 'Composite', GS: 'G-Sec', YR: 'Year', YRPLUS: 'Year Plus',
};
const ACRONYMS = new Set(['IT', 'PSU', 'FMCG', 'VIX', 'MNC', 'CPSE', 'PSE', 'IPO', 'EV', 'ESG', 'SME', 'EW', 'LMS', 'MQ', 'TR', 'PR', 'FPI', 'AQL', 'AQLV', 'TMMQ', 'LV', 'MQVLV']);
/** "NIFTY MS FIN SERV" as "Nifty MidSmall Financial Services"; unknown words are title-cased, acronyms kept. */
export const indexName = (label: string) => label.replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean)
  .map((w) => WORDS[w] ?? (ACRONYMS.has(w) || /\d/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ').replace(/^India Vix$/, 'India VIX');
export const nameOf = (label: string) => (/^NIFTY/.test(label) ? 'the ' : '') + indexName(label);
/** "30-Oct-2026 15:40" as "3:40 PM on 30 October". */
export const exchangeTime = (t: string) => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-\d{4} (\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const months: Record<string, string> = { Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' };
  const h = Number(m[3]);
  return `${h % 12 || 12}:${m[4]} ${h < 12 ? 'AM' : 'PM'} on ${Number(m[1])} ${months[m[2]!] ?? m[2]}`;
};
/** A company as a presenter names it ("Reliance Industries", not "RELIANCE"), from NSE's equity list (scripts/nse-names.ts); an unlisted ticker is said as written. */
export const company = (symbol: string) => (names as Record<string, string>)[symbol] ?? symbol;
export const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** A spoken market brief from the same records as the views: sentences, not a table read aloud. */
export function marketBrief(s: State, now: number): string {
  const byLabel = new Map(s.indices!.map((r) => [r.label, r]));
  const parts: string[] = [];
  const hour = Number(new Date(now).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  const time = new Date(now).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  parts.push(`${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}. Here is your market brief at ${time}. ${session(now).label.split(' · ')[0]}.`);
  const nifty = byLabel.get('NIFTY 50'), bank = byLabel.get('NIFTY BANK');
  if (nifty) parts.push(`The Nifty 50 ${move(nifty.changePct)} to ${level(nifty.last)}${bank ? `, while the Nifty Bank ${move(bank.changePct)} to ${level(bank.last)}` : ''}. Prices are as of ${exchangeTime(nifty.exchangeAt)}, India time.`);
  const broad = ['NIFTY MIDCAP 100', 'NIFTY SMLCAP 100'].flatMap((l) => byLabel.get(l) ?? []);
  if (broad.length) parts.push(`In the broader market, ${listOf(broad.map((r) => `${nameOf(r.label)} ${move(r.changePct)}`))}.`);
  const m = s.mood;
  if (m) {
    parts.push(`${m.stocks.reading === 'mixed' ? 'Breadth was mixed' : `Breadth showed a ${m.stocks.reading}`}: ${m.stocks.up.toLocaleString('en-IN')} stocks advanced and ${m.stocks.down.toLocaleString('en-IN')} declined in the last session.`);
    parts.push(`India VIX is at ${m.vix.level.toFixed(1)}, ${m.vix.change >= 0 ? 'up' : 'down'} ${spokenPct(m.vix.change)}, and higher than on ${Math.round(m.vix.percentile)} percent of sessions over the past year.`);
  }
  const mv = s.movers;
  if (mv?.gainers.length) parts.push(`Among the top gainers, ${listOf(mv.gainers.slice(0, 3).map((r) => `${company(r.symbol)} ${move(r.changePct)}`))}.`);
  if (mv?.losers.length) parts.push(`On the other side, ${listOf(mv.losers.slice(0, 3).map((r) => `${company(r.symbol)} ${move(r.changePct)}`))}.`);
  const sectors = s.indices!.filter((r) => r.group === 'sectoral').sort((a, b) => b.changePct - a.changePct);
  if (sectors.length > 1) parts.push(`Among sectors, ${nameOf(sectors[0]!.label)} led, ${move(sectors[0]!.changePct).replace('rose', 'up').replace('fell', 'down')}, and ${nameOf(sectors.at(-1)!.label)} lagged, ${move(sectors.at(-1)!.changePct).replace('rose', 'up').replace('fell', 'down')}.`);
  const watch = s.watchlist!.flatMap((w) => s.quotes![w] ?? []).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  if (watch.length) parts.push(`On your watchlist, the biggest moves were ${listOf(watch.slice(0, 3).map((q) => `${company(q.symbol)}, which ${move(q.changePct)} to ${q.last.toLocaleString('en-IN')} rupees`))}.`);
  const p = portfolio(s);
  if (p.rows.length && p.value) parts.push(`${p.rows.filter((r) => r.q).length < p.rows.length ? `Only ${p.rows.filter((r) => r.q).length} of ${p.rows.length} holdings are priced. Their saved value is` : 'Using saved prices, your portfolio is worth'} ${(p.value / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} rupees, ${p.day >= 0 ? 'up' : 'down'} ${(Math.abs(p.day) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} rupees on the day, with an unrealised ${p.pnl >= 0 ? 'gain' : 'loss'} of ${(Math.abs(p.pnl) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} rupees.`);
  const fired = s.alerts!.filter((a) => a.triggeredAt);
  if (fired.length) parts.push(`${fired.length === 1 ? 'One alert has' : `${fired.length} alerts have`} triggered: ${listOf(fired.slice(0, 3).map((a) => `${company(a.symbol)} ${a.kind === 'move' ? `moved ${spokenPct(a.triggeredValue ?? 0)}` : `${a.kind === 'above' ? 'reached' : 'fell to'} ${a.triggeredValue?.toLocaleString('en-IN')} rupees`}`))}.`);
  parts.push('That is the market brief. NSE data is delayed, and this is information, not investment advice.');
  return parts.length > 2 ? parts.join(' ') : '';
}

// --- view --------------------------------------------------------------------------

export function view(input: State, analysis: Analysis = EMPTY_ANALYSIS, now = Date.now()): Update[] {
  const s = normalize(input);
  return [overview(s, now, analysis), watchlist(s), portfolioSurface(s), instrument(s, analysis), indicesSurface(s), moversSurface(s), alertsSurface(s), sources(s)];
}

/** These fields affect a single retained view and have no historical-price dependency. */
export function draftView(state: State, field: string): Update | undefined {
  switch (field) {
    case 'holdingDraft': return portfolioSurface(state);
    case 'alertDraft': return alertsSurface(state);
    case 'groupDraft': case 'searchDraft': case 'watchDraft': return watchlist(state);
    case 'indexGroup': case 'studyDraft': case 'compareSet': case 'compareMonths': return indicesSurface(state);
    case 'period': return moversSurface(state);
    case 'receipts': return sources(state);
  }
}

const quoteRow = (s: State, symbol: string) => {
  const q = s.quotes![symbol];
  return q
    ? { symbol, price: inr(q.last), change: pct(q.changePct), changePct: q.changePct, range: `${inr(q.low)} – ${inr(q.high)}`, volume: count(q.volume), basis: q.basis === 'live' ? `Last trade · ${q.asOf}` : `Close · ${q.asOf.replace(' close', '')}`, tone: tone(q.changePct) }
    : { symbol, price: '—', change: '', changePct: 0, range: '—', volume: '—', basis: 'Not read yet', tone: 'neutral' };
};
const moverRow = (r: { symbol: string; last: number; changePct: number; turnover: string; quantity: string }) => ({ symbol: r.symbol, price: inr(r.last), change: pct(r.changePct), changePct: r.changePct, turnover: r.turnover ? `₹${r.turnover}` : '—', quantity: r.quantity || '—' });
// The session label depends on the clock, so a never-refreshed surface (also the packaged one) leaves it out.
const statusText = (s: State, now: number) => [...(s.checkedAt ? [session(now).label, `updated ${ist(s.checkedAt)}`] : ['Not refreshed yet']), 'INR · informational use, not advice'].join(' · ');

function overview(s: State, now: number, analysis: Analysis): Update {
  const byLabel = new Map(s.indices!.map((r) => [r.label, r]));
  const headline = HEADLINE.flatMap((l) => byLabel.get(l) ?? []);
  const sectors = s.indices!.filter((r) => r.group === 'sectoral').sort((a, b) => b.changePct - a.changePct);
  const m = s.mood, mv = s.movers, watch = s.watchlist!.filter((w) => s.quotes![w]);
  const p = portfolio(s), fired = s.alerts!.filter((a) => a.triggeredAt && s.triggered!.includes(a.id));
  const any = headline.length || m || mv || watch.length;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['ov-bar', ...(s.problem ? ['ov-problem'] : []), ...(fired.length ? ['ov-fired'] : []), ...(any ? [
      ...(headline.length ? ['ov-tape'] : []), 'ov-main'] : ['ov-empty'])] },
    { id: 'ov-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'center' }, children: ['ov-status'] },
    { id: 'ov-status', type: 'text', props: { content: '{/status}', variant: 'caption' } },
    ...(s.problem ? [problemNode('ov-problem')] : []),
    ...(fired.length ? [{ id: 'ov-fired', type: 'alert', props: { title: 'Alerts triggered on this refresh', body: '{/fired}', tone: 'info' } }] : []),
    ...(any ? [
      ...(headline.length ? [
        { id: 'ov-tape', type: 'stack', props: { direction: 'horizontal', scroll: true, gap: 'sm' }, children: { each: '/tape', template: 'ov-tick' } } as Node,
        { id: 'ov-tick', type: 'stat', props: { label: '{label}', value: '{level}', delta: '{change}', trend: '{trend}' } },
      ] : []),
      { id: 'ov-main', type: m || p.rows.length ? 'split' : 'stack', props: { ...(m || p.rows.length ? { ratio: '2:1' } : {}), gap: 'md' }, children: ['ov-tabs', ...(m || p.rows.length ? ['ov-right'] : [])] },
      // The movers index picker belongs with the movers it chooses, not in the page header.
      { id: 'ov-movers-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['ov-segment'] },
      { id: 'ov-movers-note', type: 'text', props: { content: '{/moversNote}', variant: 'caption' } },
      ...moversPicker('ov-segment', s),
      ...tabbed('ov-tabs', [['Movers', ['ov-movers-bar', 'ov-movers-note', ...(mv ? ['ov-movers'] : [])]], ['Sectors', sectors.length ? ['ov-sector-note', 'ov-sector-chart'] : []], ['Watchlist', watch.length ? ['ov-watch-table'] : []]]),
      ...(mv ? [
        { id: 'ov-movers', type: 'grid', props: { columns: 2, minItemWidth: 'sm', gap: 'md' }, children: ['ov-gainers', 'ov-losers'] },
        { id: 'ov-gainers', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: '{/gainersTitle}', series: { records: '{/gainers}', label: 'symbol', fields: ['changePct'] }, height: 'md' } },
        { id: 'ov-losers', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: '{/losersTitle}', series: { records: '{/losers}', label: 'symbol', fields: ['changePct'] }, height: 'md' } },
      ] : []),
      ...(watch.length ? [
        { id: 'ov-watch-table', type: 'table', props: { rows: '{/watch}', columns: [{ key: 'symbol', label: 'Symbol' }, { key: 'price', label: 'Last', align: 'end' }, { key: 'change', label: 'Change', align: 'end' }, { key: 'range', label: 'Day range', align: 'end' }, { key: 'volume', label: 'Volume', align: 'end' }, { key: 'basis', label: 'Basis' }], sortable: true, pageSize: 10 } },
      ] : []),
      ...(m || p.rows.length ? [{ id: 'ov-right', type: 'stack', props: { gap: 'md' }, children: [...(m ? ['ov-breadth', 'ov-vix'] : []), ...(p.rows.length ? ['ov-portfolio'] : [])] }] : []),
      ...(m ? [
        { id: 'ov-breadth', type: 'section', props: { title: 'Market breadth', description: '{/breadthNote}' }, children: ['ov-breadth-bar', 'ov-breadth-stats'] },
        { id: 'ov-breadth-bar', type: 'progress', props: { label: '{/breadthTitle}', value: '{/advancing}', max: '{/breadthTotal}', kind: 'bar', tone: '{/adTone}', note: '{/breadthDetail}' } },
        { id: 'ov-breadth-stats', type: 'grid', props: { columns: 2, gap: 'sm' }, children: ['ov-ad', 'ov-ib'] },
        { id: 'ov-ad', type: 'stat', props: { label: 'Advance / decline', value: '{/adRatio}', tone: '{/adTone}' } },
        { id: 'ov-ib', type: 'stat', props: { label: 'Indices rising', value: '{/indexBreadth}' } },
        { id: 'ov-vix', type: 'section', props: { title: '{/vixTitle}', description: '{/vixNote}' }, children: ['ov-vix-gauge'] },
        { id: 'ov-vix-gauge', type: 'progress', props: { label: 'One-year percentile', value: '{/vixPercentile}', max: 100, kind: 'gauge', tone: '{/vixTone}' } },
      ] : []),
      ...(p.rows.length ? [
        { id: 'ov-portfolio', type: 'section', props: { title: 'Portfolio today' }, children: ['ov-pf-stats'] },
        { id: 'ov-pf-stats', type: 'grid', props: { columns: 2, gap: 'sm' }, children: ['ov-pf-value', 'ov-pf-day'] },
        { id: 'ov-pf-value', type: 'stat', props: { label: 'Current value', value: '{/pf/value}', delta: '{/pf/pnlPct}', trend: '{/pf/pnlTrend}' } },
        { id: 'ov-pf-day', type: 'stat', props: { label: 'Day change', value: '{/pf/day}', trend: '{/pf/dayTrend}' } },
      ] : []),
      ...(sectors.length ? [
        { id: 'ov-sector-note', type: 'text', props: { content: '{/sectorNote}', variant: 'caption' } },
        { id: 'ov-sector-chart', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: 'Sector indices · session change (%)', series: { records: '{/sectors}', label: 'label', fields: ['changePct'] }, height: 'md' } },
      ] : []),
    ] : [
      { id: 'ov-empty', type: 'card', props: { title: 'No market data yet', body: 'Read the benchmark indices, market breadth, India VIX, top movers and sector rotation from the exchange, each with its exchange time. Your watchlist and portfolio join them here.' }, children: ['ov-empty-actions'] },
      { id: 'ov-empty-actions', type: 'stack', props: { direction: 'horizontal', wrap: true, gap: 'sm' }, children: ['ov-empty-read', 'ov-empty-watch'] },
      { id: 'ov-empty-read', type: 'button', props: { label: 'Read market data', action: 'refresh_market', style: 'primary' } },
      { id: 'ov-empty-watch', type: 'button', props: { label: 'Build a watchlist', action: 'view.open', payload: { surface: 'watchlist' }, style: 'secondary' } },
    ]),
  ];
  const ad = m ? m.stocks.up / Math.max(1, m.stocks.down) : 0;
  const data = {
    status: statusText(s, now), segment: s.segment, moversNote: moversNote(s), ...(any ? { spoken: { brief: marketProgramme(s, analysis, now) } } : {}),
    ...(s.problem ? { problem: s.problem } : {}),
    ...(fired.length ? { fired: fired.map((a) => `${a.symbol} ${alertText(a)} (now ${a.kind === 'move' ? pct(a.triggeredValue) : inr(a.triggeredValue!)})`).join(' · ') } : {}),
    ...(headline.length ? { tape: headline.map((r) => ({ label: r.label, level: num(r.last), change: pct(r.changePct), trend: trend(r.label === 'INDIA VIX' ? -r.changePct : r.changePct) })) } : {}),
    ...(mv ? {
      gainersTitle: `Top gainers · ${segmentLabel(mv.segment)} (%)`, losersTitle: `Top losers · ${segmentLabel(mv.segment)} (%)`,
      gainers: mv.gainers.slice(0, 10).map((r) => ({ symbol: r.symbol, changePct: r.changePct })), losers: mv.losers.slice(0, 10).map((r) => ({ symbol: r.symbol, changePct: r.changePct })),
    } : {}),
    ...(watch.length ? { watch: s.watchlist!.map((w) => quoteRow(s, w)) } : {}),
    ...(m ? {
      breadthTitle: `Advancing stocks · ${day(m.date)}`, advancing: m.stocks.up, breadthTotal: m.stocks.up + m.stocks.down + m.stocks.unchanged,
      breadthDetail: `${count(m.stocks.up)} up · ${count(m.stocks.down)} down · ${count(m.stocks.unchanged)} unchanged of ${count(m.stocks.up + m.stocks.down + m.stocks.unchanged)} mainboard stocks`,
      breadthNote: `End of day: ${m.stocks.reading}. NSE calls it a broad advance when 60% or more rose and a broad decline at 40% or fewer.`,
      adRatio: num(ad), adTone: ad >= 1.5 ? 'success' : ad <= 0.67 ? 'danger' : 'neutral', indexBreadth: `${m.indices.up} of ${m.indices.up + m.indices.down + m.indices.unchanged}`,
      vixTitle: `India VIX ${num(m.vix.level)} (${pct(m.vix.change)}) · ${day(m.date)}`, vixPercentile: m.vix.percentile, vixTone: m.vix.percentile >= 80 ? 'danger' : m.vix.percentile >= 60 ? 'warning' : 'success',
      vixNote: `Higher than on ${m.vix.percentile.toFixed(0)}% of sessions since ${m.vix.from}; range ${num(m.vix.min)}–${num(m.vix.max)}. ${m.vix.week != null ? `${pct(m.vix.week)} over a week, ` : ''}${m.vix.month != null ? `${pct(m.vix.month)} over a month.` : ''} Descriptive, not a forecast.`,
    } : {}),
    ...(p.rows.length ? { pf: { value: rupees(p.value), pnlPct: p.pricedCost ? pct((p.pnl / p.pricedCost) * 100) : '—', pnlTrend: trend(p.pnl), day: signedRupees(p.day), dayTrend: trend(p.day) } } : {}),
    ...(sectors.length ? { sectors: sectors.map((r) => ({ label: indexName(r.label), changePct: r.changePct })), sectorNote: `${sectors.filter((r) => r.changePct > 0).length} rising, ${sectors.filter((r) => r.changePct < 0).length} falling of ${sectors.length} sector indices · exchange ${sectors[0]!.exchangeAt} IST` } : {}),
  };
  return { surface: 'overview', nodes, data: replaceAll(data) };
}

function watchlist(s: State): Update {
  const rows = s.watchlist!.map((w) => quoteRow(s, w)), quoted = rows.filter((r) => r.price !== '—');
  const results = s.results!;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['wl-groups', 'wl-bar', ...(s.problem ? ['wl-problem'] : []), ...(s.searchMessage ? ['wl-search-message'] : []), ...(results.length ? ['wl-results'] : []), 'wl-tabs'] },
    ...tabbed('wl-tabs', [['Cards', ['wl-cards']], ['Table and chart', quoted.length ? ['wl-detail'] : []]]),
    { id: 'wl-groups', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['wl-group-chips', 'wl-group-name', 'wl-group-save', ...(Object.keys(s.groups!).length > 1 ? ['wl-group-delete'] : [])] },
    { id: 'wl-group-chips', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: { each: '/groupChips', template: 'wl-group-chip' } },
    { id: 'wl-group-chip', type: 'button', props: { label: '{label}', action: 'switch_group', payload: { group: '{name}' }, style: '{style}' } },
    { id: 'wl-group-name', type: 'input', props: { label: 'New watchlist from this one', bind: '/groupDraft', placeholder: 'Banks' } },
    { id: 'wl-group-save', type: 'button', props: { label: 'Save as', action: 'save_group', style: 'secondary' } },
    ...(Object.keys(s.groups!).length > 1 ? [{ id: 'wl-group-delete', type: 'button', props: { label: '{/deleteLabel}', action: 'delete_group', style: 'link' } }] : []),
    { id: 'wl-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['wl-add-input', 'wl-add', 'wl-search-input', 'wl-search', ...(s.searchDraft || s.searchQuery || s.searchMessage ? ['wl-search-clear'] : [])] },
    { id: 'wl-add-input', type: 'input', props: { label: `Add symbols · ${s.watchlist!.length} of ${MAX_WATCH}`, bind: '/watchDraft', placeholder: 'WIPRO, LT' } },
    { id: 'wl-add', type: 'button', props: { label: 'Add', action: 'add_watch', style: 'secondary' } },
    { id: 'wl-search-input', type: 'input', props: { label: 'Find a symbol', bind: '/searchDraft', placeholder: 'TATA, BANK, PHARMA' } },
    { id: 'wl-search', type: 'button', props: { label: 'Search', action: 'search', style: 'secondary' } },
    ...(s.problem ? [problemNode('wl-problem')] : []),
    ...(s.searchDraft || s.searchQuery || s.searchMessage ? [{ id: 'wl-search-clear', type: 'button', props: { label: 'Clear search', action: 'clear_search', style: 'link' } }] : []),
    ...(s.searchMessage ? [{ id: 'wl-search-message', type: 'text', props: { content: '{/searchMessage}', variant: 'caption' } }] : []),
    ...(results.length ? [
      { id: 'wl-results', type: 'section', props: { title: '{/resultsTitle}', description: 'Last close from the end-of-day symbol master.' }, children: ['wl-result-grid'] },
      { id: 'wl-result-grid', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm', pageSize: 8 }, children: { each: '/results', template: 'wl-result' } } as Node,
      { id: 'wl-result', type: 'card', props: { title: '{symbol}', subtitle: '{detail}', tone: '{tone}' }, children: ['wl-result-actions'] },
      { id: 'wl-result-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: ['wl-result-add', 'wl-result-open'] },
      { id: 'wl-result-add', type: 'button', props: { label: '+ Watch', action: 'add_watch', payload: { symbol: '{symbol}' }, style: 'secondary' } },
      { id: 'wl-result-open', type: 'button', props: { label: 'Open', action: 'open_instrument', payload: { symbol: '{symbol}' }, style: 'link' } },
    ] : []),
    { id: 'wl-cards', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm', searchable: s.watchlist!.length > 8, pageSize: 16 }, children: { each: '/watch', template: 'wl-card' } },
    { id: 'wl-card', type: 'card', props: { title: '{symbol}', subtitle: '{price}', badge: '{change}', body: '{body}', tone: '{tone}' }, children: ['wl-card-actions'] },
    { id: 'wl-card-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: ['wl-open', 'wl-alert', 'wl-up', 'wl-remove'] },
    { id: 'wl-open', type: 'button', props: { label: 'Open', action: 'open_instrument', payload: { symbol: '{symbol}' }, style: 'secondary' } },
    { id: 'wl-alert', type: 'button', props: { label: 'Alert', action: 'prepare_alert', payload: { symbol: '{symbol}' }, style: 'link' } },
    { id: 'wl-up', type: 'button', props: { label: 'Move up', action: 'move_watch', payload: { symbol: '{symbol}' }, style: 'link' } },
    { id: 'wl-remove', type: 'button', props: { label: 'Remove', action: 'remove_watch', payload: { symbol: '{symbol}' }, style: 'link' } },
    ...(quoted.length ? [
      { id: 'wl-detail', type: 'split', props: { ratio: '1:2', gap: 'md' }, children: ['wl-chart', 'wl-table'] },
      { id: 'wl-chart', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: 'Session change (%)', series: { records: '{/moves}', label: 'symbol', fields: ['changePct'] }, height: 'md' } },
      { id: 'wl-table', type: 'table', props: { rows: '{/watch}', columns: [{ key: 'symbol', label: 'Symbol' }, { key: 'price', label: 'Last', align: 'end' }, { key: 'change', label: 'Change', align: 'end' }, { key: 'range', label: 'Day range', align: 'end' }, { key: 'volume', label: 'Volume', align: 'end' }, { key: 'basis', label: 'Basis' }], sortable: true, searchable: true, pageSize: 15 } },
    ] : []),
  ];
  const alerts = (sym: string) => s.alerts!.filter((a) => a.symbol === sym && !a.triggeredAt).length;
  const data = {
    watchDraft: s.watchDraft, searchDraft: s.searchDraft, searchMessage: s.searchMessage, groupDraft: s.groupDraft, deleteLabel: `Delete ${s.group}`,
    groupChips: Object.entries(s.groups!).map(([name, list]) => ({ name, label: `${name} · ${list.length}`, style: name === s.group ? 'primary' : 'secondary' })),
    ...(s.problem ? { problem: s.problem } : {}),
    ...(results.length ? { resultsTitle: `${results.length} ${results.length === 1 ? 'match' : 'matches'} for “${s.searchQuery}”`, results: results.map((r) => ({ symbol: r.symbol, detail: r.close != null ? `${inr(r.close)} · ${pct(r.changePct)} · ${r.date}` : 'No recent close', tone: r.changePct ? tone(r.changePct) : 'neutral' })) } : {}),
    watch: rows.map((r) => ({ ...r, body: `${r.range} · vol ${r.volume}\n\n${r.basis}${alerts(r.symbol) ? ` · ${plural(alerts(r.symbol), 'alert')}` : ''}` })),
    ...(quoted.length ? { moves: quoted.map((r) => ({ symbol: r.symbol, changePct: r.changePct })) } : {}),
  };
  return { surface: 'watchlist', nodes, data: replaceAll(data) };
}

/** The portfolio as CSV: rupees with two decimals, one row per holding, with each price's basis. */
export function portfolioCsv(s: State, p = portfolio(s)): string {
  const cell = (v: string | number | null) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const r = (paise: number | null) => (paise == null ? null : (paise / 100).toFixed(2));
  const rows = p.rows.map((x) => [x.h.symbol, x.h.qty, r(x.h.cost), x.q ? x.q.last.toFixed(2) : null, r(x.invested), r(x.value), r(x.day), r(x.pnl), x.q ? `${x.q.basis} ${x.q.asOf}` : 'not priced']);
  const basis = `${p.rows.filter((r) => r.q).length}/${p.rows.length} holdings priced; invested includes all; charges and taxes excluded`;
  return [['Symbol', 'Shares', 'Average cost (INR)', 'Last (INR)', 'Invested (INR)', 'Value (INR)', 'Day change (INR)', 'Unrealised P&L (INR)', 'Price basis'], ...rows, ['Total', '', '', '', r(p.invested), r(p.value), r(p.day), r(p.pnl), basis]].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}

function portfolioSurface(s: State): Update {
  const p = portfolio(s), has = p.rows.length > 0;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['pf-form', ...(s.problem ? ['pf-problem'] : []), ...(has ? ['pf-stats', 'pf-coverage', 'pf-tabs'] : ['pf-empty'])] },
    ...(has ? tabbed('pf-tabs', [['Holdings', ['pf-holdings']], ['Allocation and P&L', p.missing < p.rows.length ? ['pf-charts'] : []], ['Table', ['pf-table']]]) : []),
    { id: 'pf-form', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['pf-symbol', 'pf-qty', 'pf-cost', 'pf-save', 'pf-clear', ...(has ? ['pf-export'] : [])] },
    ...(has ? [{ id: 'pf-export', type: 'button', props: { label: 'Export CSV', action: 'file.save', payload: { name: 'portfolio', text: '/export/csv' }, style: 'link' } }] : []),
    { id: 'pf-symbol', type: 'input', props: { label: 'Symbol', bind: '/holdingDraft/symbol', placeholder: 'RELIANCE', maxWidth: 'sm' } },
    { id: 'pf-qty', type: 'input', props: { label: 'Shares', bind: '/holdingDraft/qty', placeholder: 'Enter shares', kind: 'number', min: 1, max: 10000000, step: 1, maxWidth: 'sm' } },
    { id: 'pf-cost', type: 'input', props: { label: 'Average cost (₹)', bind: '/holdingDraft/cost', placeholder: '1250.50', maxWidth: 'sm' } },
    { id: 'pf-clear', type: 'button', props: { label: 'Clear fields', action: 'clear_holding_draft', style: 'link' } },
    { id: 'pf-save', type: 'button', props: { label: 'Add or update holding', action: 'save_holding', style: 'secondary' } },
    ...(s.problem ? [problemNode('pf-problem')] : []),
    ...(has ? [
      { id: 'pf-stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['pf-invested', 'pf-value', 'pf-pnl', 'pf-day'] },
      { id: 'pf-invested', type: 'stat', props: { label: 'Invested', value: '{/stats/invested}' } },
      { id: 'pf-value', type: 'stat', props: { label: 'Current value', value: '{/stats/value}' } },
      { id: 'pf-pnl', type: 'stat', props: { label: 'Unrealised P&L', value: '{/stats/pnl}', delta: '{/stats/pnlPct}', trend: '{/stats/pnlTrend}' } },
      { id: 'pf-day', type: 'stat', props: { label: 'Day change', value: '{/stats/day}', delta: '{/stats/dayPct}', trend: '{/stats/dayTrend}' } },
      { id: 'pf-coverage', type: 'text', props: { content: '{/coverage}', variant: 'caption' } },
      ...(p.missing < p.rows.length ? [
      { id: 'pf-charts', type: 'grid', props: { columns: 2, minItemWidth: 'sm', gap: 'md' }, children: ['pf-allocation', 'pf-pnl-chart'] },
      { id: 'pf-allocation', type: 'chart', props: { kind: 'pie', title: 'Allocation by current value', series: { records: '{/allocation}', label: 'symbol', fields: ['value'] }, height: 'sm' } },
      { id: 'pf-pnl-chart', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: 'Unrealised P&L by holding (₹)', series: { records: '{/pnlBars}', label: 'symbol', fields: ['pnl'] }, height: 'sm' } },
      ] : []),
      { id: 'pf-holdings', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: { each: '/holdings', template: 'pf-card' } },
      { id: 'pf-card', type: 'card', props: { title: '{symbol}', subtitle: '{subtitle}', badge: '{pnlPct}', body: '{body}', tone: '{tone}' }, children: ['pf-card-actions'] },
      { id: 'pf-card-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: ['pf-open', 'pf-edit', 'pf-remove'] },
      { id: 'pf-open', type: 'button', props: { label: 'Open', action: 'open_instrument', payload: { symbol: '{symbol}' }, style: 'secondary' } },
      { id: 'pf-edit', type: 'button', props: { label: 'Edit', action: 'edit_holding', payload: { symbol: '{symbol}' }, style: 'link' } },
      { id: 'pf-remove', type: 'button', props: { label: 'Remove', action: 'remove_holding', payload: { symbol: '{symbol}' }, style: 'link' } },
      { id: 'pf-table', type: 'table', props: { rows: '{/holdings}', columns: [{ key: 'symbol', label: 'Symbol' }, { key: 'qty', label: 'Shares', align: 'end' }, { key: 'cost', label: 'Avg cost', align: 'end' }, { key: 'last', label: 'Last', align: 'end' }, { key: 'valueText', label: 'Value', align: 'end' }, { key: 'dayText', label: 'Day', align: 'end' }, { key: 'pnlText', label: 'P&L', align: 'end' }, { key: 'pnlPct', label: 'P&L %', align: 'end' }, { key: 'weight', label: 'Weight', align: 'end' }, { key: 'basis', label: 'Price basis' }], sortable: true, pageSize: 20 } },
    ] : [{ id: 'pf-empty', type: 'text', props: { content: 'Add each holding with its share count and average cost. Value, day change and unrealised P&L are computed exactly, in paise, from the latest NSE quotes; holdings stay on this computer.', variant: 'caption' } }]),
  ];
  const data = {
    holdingDraft: s.holdingDraft, ...(s.problem ? { problem: s.problem } : {}),
    ...(has ? {
      stats: {
        invested: rupees(p.invested), value: p.missing === p.rows.length ? '—' : rupees(p.value),
        pnl: p.missing === p.rows.length ? '—' : signedRupees(p.pnl), pnlPct: p.pricedCost ? pct((p.pnl / p.pricedCost) * 100) : '—', pnlTrend: trend(p.pnl),
        day: p.missing === p.rows.length ? '—' : signedRupees(p.day), dayPct: p.value - p.day ? pct((p.day / (p.value - p.day)) * 100) : '—', dayTrend: trend(p.day),
      },
      coverage: `${p.rows.length - p.missing} of ${p.rows.length} holdings priced. ${p.missing ? 'Value and gains cover priced holdings only; refresh to retry missing prices. ' : ''}Invested includes all holdings. Saved price basis and time appear per holding. Charges, taxes and realised gains excluded.`,
      export: { csv: portfolioCsv(s, p) },
      allocation: p.rows.filter((r) => r.value).map((r) => ({ symbol: r.h.symbol, value: r.value! / 100 })),
      pnlBars: p.rows.filter((r) => r.pnl != null).map((r) => ({ symbol: r.h.symbol, pnl: r.pnl! / 100 })),
      holdings: p.rows.map((r) => ({
        symbol: r.h.symbol, qty: count(r.h.qty), cost: rupees(r.h.cost), last: r.q ? inr(r.q.last) : '—',
        valueText: r.value != null ? rupees(r.value) : '—', dayText: r.day != null ? signedRupees(r.day) : '—', pnlText: r.pnl != null ? signedRupees(r.pnl) : '—',
        pnlPct: r.pnl != null ? pct((r.pnl / r.invested) * 100) : '', weight: r.value != null && p.value ? `${((r.value / p.value) * 100).toFixed(1)}%` : '—',
        basis: r.q ? (r.q.basis === 'live' ? `Last trade · ${r.q.asOf}` : r.q.asOf) : 'Not priced yet', tone: r.pnl != null ? tone(r.pnl) : 'neutral',
        subtitle: `${count(r.h.qty)} × ${rupees(r.h.cost)}`, body: r.value != null ? `Value ${rupees(r.value)} · P&L ${signedRupees(r.pnl!)}\n\nDay ${signedRupees(r.day!)}` : 'Refresh prices to value this holding.',
      })),
    } : {}),
  };
  return { surface: 'portfolio', nodes, data: replaceAll(data) };
}

function instrument(s: State, a: Analysis): Update {
  const symbol = s.symbol!, q = s.quotes![symbol], has = a.rows.length > 0, r = s.research![symbol] ?? {};
  // With 50 sessions the chart starts where both averages exist, so no series has a gap.
  const long = a.rows.some((x) => x.sma50 !== null);
  const sma = a.rows.filter((x) => (long ? x.sma50 !== null : x.sma20 !== null)).map((x) => ({ date: x.date, close: x.close, sma20: x.sma20, ...(long ? { sma50: x.sma50 } : {}) }));
  const first = a.rows[0], last = a.rows.at(-1), watching = s.watchlist!.includes(symbol);
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['in-bar', 'in-selection-note', ...(s.problem ? ['in-problem'] : []), ...(q ? ['in-quote'] : []), ...(has || r.range || r.versus || r.volume || r.actions?.length || r.news?.length ? ['in-tabs'] : []), ...(!q && !has ? ['in-empty'] : [])] },
    ...tabbed('in-tabs', [['Price', has ? ['in-price'] : []], ['Indicators', has ? ['in-charts'] : []], ['Benchmark and range', r.range || r.versus || r.volume ? ['in-context'] : []], ['Events and news', r.actions?.length || r.news?.length ? ['in-events'] : []], ['Daily data', has ? ['in-ohlcv'] : []]]),
    { id: 'in-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['in-symbol', 'in-months', 'in-benchmark', 'in-fetch'] },
    { id: 'in-selection-note', type: 'text', props: { content: 'Choose a symbol, history and benchmark, then press Analyse. Saved results below keep their original dates until a read succeeds.', variant: 'caption' } },
    { id: 'in-symbol', type: 'input', props: { label: 'NSE symbol', bind: '/symbolDraft', placeholder: 'RELIANCE', maxWidth: 'sm' } },
    { id: 'in-months', type: 'select', props: { label: 'History', bind: '/months', presentation: 'dropdown', maxWidth: 'sm', options: [{ label: '1 month', value: '1' }, { label: '3 months', value: '3' }, { label: '6 months', value: '6' }, { label: '1 year', value: '12' }] } },
    { id: 'in-benchmark', type: 'select', props: { label: 'Benchmark', bind: '/benchmark', options: BENCHMARKS, presentation: 'dropdown', maxWidth: 'sm' } },
    { id: 'in-fetch', type: 'button', props: { label: 'Analyse', action: 'fetch_instrument', style: 'primary' } },
    ...(q ? [
      { id: 'in-actions-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: ['in-watch', 'in-alert'] },
      { id: 'in-watch', type: 'button', props: { label: watching ? 'On watchlist ✓' : '+ Watchlist', action: watching ? 'apply' : 'add_watch', payload: { symbol }, style: 'secondary' } },
      { id: 'in-alert', type: 'button', props: { label: 'Set alert', action: 'prepare_alert', payload: { symbol }, style: 'link' } },
    ] : []),
    ...(s.problem ? [problemNode('in-problem')] : []),
    ...(q ? [
      { id: 'in-quote', type: 'stack', props: { gap: 'sm' }, children: ['q-last', 'q-range', 'in-quote-stats', 'q-basis', 'in-actions-bar'] },
      { id: 'in-quote-stats', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm' }, children: ['q-prev', 'q-open', 'q-volume'] },
      { id: 'q-last', type: 'stat', props: { label: '{/quote/title}', value: '{/quote/last}', delta: '{/quote/change}', trend: '{/quote/trend}', size: 'hero' } },
      { id: 'q-prev', type: 'stat', props: { label: 'Previous close', value: '{/quote/previous}' } },
      { id: 'q-open', type: 'stat', props: { label: 'Open', value: '{/quote/open}' } },
      { id: 'q-range', type: 'rangebar', props: { label: 'Day range', low: '{/quote/low}', high: '{/quote/high}', min: '{/quote/low}', max: '{/quote/high}', marker: '{/quote/lastN}', lowLabel: '{/quote/lowText}', highLabel: '{/quote/highText}' } },
      { id: 'q-volume', type: 'stat', props: { label: 'Volume', value: '{/quote/volume}' } },
      { id: 'q-basis', type: 'text', props: { content: '{/quote/asOf}', variant: 'caption' } },
    ] : []),
    ...(has ? [
      { id: 'in-price', type: 'stack', props: { gap: 'sm' }, children: ['in-risk', 'in-interpretation', 'in-candles'] },
      { id: 'in-candles', type: 'chart', props: { kind: 'candlestick', title: '{/ohlcTitle}', series: { records: '{/history}', label: 'date', fields: ['open', 'high', 'low', 'close'] }, xScale: 'time', yScale: 'auto', height: 'md', maxWidth: a.rows.length < 20 ? 'md' : 'lg' } },
      { id: 'in-risk', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['r-return', 'r-vol', 'r-drawdown', 'r-sessions'] },
      { id: 'r-return', type: 'stat', props: { label: 'Price return', value: '{/stats/priceReturn}', trend: '{/stats/returnTrend}' } },
      { id: 'r-vol', type: 'stat', props: { label: 'Annualised volatility', value: '{/stats/volatility}' } },
      { id: 'r-drawdown', type: 'stat', props: { label: 'Max closing drawdown', value: '{/stats/maxDrawdown}' } },
      { id: 'r-sessions', type: 'stat', props: { label: 'Sessions · avg volume', value: '{/stats/sessions}' } },
      { id: 'in-interpretation', type: 'text', props: { content: '{/interpretation}', variant: 'caption' } },
    ] : []),
    ...(r.range || r.versus || r.volume ? [
      { id: 'in-context', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'md' }, children: [...(r.range ? ['in-52'] : []), ...(r.versus ? ['in-vs'] : []), ...(r.volume ? ['in-volume'] : [])] },
      ...(r.range ? [
        { id: 'in-52', type: 'section', props: { title: '52-week range', description: '{/range/note}' }, children: ['in-52-gauge'] },
        { id: 'in-52-gauge', type: 'rangebar', props: { label: '52 weeks', low: '{/range/low}', high: '{/range/high}', min: '{/range/low}', max: '{/range/high}', marker: '{/range/close}', lowLabel: '{/range/lowText}', highLabel: '{/range/highText}' } },
      ] : []),
      ...(r.versus ? [
        { id: 'in-vs', type: 'section', props: { title: '{/vs/title}', description: '{/vs/note}' }, children: ['in-vs-chart', 'in-vs-stats'] },
        { id: 'in-vs-chart', type: 'chart', props: { kind: 'bar', colorBy: 'sign', title: 'Return over the same dates (%)', series: { records: '{/vs/bars}', label: 'label', fields: ['returnPct'] }, height: 'sm' } },
        { id: 'in-vs-stats', type: 'grid', props: { columns: 3, gap: 'sm' }, children: ['vs-out', 'vs-beta', 'vs-corr'] },
        { id: 'vs-out', type: 'stat', props: { label: 'Outperformance', value: '{/vs/out}', trend: '{/vs/outTrend}' } },
        { id: 'vs-beta', type: 'stat', props: { label: 'Beta', value: '{/vs/beta}' } },
        { id: 'vs-corr', type: 'stat', props: { label: 'Correlation', value: '{/vs/corr}' } },
      ] : []),
      ...(r.volume ? [
        { id: 'in-volume', type: 'section', props: { title: 'Volume profile', description: '{/volume/note}' }, children: ['in-volume-stats'] },
        { id: 'in-volume-stats', type: 'grid', props: { columns: 2, gap: 'sm' }, children: ['v-avg', 'v-last', 'v-max', 'v-spikes'] },
        { id: 'v-avg', type: 'stat', props: { label: 'Average', value: '{/volume/average}' } },
        { id: 'v-last', type: 'stat', props: { label: 'Last vs average', value: '{/volume/last}', trend: '{/volume/trend}' } },
        { id: 'v-max', type: 'stat', props: { label: 'Highest', value: '{/volume/max}' } },
        { id: 'v-spikes', type: 'stat', props: { label: 'Spike sessions', value: '{/volume/spikes}' } },
      ] : []),
    ] : []),
    ...(has ? [
      { id: 'in-charts', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'md' }, children: [...(sma.length ? ['in-sma'] : []), 'in-vol-chart', 'in-returns', 'in-drawdown'] },
      ...(sma.length ? [{ id: 'in-sma', type: 'chart', props: { kind: 'line', title: '{/smaTitle}', series: { records: '{/sma}', label: 'date', fields: '{/smaFields}' }, xScale: 'time', yScale: 'auto', height: 'sm' } }] : []),
      { id: 'in-vol-chart', type: 'chart', props: { kind: 'bar', title: 'Daily volume · shares', series: { records: '{/history}', label: 'date', fields: ['volume'] }, xScale: 'time', height: 'sm' } },
      { id: 'in-returns', type: 'chart', props: { kind: 'bar', colorBy: 'sign', title: 'Daily return (%)', series: { records: '{/returns}', label: 'date', fields: ['returnPct'] }, xScale: 'time', height: 'sm' } },
      { id: 'in-drawdown', type: 'chart', props: { kind: 'line', title: 'Drawdown from closing peak (%)', series: { records: '{/history}', label: 'date', fields: ['drawdownPct'] }, xScale: 'time', height: 'sm' } },
    ] : []),
    ...(r.actions?.length || r.news?.length ? [
      { id: 'in-events', type: 'split', props: { ratio: '1:1', gap: 'md' }, children: [...(r.actions?.length ? ['in-actions'] : []), ...(r.news?.length ? ['in-news'] : [])] },
      ...(r.actions?.length ? [
        { id: 'in-actions', type: 'section', props: { title: 'Corporate actions · two years', description: 'Prices here are unadjusted; check splits and bonuses before reading a sharp drop.' }, children: ['in-actions-timeline'] },
        { id: 'in-actions-timeline', type: 'timeline', props: { events: '{/actions}' } },
      ] : []),
      ...(r.news?.length ? [
        { id: 'in-news', type: 'section', props: { title: '{/newsTitle}', description: 'Ranked stories from News Desk whose headline, excerpt or tags mention this symbol.' }, children: ['in-news-list'] },
        { id: 'in-news-list', type: 'stack', props: { gap: 'sm' }, children: { each: '/news', template: 'in-news-card' } } as Node,
        { id: 'in-news-card', type: 'card', props: { title: '{title}', subtitle: '{meta}', body: '{link}' } },
      ] : []),
    ] : []),
    ...(has ? [
      { id: 'in-ohlcv', type: 'section', props: { title: 'Exact observations', description: '{/historyWindow}' }, children: ['ohlcv'] },
      { id: 'ohlcv', type: 'table', props: { rows: '{/history}', columns: [{ key: 'date', label: 'Session' }, { key: 'open', label: 'Open', align: 'end' }, { key: 'high', label: 'High', align: 'end' }, { key: 'low', label: 'Low', align: 'end' }, { key: 'close', label: 'Close', align: 'end' }, { key: 'volume', label: 'Volume', align: 'end' }], sortable: true, pageSize: 10 } },
    ] : []),
    ...(!q && !has ? [{ id: 'in-empty', type: 'text', props: { content: '{/emptyHint}', variant: 'caption' } }] : []),
  ];
  const v = r.versus, vol = r.volume, rg = r.range;
  const data = {
    symbolDraft: s.symbolDraft, months: s.months, benchmark: s.benchmark,
    ...(s.problem ? { problem: s.problem } : {}),
    ...(q ? { quote: { title: `${symbol} · last`, last: inr(q.last), change: pct(q.changePct), trend: trend(q.changePct), previous: inr(q.previous), open: q.open != null ? inr(q.open) : '—', range: `${inr(q.low)} – ${inr(q.high)}`, low: q.low, high: q.high, lastN: q.last, lowText: inr(q.low), highText: inr(q.high), volume: count(q.volume), asOf: `NSE · ${q.basis === 'live' ? 'Last trade' : 'Close'} · ${q.asOf} · delayed` } } : {}),
    ...(has ? {
      ohlcTitle: `${symbol} · daily OHLC (INR)`, historyWindow: s.historyFor![symbol] ?? `${first!.date} – ${last!.date}`,
      history: a.rows, returns: a.rows.filter((x) => x.returnPct !== null).map((x) => ({ date: x.date, returnPct: Number(x.returnPct!.toFixed(3)) })),
      ...(sma.length ? { sma, smaFields: long ? ['close', 'sma20', 'sma50'] : ['close', 'sma20'], smaTitle: `Close with ${long ? '20- and 50-session' : '20-session'} averages · INR` } : {}),
      interpretation: `${pct(a.priceReturn)} unadjusted close-to-close from ${first!.date} to ${last!.date} over ${a.sessions} sessions; dividends excluded.`,
      stats: { priceReturn: pct(a.priceReturn), returnTrend: trend(a.priceReturn ?? 0), volatility: a.sessions >= 3 && a.volatility != null ? `${a.volatility.toFixed(2)}%` : 'Needs 3 sessions', maxDrawdown: pct(a.maxDrawdown), sessions: `${a.sessions} · ${count(a.averageVolume)}` },
    } : {}),
    ...(rg ? { range: { position: rg.position, label: `${inr(rg.low)} (${rg.lowDate}) → ${inr(rg.high)} (${rg.highDate})`, low: rg.low, high: rg.high, close: rg.close, lowText: inr(rg.low), highText: inr(rg.high), note: `Close ${inr(rg.close)} sits ${rg.position.toFixed(0)}% of the way from the 52-week low to the high: ${pct(rg.fromHigh)} from the high, ${pct(rg.fromLow)} above the low. Unadjusted closes.`, tone: rg.position >= 80 ? 'success' : rg.position <= 20 ? 'danger' : 'info' } } : {}),
    ...(v ? { vs: { title: `Against ${v.index}`, note: `${v.from} – ${v.to}, ${v.observations} shared sessions. Beta and correlation use daily changes; not annualised.`, bars: [{ label: symbol, returnPct: v.stockReturn }, { label: v.index, returnPct: v.indexReturn }], out: `${v.outperformance >= 0 ? '+' : ''}${v.outperformance.toFixed(2)} pts`, outTrend: trend(v.outperformance), beta: v.beta.toFixed(2), corr: v.correlation.toFixed(2) } } : {}),
    ...(vol ? { volume: { note: `Last ${vol.days} sessions.`, average: count(vol.average), last: pct(vol.lastVsAverage), trend: trend(vol.lastVsAverage), max: count(vol.max), spikes: String(vol.spikes) } } : {}),
    ...(r.actions?.length ? { actions: r.actions.slice(0, 12).map((x) => ({ title: x.purpose, date: x.exDate, note: x.type.replace(/_/g, ' ').toLowerCase() })) } : {}),
    ...(r.news?.length ? { newsTitle: `In the news · ${symbol}`, news: r.news.map((n) => ({ title: n.title, meta: `${n.source}${n.publishers > 1 ? ` + ${n.publishers - 1} more` : ''}${n.publishedAt ? ` · ${ist(n.publishedAt)}` : ''}`, link: `[Read at ${n.source.replace(/[\\`*_{}\[\]<>]/g, '')}](${n.url})` })) } : {}),
    ...(!q && !has ? { emptyHint: `Press Analyse for ${symbol}: delayed quote, daily candles, moving averages, risk, 52-week range, comparison with ${s.benchmark}, volume profile, corporate actions and related News Desk stories. ${SETUP}` } : {}),
  };
  return { surface: 'instrument', nodes, data: replaceAll(data) };
}

function indicesSurface(s: State): Update {
  const st = s.study, groupRows = s.indices!.filter((r) => s.indexGroup === 'all' || r.group === s.indexGroup);
  const names = [...new Set([...(s.indexNames!.length ? s.indexNames! : BENCHMARKS), s.studyDraft!, ...s.compareSet!])];
  const cmp = s.comparison, val = st?.valuation, perf = st?.performance, bars = st?.bars ?? [];
  const pe = bars.filter((b) => b.pe != null || b.pb != null);
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: [...(s.problem ? ['ix-problem'] : []), 'ix-tabs'] },
    ...tabbed('ix-tabs', [['Explore', ['ix-bar', 'ix-selection-note', st ? 'ix-study' : 'ix-hint']], ['Compare', ['ix-compare']], ['Live monitor', s.indices!.length ? ['ix-live'] : []]]),
    { id: 'ix-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end', maxWidth: 'md' }, children: ['ix-select', 'ix-go'] },
    { id: 'ix-selection-note', type: 'text', props: { content: 'Choose an index, then press Explore to read its results.', variant: 'caption' } },
    { id: 'ix-select', type: 'select', props: { label: 'Explore index', bind: '/studyDraft', options: '{/nameOptions}', presentation: 'dropdown', maxWidth: 'sm' } },
    { id: 'ix-go', type: 'button', props: { label: 'Explore', action: 'study_index', style: 'primary' } },
    ...(s.problem ? [problemNode('ix-problem')] : []),
    ...(st ? [
      { id: 'ix-study', type: 'stack', props: { gap: 'md' }, children: [...(perf ? ['ix-head-stats'] : []), 'ix-study-tabs'] },
      ...tabbed('ix-study-tabs', [['Horizon changes', perf ? ['ix-horizons'] : []], ['History', bars.length ? ['ix-price'] : []], ['Valuation', val ? ['ix-valuation'] : []]]),
      ...(perf ? [
        { id: 'ix-head-stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['ix-close', 'ix-1y', 'ix-high', 'ix-low'] },
        { id: 'ix-close', type: 'stat', props: { label: '{/perf/title}', value: '{/perf/close}', delta: '{/perf/day}', trend: '{/perf/dayTrend}' } },
        { id: 'ix-1y', type: 'stat', props: { label: 'One year', value: '{/perf/year}', trend: '{/perf/yearTrend}' } },
        { id: 'ix-high', type: 'stat', props: { label: '52-week high', value: '{/perf/high}', delta: '{/perf/belowHigh}' } },
        { id: 'ix-low', type: 'stat', props: { label: '52-week low', value: '{/perf/low}', delta: '{/perf/aboveLow}' } },
        { id: 'ix-horizons', type: 'chart', props: { kind: 'bar', colorBy: 'sign', title: 'Index level change by horizon (%) · close to close', series: { records: '{/perf/horizons}', label: 'period', fields: ['returnPct'] }, height: 'sm', maxWidth: 'md' } },
      ] : []),
      ...(bars.length ? [
        { id: 'ix-price', type: 'grid', props: { columns: pe.length ? 2 : 1, minItemWidth: 'md', gap: 'md' }, children: ['ix-candles', ...(pe.length ? ['ix-pe'] : [])] },
        { id: 'ix-candles', type: 'chart', props: { kind: 'candlestick', title: '{/barsTitle}', series: { records: '{/bars}', label: 'date', fields: ['open', 'high', 'low', 'close'] }, xScale: 'time', yScale: 'auto', height: 'md' } },
        ...(pe.length ? [{ id: 'ix-pe', type: 'chart', props: { kind: 'line', title: 'Published P/E and P/B', series: { records: '{/ratios}', label: 'date', fields: ['pe', 'pb'] }, xScale: 'time', yScale: 'auto', height: 'md' } }] : []),
      ] : []),
      ...(val ? [
        { id: 'ix-valuation', type: 'section', props: { title: 'Valuation against its own history', description: '{/val/note}' }, children: ['ix-val-grid'] },
        { id: 'ix-val-grid', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm' }, children: ['ix-val-pe', 'ix-val-pb', 'ix-val-dy'] },
        { id: 'ix-val-pe', type: 'progress', props: { label: '{/val/pe}', value: '{/val/pePct}', max: 100, kind: 'gauge' } },
        { id: 'ix-val-pb', type: 'progress', props: { label: '{/val/pb}', value: '{/val/pbPct}', max: 100, kind: 'gauge' } },
        { id: 'ix-val-dy', type: 'progress', props: { label: '{/val/dy}', value: '{/val/dyPct}', max: 100, kind: 'gauge' } },
      ] : []),
    ] : [{ id: 'ix-hint', type: 'text', props: { content: 'Choose an index and press Explore: returns from one day to two years, a year of daily candles, published P/E and P/B, and where today’s valuation sits in its two-year range.', variant: 'caption' } }]),
    { id: 'ix-compare', type: 'section', props: { title: 'Compare indices', description: 'Choose indices and a window, then press Compare. Same start and end dates for every index; dividends excluded.' }, children: ['ix-cmp-bar', ...(cmp ? ['ix-cmp-out'] : [])] },
    { id: 'ix-cmp-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['ix-cmp-set', 'ix-cmp-months', 'ix-cmp-go'] },
    { id: 'ix-cmp-set', type: 'select', props: { label: 'Indices (2–10)', bind: '/compareSet', options: '{/nameOptions}', multiple: true } },
    { id: 'ix-cmp-months', type: 'select', props: { label: 'Window', bind: '/compareMonths', presentation: 'dropdown', maxWidth: 'sm', options: [{ label: '3 months', value: '3' }, { label: '6 months', value: '6' }, { label: '1 year', value: '12' }] } },
    { id: 'ix-cmp-go', type: 'button', props: { label: 'Compare', action: 'compare_indices', style: 'secondary' } },
    ...(cmp ? [
      { id: 'ix-cmp-out', type: 'stack', props: { gap: 'md' }, children: ['ix-cmp-basis', 'ix-cmp-charts', 'ix-cmp-table'] },
      { id: 'ix-cmp-basis', type: 'text', props: { content: '{/comparisonBasis}', variant: 'caption' } },
      { id: 'ix-cmp-charts', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'md' }, children: ['ix-cmp-ret', 'ix-cmp-vol', 'ix-cmp-dd'] },
      { id: 'ix-cmp-ret', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: 'Return (%)', series: { records: '{/cmp}', label: 'label', fields: ['returnPct'] }, height: 'sm' } },
      { id: 'ix-cmp-vol', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', title: 'Annualised volatility (%)', series: { records: '{/cmp}', label: 'label', fields: ['volatility'] }, height: 'sm' } },
      { id: 'ix-cmp-dd', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', title: 'Maximum drawdown (%)', series: { records: '{/cmp}', label: 'label', fields: ['drawdown'] }, height: 'sm' } },
      { id: 'ix-cmp-table', type: 'table', props: { rows: '{/cmpRows}', columns: [{ key: 'label', label: 'Index' }, { key: 'ret', label: 'Return', align: 'end' }, { key: 'vol', label: 'Volatility', align: 'end' }, { key: 'dd', label: 'Max drawdown', align: 'end' }, { key: 'pe', label: 'P/E', align: 'end' }, { key: 'pb', label: 'P/B', align: 'end' }, { key: 'dy', label: 'Div. yield', align: 'end' }], sortable: true } },
    ] : []),
    ...(s.indices!.length ? [
      { id: 'ix-live', type: 'section', props: { title: 'Live index monitor', description: '{/liveNote}' }, children: ['ix-live-bar', 'ix-table'] },
      { id: 'ix-live-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['ix-group', 'ix-apply'] },
      { id: 'ix-apply', type: 'button', props: { label: 'Apply', action: 'apply', style: 'link' } },
      { id: 'ix-group', type: 'select', props: { label: 'Group', bind: '/indexGroup', options: [{ label: 'All groups', value: 'all' }, { label: 'Benchmarks', value: 'derivatives' }, { label: 'Broad market', value: 'broad' }, { label: 'Sectoral', value: 'sectoral' }, { label: 'Strategy', value: 'strategy' }, { label: 'Thematic', value: 'thematic' }, { label: 'Fixed income', value: 'fixed_income' }] } },
      { id: 'ix-table', type: 'table', props: { rows: '{/live}', columns: [{ key: 'label', label: 'Index' }, { key: 'level', label: 'Level', align: 'end' }, { key: 'change', label: 'Change', align: 'end' }, { key: 'range', label: 'Day range', align: 'end' }, { key: 'group', label: 'Group' }], sortable: true, searchable: true, pageSize: 15 } },
    ] : []),
  ];
  const ratio = (r: { current: number; min: number; max: number; median: number; percentile: number }, name: string, digits = 2) => `${name} ${num(r.current, digits)} · median ${num(r.median, digits)} · ${r.percentile.toFixed(0)}th percentile`;
  const data = {
    studyDraft: s.studyDraft, compareSet: s.compareSet, compareMonths: s.compareMonths, indexGroup: s.indexGroup,
    nameOptions: names.map((n) => ({ label: n, value: n })),
    ...(s.problem ? { problem: s.problem } : {}),
    ...(perf ? { perf: { title: `${perf.label} · ${perf.date}`, close: num(perf.close), day: pct(perf.horizons.find((h) => h.period === '1D')?.returnPct), dayTrend: trend(perf.horizons.find((h) => h.period === '1D')?.returnPct ?? 0), year: pct(perf.horizons.find((h) => h.period === '1Y')?.returnPct), yearTrend: trend(perf.horizons.find((h) => h.period === '1Y')?.returnPct ?? 0), high: `${num(perf.high)} · ${perf.highDate}`, belowHigh: pct(perf.belowHigh), low: `${num(perf.low)} · ${perf.lowDate}`, aboveLow: pct(perf.aboveLow), horizons: perf.horizons } } : {}),
    ...(bars.length ? { barsTitle: `${st!.label} · daily OHLC, ${bars[0]!.date} – ${bars.at(-1)!.date}`, bars: bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close })), ...(pe.length ? { ratios: pe.map((b) => ({ date: b.date, pe: b.pe, pb: b.pb })) } : {}) } : {}),
    ...(val ? { val: { note: `Share of sessions from ${val.from} to ${val.to} on which each ratio was lower than today. A two-year window, not a long-term valuation history.`, pe: ratio(val.pe, 'P/E'), pePct: val.pe.percentile, pb: ratio(val.pb, 'P/B'), pbPct: val.pb.percentile, dy: ratio(val.dy, 'Div. yield %'), dyPct: val.dy.percentile } } : {}),
    ...(cmp ? { comparisonBasis: `Saved comparison: ${cmp.from} – ${cmp.to}. Press Compare to apply the selected indices and window.`, cmp: cmp.rows, cmpRows: cmp.rows.map((r) => ({ label: r.label, ret: pct(r.returnPct), vol: `${r.volatility.toFixed(2)}%`, dd: `${r.drawdown.toFixed(2)}%`, pe: r.pe != null ? num(r.pe) : '—', pb: r.pb != null ? num(r.pb) : '—', dy: r.dy != null ? `${r.dy.toFixed(2)}%` : '—' })) } : {}),
    ...(s.indices!.length ? {
      liveNote: `${groupRows.length} ${groupRows.length === 1 ? 'index' : 'indices'} · exchange ${s.indices![0]!.exchangeAt} IST. Refresh on Overview updates this table.`,
      live: groupRows.map((r: Index) => ({ label: r.label, level: num(r.last), change: pct(r.changePct), range: r.low != null && r.high != null ? `${num(r.low)} – ${num(r.high)}` : '—', group: r.group.replace('_', ' ') })),
    } : {}),
  };
  return { surface: 'indices', nodes, data: replaceAll(data) };
}

function moversSurface(s: State): Update {
  const mv = s.movers, byValue = s.active?.byValue, byVolume = s.active?.byVolume, im = s.indexMovers;
  const any = mv || byValue || byVolume || im;
  const card = (prefix: string): Node[] => [
    { id: `${prefix}-card`, type: 'card', props: { title: '{symbol}', subtitle: '{price}', badge: '{change}', body: '{body}', tone: '{tone}' }, children: [`${prefix}-actions`] },
    { id: `${prefix}-actions`, type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: [`${prefix}-open`, `${prefix}-watch`] },
    { id: `${prefix}-open`, type: 'button', props: { label: 'Open', action: 'open_instrument', payload: { symbol: '{symbol}' }, style: 'secondary' } },
    { id: `${prefix}-watch`, type: 'button', props: { label: '+ Watch', action: 'add_watch', payload: { symbol: '{symbol}' }, style: 'link' } },
  ];
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['mv-bar', 'mv-selection-note', ...(s.problem ? ['mv-problem'] : []), ...(any ? ['mv-tabs'] : ['mv-empty'])] },
    ...tabbed('mv-tabs', [['Gainers and losers', mv ? ['mv-live'] : []], ['Most active', byValue || byVolume ? ['mv-active'] : []], ['Index movers', im ? ['mv-index'] : []]]),
    { id: 'mv-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['mv-segment', 'mv-period', 'mv-go'] },
    { id: 'mv-selection-note', type: 'text', props: { content: '{/selectionNote}', variant: 'caption' } },
    ...moversPicker('mv-segment', s),
    { id: 'mv-period', type: 'select', props: { label: 'Index movers over', bind: '/period', options: PERIODS } },
    { id: 'mv-go', type: 'button', props: { label: 'Refresh movers', action: 'refresh_movers', style: 'primary' } },
    ...(s.problem ? [problemNode('mv-problem')] : []),
    ...(mv ? [
      { id: 'mv-live', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'md' }, children: ['mv-gain-section', 'mv-loss-section'] },
      { id: 'mv-gain-section', type: 'section', props: { title: '{/gainTitle}', description: '{/liveNote}' }, children: ['mv-gain-chart', 'mv-gain-grid'] },
      { id: 'mv-gain-chart', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: 'Session change (%)', series: { records: '{/gainers}', label: 'symbol', fields: ['changePct'] }, height: 'sm' } },
      { id: 'mv-gain-grid', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm', pageSize: 6 }, children: { each: '/gainers', template: 'mvg-card' } } as Node, ...card('mvg'),
      { id: 'mv-loss-section', type: 'section', props: { title: '{/lossTitle}', description: '{/liveNote}' }, children: ['mv-loss-chart', 'mv-loss-grid'] },
      { id: 'mv-loss-chart', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: 'Session change (%)', series: { records: '{/losers}', label: 'symbol', fields: ['changePct'] }, height: 'sm' } },
      { id: 'mv-loss-grid', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm', pageSize: 6 }, children: { each: '/losers', template: 'mvl-card' } } as Node, ...card('mvl'),
    ] : []),
    ...(byValue || byVolume ? [
      { id: 'mv-active', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'md' }, children: [...(byValue ? ['mv-value'] : []), ...(byVolume ? ['mv-volume'] : [])] },
      ...(byValue ? [
        { id: 'mv-value', type: 'section', props: { title: '{/valueTitle}' }, children: ['mv-value-table'] },
        { id: 'mv-value-table', type: 'table', props: { rows: '{/byValue}', columns: [{ key: 'symbol', label: 'Symbol' }, { key: 'close', label: 'Close', align: 'end' }, { key: 'change', label: 'Change', align: 'end' }, { key: 'value', label: 'Traded value', align: 'end' }], sortable: true, pageSize: 10 } },
      ] : []),
      ...(byVolume ? [
        { id: 'mv-volume', type: 'section', props: { title: '{/volumeTitle}' }, children: ['mv-volume-table'] },
        { id: 'mv-volume-table', type: 'table', props: { rows: '{/byVolume}', columns: [{ key: 'symbol', label: 'Symbol' }, { key: 'close', label: 'Close', align: 'end' }, { key: 'change', label: 'Change', align: 'end' }, { key: 'volume', label: 'Shares', align: 'end' }], sortable: true, pageSize: 10 } },
      ] : []),
    ] : []),
    ...(im ? [
      { id: 'mv-index', type: 'section', props: { title: '{/indexTitle}', description: 'Close to close over the period; equity indices only.' }, children: ['mv-index-chart'] },
      { id: 'mv-index-chart', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', colorBy: 'sign', title: 'Best and worst indices (%)', series: { records: '{/indexRows}', label: 'label', fields: ['returnPct'] }, height: 'md' } },
    ] : []),
    ...(!any ? [{ id: 'mv-empty', type: 'text', props: { content: `Press Refresh movers for live gainers and losers, the most traded stocks by value and by shares, and the best and worst indices over the period. ${SETUP}`, variant: 'caption' } }] : []),
  ];
  const seg = mv ? segmentLabel(mv.segment) : '';
  const moverCard = (r: { symbol: string; last: number; changePct: number; turnover: string; quantity: string }) => ({ ...moverRow(r), body: `Turnover ${r.turnover ? `₹${r.turnover}` : '—'} · qty ${r.quantity || '—'}`, tone: tone(r.changePct) });
  const activeRow = (r: { symbol: string; close: number; changePct: number; volume: number; value: number | null }) => ({ symbol: r.symbol, close: inr(r.close), change: pct(r.changePct), value: crore(r.value), volume: count(r.volume) });
  const data = {
    segment: s.segment, period: s.period, selectionNote: `${moversNote(s)} Index ranking: ${im ? `showing ${im.period}` : 'not read yet'}; press Refresh movers to apply ${s.period}.`, ...(s.problem ? { problem: s.problem } : {}),
    ...(mv ? { gainTitle: `Top gainers · ${seg}`, lossTitle: `Top losers · ${seg}`, liveNote: `Live snapshot ${ist(mv.at)}; NSE refreshes it about every 5 minutes.`, gainers: mv.gainers.map(moverCard), losers: mv.losers.map(moverCard) } : {}),
    ...(byValue ? { valueTitle: `Most traded by value · ${byValue.date}`, byValue: byValue.rows.map(activeRow) } : {}),
    ...(byVolume ? { volumeTitle: `Most traded by shares · ${byVolume.date}`, byVolume: byVolume.rows.map(activeRow) } : {}),
    ...(im ? { indexTitle: `Index movers · ${im.period} (${im.base ? `${im.base} – ` : ''}${im.date})`, indexRows: [...im.gainers, ...[...im.losers].reverse()].map((r) => ({ label: r.label, returnPct: r.returnPct })) } : {}),
  };
  return { surface: 'movers', nodes, data: replaceAll(data) };
}

const alertText = (a: Alert) => (a.kind === 'above' ? `at or above ${inr(a.value)}` : a.kind === 'below' ? `at or below ${inr(a.value)}` : `moves ${a.value}% or more in a session`);
function alertsSurface(s: State): Update {
  const fired = s.alerts!.filter((a) => a.triggeredAt), armed = s.alerts!.filter((a) => !a.triggeredAt);
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['al-form', 'al-note', ...(fired.length ? ['al-fired'] : []), ...(armed.length ? ['al-armed'] : []), ...(!s.alerts!.length ? ['al-empty'] : [])] },
    { id: 'al-form', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['al-symbol', 'al-kind', 'al-value', 'al-add', 'al-clear'] },
    { id: 'al-symbol', type: 'input', props: { label: 'Symbol', bind: '/alertDraft/symbol', placeholder: 'TCS' } },
    { id: 'al-kind', type: 'select', props: { label: 'When', bind: '/alertDraft/kind', options: [{ label: 'Price at or above', value: 'above' }, { label: 'Price at or below', value: 'below' }, { label: 'Session move of at least (%)', value: 'move' }] } },
    { id: 'al-value', type: 'input', props: { label: 'Value', bind: '/alertDraft/value', placeholder: '2500 or 3' } },
    { id: 'al-clear', type: 'button', props: { label: 'Clear fields', action: 'clear_alert_draft', style: 'link' } },
    { id: 'al-add', type: 'button', props: { label: 'Add alert', action: 'add_alert', style: 'secondary' } },
    { id: 'al-note', type: 'text', props: { content: `Alerts are checked against the delayed quotes on every refresh, including the scheduled one under Manage. Only the first ${LIVE_QUOTES} tracked symbols get live quotes; the rest use the latest close.`, variant: 'caption' } },
    ...(fired.length ? [
      { id: 'al-fired', type: 'section', props: { title: 'Triggered' }, children: ['al-fired-grid'] },
      { id: 'al-fired-grid', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm' }, children: { each: '/fired', template: 'alf-card' } } as Node,
      { id: 'alf-card', type: 'card', props: { title: '{title}', subtitle: '{subtitle}', body: '{body}', tone: 'info', badge: 'Triggered' }, children: ['alf-actions'] },
      { id: 'alf-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: ['alf-rearm', 'alf-open', 'alf-delete'] },
      { id: 'alf-rearm', type: 'button', props: { label: 'Re-arm', action: 'rearm_alert', payload: { id: '{id}' }, style: 'secondary' } },
      { id: 'alf-open', type: 'button', props: { label: 'Open', action: 'open_instrument', payload: { symbol: '{symbol}' }, style: 'link' } },
      { id: 'alf-delete', type: 'button', props: { label: 'Delete', action: 'delete_alert', payload: { id: '{id}' }, style: 'link' } },
    ] : []),
    ...(armed.length ? [
      { id: 'al-armed', type: 'section', props: { title: 'Armed' }, children: ['al-armed-grid'] },
      { id: 'al-armed-grid', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm' }, children: { each: '/armed', template: 'ala-card' } } as Node,
      { id: 'ala-card', type: 'card', props: { title: '{title}', subtitle: '{subtitle}', body: '{body}', tone: 'neutral' }, children: ['ala-actions'] },
      { id: 'ala-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: ['ala-open', 'ala-delete'] },
      { id: 'ala-open', type: 'button', props: { label: 'Open', action: 'open_instrument', payload: { symbol: '{symbol}' }, style: 'link' } },
      { id: 'ala-delete', type: 'button', props: { label: 'Delete', action: 'delete_alert', payload: { id: '{id}' }, style: 'link' } },
    ] : []),
    ...(!s.alerts!.length ? [{ id: 'al-empty', type: 'text', props: { content: 'No alerts yet. Choose a symbol, a condition and a value; use Alert on any watchlist card to start one.', variant: 'caption' } }] : []),
  ];
  const card = (a: Alert) => {
    const q = s.quotes![a.symbol];
    return { id: a.id, symbol: a.symbol, title: `${a.symbol} ${alertText(a)}`, subtitle: `Created ${ist(a.createdAt)}`, body: a.triggeredAt ? `Triggered ${ist(a.triggeredAt)} at ${a.kind === 'move' ? pct(a.triggeredValue) : inr(a.triggeredValue!)}.` : q ? `Now ${inr(q.last)} (${pct(q.changePct)}) · ${q.asOf}` : 'No quote yet; refresh to check.' };
  };
  const data = { alertDraft: s.alertDraft, ...(fired.length ? { fired: fired.map(card) } : {}), ...(armed.length ? { armed: armed.map(card) } : {}) };
  return { surface: 'alerts', nodes, data: replaceAll(data) };
}

function sources(s: State): Update {
  const receipts = s.receipts!, failed = receipts.filter((r) => r.status.startsWith('Failed')).length;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['src-stats', 'src-tabs'] },
    ...tabbed('src-tabs', [['Ledger', ['ledger-section']], ['Methods', ['methods-section']]]),
    { id: 'src-stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['src-tracked', 'src-reads', 'src-failed', 'src-checked'] },
    { id: 'src-tracked', type: 'stat', props: { label: 'Tracked symbols', value: '{/stats/tracked}' } },
    { id: 'src-reads', type: 'stat', props: { label: 'Reads in ledger', value: '{/stats/reads}' } },
    { id: 'src-failed', type: 'stat', props: { label: 'Failed reads', value: '{/stats/failed}', tone: '{/stats/failTone}' } },
    { id: 'src-checked', type: 'stat', props: { label: 'Last market refresh', value: '{/stats/checked}' } },
    { id: 'ledger-section', type: 'section', props: { title: 'Source ledger', description: 'The latest 60 reads. A failed read keeps earlier observations and never counts as fresh data.' }, children: [receipts.length ? 'receipts' : 'no-receipts'] },
    receipts.length
      ? { id: 'receipts', type: 'table', props: { rows: '{/receipts}', columns: [{ key: 'tool', label: 'Tool' }, { key: 'subject', label: 'Subject' }, { key: 'sourceAt', label: 'Source time' }, { key: 'fetched', label: 'Retrieved' }, { key: 'rows', label: 'Rows', align: 'end' }, { key: 'status', label: 'Status' }], searchable: true, sortable: true, pageSize: 12 } }
      : { id: 'no-receipts', type: 'text', props: { content: `Nothing read yet. ${SETUP}`, variant: 'caption' } },
    { id: 'methods-section', type: 'section', props: { title: 'Methods and limits' }, children: ['methods'] },
    { id: 'methods', type: 'accordion', props: { items: [
      { title: 'Quotes and refresh', body: `Refresh reads every live index group, the movers for the chosen segment, end-of-day breadth and India VIX, and the tracked symbols: live delayed quotes for the first ${LIVE_QUOTES} (watchlist order, then holdings and alerts) and the latest close for the rest. NSE refreshes its live snapshot about every 5 minutes; the optional schedule under Manage matches that. Exchange holidays are not known to the session label.` },
      { title: 'Risk and returns', body: 'Volatility is the sample standard deviation of daily simple returns × √252. Drawdown is measured from the running closing peak. Moving averages start at their twentieth or fiftieth observation, never zero-filled. Prices are unadjusted for dividends and corporate actions.' },
      { title: 'Portfolio', body: 'Holdings are kept on this computer. Value, day change and P&L are computed in whole paise from the latest quote and that quote’s previous close; realised gains, charges and taxes are not included.' },
      { title: 'Benchmarks, breadth and valuation', body: 'Comparisons, beta, correlation, breadth, India VIX percentiles and index valuation percentiles are NSE’s published calculations, shown with their dates and methods. They are descriptive statistics, not forecasts or advice.' },
      { title: 'Storage', body: 'Daily stock OHLCV lives in this app’s DuckDB database; quotes, index snapshots, research, holdings, alerts and receipts are saved with the app. Actions run code only: no model request is made.' },
    ] } },
  ];
  const data = {
    stats: { tracked: String(tracked(s).length), reads: String(receipts.length), failed: String(failed), failTone: failed ? 'warning' : 'neutral', checked: s.checkedAt ? ist(s.checkedAt) : '—' },
    ...(receipts.length ? { receipts: receipts.map((r) => ({ ...r, tool: r.tool.replace(/^[^_]+__/, ''), sourceAt: r.sourceAt || '—', fetched: ist(r.fetchedAt) })) } : {}),
  };
  return { surface: 'sources', nodes, data: replaceAll(data) };
}

