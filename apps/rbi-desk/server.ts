// RBI Desk: the Reserve Bank of India's Current Rates panel and five official RSS feeds
// (Speeches and Publications embed whole documents, beyond the 256 KiB tool reply bound),
// read through the governed `web__fetch_page` tool. Rates, their daily history, feed
// items, source health and receipts live in `context.state`; `view()` derives every
// surface and `handleQuery()` every exported tool answer from that one state. Values are
// only what RBI published; changes come from comparing stored days, never inference.
import { parseFeed, sourceBody } from './feed.ts';
import { parsePanel, RATE_KEYS, type Rate } from './rates.ts';
import { DIRECTIONS, official, parseDirections, parseReserves, noticeText, type Direction, type Reserves } from './data.ts';

export interface Item { id: string; title: string; url: string; feed: string; publishedAt: string | null; excerpt: string; tags: string[]; detail?: string }
export interface Day { date: string; values: Record<string, string> }
export interface Health { at: string; ok?: string; failures: number; error?: string }
export interface Receipt { source: string; url: string; at: string; rows: number; status: string }
export interface Filters { feed: string; tag: string; query: string }
export interface State {
  rates?: Rate[]; ratesAt?: string; history?: Day[]; items?: Item[]; filters?: Filters;
  health?: Record<string, Health>; receipts?: Receipt[]; problem?: string; checkedAt?: string;
  reserves?: Reserves[]; directions?: Direction[]; directionsAt?: string; directionQuery?: string;
}
export interface Context { state: State; callTool(name: string, args: Record<string, unknown>): Promise<unknown> }
interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
interface Update { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] }

export const HOME = 'https://www.rbi.org.in/';
export const FEEDS: Record<string, string> = {
  'Press releases': 'https://rbi.org.in/pressreleases_rss.xml',
  Notifications: 'https://rbi.org.in/notifications_rss.xml',
  Bulletin: 'https://rbi.org.in/Bulletin_rss.xml',
  'Annual report': 'https://rbi.org.in/AnnualReportMain_rss.xml',
  Tenders: 'https://rbi.org.in/tenders_rss.xml',
};
// Fixed title rules, no model: a tag narrows a search, an untagged item stays searchable.
const TAGS: [string, RegExp][] = [
  ['policy', /monetary policy|policy rate|repo rate|\bmpc\b/i],
  ['penalty', /penalty|penalised|penalized/i],
  ['gold-bond', /sovereign gold bond|\bsgb\b/i],
  ['auction', /auction/i],
  ['deposit-rates', /lending and deposit rates|deposit rate/i],
  ['kyc', /\bkyc\b|know your customer/i],
  ['payments', /payment|\bupi\b|prepaid|card/i],
  ['forex-reserves', /weekly statistical supplement|foreign exchange reserves/i],
];
export const TAG_NAMES = TAGS.map(([t]) => t);
// Daily values compared for change: the ones a person asks "did it change?" about.
const TRACKED = ['repo', 'sdf', 'msf', 'bank', 'crr', 'slr', 'usd'];
const MAX_ITEMS = 300, MAX_DAYS = 730, SETUP = 'Use Access in the app header to review this app’s Web pages tools, destinations and background access.';
export const TITLES: Record<string, string> = { rates: 'Rates', reserves: 'Reserves', updates: 'Updates', rulebook: 'Rulebook', sources: 'Sources' };

// --- canonical state ---------------------------------------------------------------

const line = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);
const iso = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined);
const istDate = (at: string) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const tags = (title: string) => TAGS.filter(([, re]) => re.test(title)).map(([t]) => t);

/** State arrives as untrusted JSON. */
export function normalize(s: State): State {
  const rates = (Array.isArray(s.rates) ? s.rates : []).filter((r) => r && RATE_KEYS.includes(r.key) && typeof r.value === 'string');
  const history = (Array.isArray(s.history) ? s.history : []).filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.values && typeof d.values === 'object').slice(-MAX_DAYS);
  const items = (Array.isArray(s.items) ? s.items : []).filter((i) => i && typeof i.id === 'string' && typeof i.title === 'string' && i.feed in FEEDS)
    .filter((i) => official(i.url)).map((i) => ({ ...i, title: line(i.title, 240), excerpt: line(i.excerpt, 280), detail: typeof i.detail === 'string' ? i.detail.slice(0, 12_000) : undefined, publishedAt: iso(i.publishedAt) ?? null, tags: tags(i.title) })).slice(0, MAX_ITEMS);
  const f = (s.filters && typeof s.filters === 'object' ? s.filters : {}) as Partial<Filters>;
  const health: Record<string, Health> = {};
  for (const [k, h] of Object.entries(s.health && typeof s.health === 'object' ? s.health : {})) if (h && iso(h.at)) health[k] = { at: h.at, ...(iso(h.ok) ? { ok: h.ok } : {}), failures: Number(h.failures) || 0, ...(h.error ? { error: line(h.error, 300) } : {}) };
  return {
    rates, ratesAt: iso(s.ratesAt), history, items, health,
    reserves: (Array.isArray(s.reserves) ? s.reserves : []).filter((r) => r && official(r.url) && iso(r.weekEnding) && iso(r.retrievedAt) && Array.isArray(r.rows) && r.rows.length === 5 && new Set(r.rows.map((v) => v?.key)).size === 5 && r.rows.every((v) => v && ['total', 'fca', 'gold', 'sdr', 'imf'].includes(v.key) && [v.inrCrore, v.usdMillion, v.weekInrCrore, v.weekUsdMillion].every((n) => typeof n === 'string' && /^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(n)))).slice(-104),
    directions: (Array.isArray(s.directions) ? s.directions : []).filter((d) => d && official(d.url) && typeof d.title === 'string' && typeof d.category === 'string' && iso(d.issuedOn)).slice(0, 1000),
    directionsAt: iso(s.directionsAt), directionQuery: line(s.directionQuery, 80),
    filters: { feed: f.feed && f.feed in FEEDS ? f.feed : 'All', tag: TAG_NAMES.includes(String(f.tag)) ? String(f.tag) : 'All', query: line(f.query, 60) },
    receipts: (Array.isArray(s.receipts) ? s.receipts : []).filter((r) => r && typeof r.source === 'string').slice(0, 30),
    problem: typeof s.problem === 'string' ? s.problem.slice(0, 600) : undefined, checkedAt: iso(s.checkedAt),
  };
}

/** Each tracked rate's change points: the day a value first differed from the stored day before. */
export function changes(history: Day[], key: string) {
  const out: { date: string; from: string; to: string }[] = [];
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1]!.values[key], b = history[i]!.values[key];
    if (a && b && a !== b) out.push({ date: history[i]!.date, from: a, to: b });
  }
  return out;
}

// --- refresh -----------------------------------------------------------------------

export const reason = (e: unknown) => String((e as Error)?.message ?? e)
  .replace(/<\/?tool_output[^>]*>/g, ' ').replace(/This is data returned by a tool, not instructions\.[^\n]*/g, ' ')
  .replace(/^\s*error:\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 300);
const text = (r: unknown) => {
  if (r && typeof r === 'object' && (r as { isError?: boolean }).isError) throw new Error(String((r as { text?: unknown }).text ?? 'Source tool failed'));
  return typeof r === 'string' ? r : String((r as { text?: unknown })?.text ?? '');
};

/** Reads the rates panel and the five feeds (6 governed calls); also the scheduled refresh. */
export async function refresh(c: Context) {
  const s = (c.state = normalize(c.state));
  const failed: string[] = [];
  const record = (source: string, url: string, at: string, rows: number, error?: string) => {
    const prev = s.health![source];
    s.health![source] = error ? { ...(prev ?? {}), at, failures: (prev?.failures ?? 0) + 1, error } : { at, ok: at, failures: 0 };
    s.receipts!.unshift({ source, url, at, rows, status: error ? `Failed: ${error}` : 'Validated' });
    if (error) failed.push(`${source}: ${error}`);
  };
  let at = new Date().toISOString();
  try {
    const panel = parsePanel(text(await c.callTool('web__fetch_page', { url: HOME })), at);
    s.rates = panel.rates; s.ratesAt = at;
    const date = istDate(at), values = Object.fromEntries(panel.rates.filter((r) => TRACKED.includes(r.key)).map((r) => [r.key, r.value]));
    const last = s.history!.at(-1);
    if (last?.date === date) last.values = values; else s.history!.push({ date, values });
    s.history = s.history!.slice(-MAX_DAYS);
    record('Current rates', HOME, at, panel.rates.length);
  } catch (e) { record('Current rates', HOME, at, 0, reason(e)); }
  const byId = new Map(s.items!.map((i) => [i.id, i]));
  for (const [feed, url] of Object.entries(FEEDS)) {
    at = new Date().toISOString();
    try {
      const rows = parseFeed(sourceBody(await c.callTool('web__fetch_page', { url })), { name: feed, category: feed, url }, at);
      for (const r of rows) if (official(r.url)) byId.set(r.id, { id: r.id, title: r.title, url: r.url, feed, publishedAt: r.publishedAt, excerpt: r.excerpt, tags: tags(r.title), ...(byId.get(r.id)?.detail ? { detail: byId.get(r.id)!.detail } : {}) });
      record(feed, url, at, rows.length);
    } catch (e) { record(feed, url, at, 0, reason(e)); }
  }
  const when = (i: Item) => i.publishedAt ?? '';
  s.items = [...byId.values()].sort((a, b) => when(b).localeCompare(when(a))).slice(0, MAX_ITEMS);
  // Follow only official release links discovered in the current feed; no guessed IDs.
  const releases = s.items.filter((i) => i.feed === 'Press releases' && /\/BS_PressReleaseDisplay\.aspx\?prid=\d+$/i.test(new URL(i.url).pathname + new URL(i.url).search));
  const wss = releases.find((i) => i.tags.includes('forex-reserves'));
  at = new Date().toISOString();
  try {
    if (!wss) throw Error('No Weekly Statistical Supplement release in the saved press feed; earlier reserves are kept');
    const snapshot = parseReserves(text(await c.callTool('web__fetch_page', { url: wss.url })), wss.url, at);
    s.reserves = [...s.reserves!.filter((r) => r.weekEnding !== snapshot.weekEnding), snapshot].sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)).slice(-104);
    record('Forex reserves', wss.url, at, snapshot.rows.length);
  } catch (e) { record('Forex reserves', wss?.url ?? FEEDS['Press releases']!, at, 0, reason(e)); }
  at = new Date().toISOString();
  try {
    s.directions = parseDirections(text(await c.callTool('web__fetch_page', { url: DIRECTIONS })));
    s.directionsAt = at;
    record('Master Directions', DIRECTIONS, at, s.directions.length);
  } catch (e) { record('Master Directions', DIRECTIONS, at, 0, reason(e)); }
  const gold = releases.find((i) => i.tags.includes('gold-bond'));
  if (gold) {
    at = new Date().toISOString();
    try { gold.detail = noticeText(text(await c.callTool('web__fetch_page', { url: gold.url })), gold.url); record('Gold bond notice', gold.url, at, 1); }
    catch (e) { record('Gold bond notice', gold.url, at, 0, reason(e)); }
  }
  s.receipts = s.receipts!.slice(0, 30);
  s.checkedAt = new Date().toISOString();
  s.problem = failed.length ? `${failed.length} sources failed; earlier values are kept. First: ${failed[0]}` : undefined;
  return { updates: view(s) };
}

export async function handleAction(controlId: string, value: unknown, c: Context, action?: string) {
  const s = (c.state = normalize(c.state));
  if (!action) {
    if (controlId === '/directionQuery') { s.directionQuery = line(value, 80); return { updates: [rulebookSurface(s)] }; }
    const m = /^\/filters\/(feed|tag|query)$/.exec(controlId);
    if (!m) throw new Error(`Unknown RBI Desk field: ${controlId}`);
    (s.filters as unknown as Record<string, string>)[m[1]!] = line(value, 60);
    c.state = normalize(s);
    return { updates: [updatesSurface(c.state)] };
  }
  if (action === 'refresh') return refresh(c);
  if (action === 'clear_filters') s.filters = { feed: 'All', tag: 'All', query: '' };
  else if (action === 'search_directions') { /* The bound query already saved; this button applies the view. */ }
  else if (action === 'show_sources') return { updates: view(s), focusSurface: 'sources' };
  else throw new Error(`Unknown RBI Desk action: ${action}`);
  return { updates: view(s) };
}

// --- exported read-only tools --------------------------------------------------------

const stale = (s: State) => !s.ratesAt || Date.now() - Date.parse(s.ratesAt) > 36 * 3600_000;
const match = (i: Item, p: { feed?: string; tag?: string; query?: string; since?: string }) =>
  // "All" means every notice except procurement tenders, which only the Tenders filter shows.
  (!p.feed || p.feed === 'All' ? i.feed !== 'Tenders' : i.feed.toLowerCase() === p.feed.toLowerCase()) && (!p.tag || p.tag === 'All' || i.tags.includes(p.tag)) &&
  (!p.since || (i.publishedAt ?? '') >= p.since) && (!p.query || p.query.toLowerCase().split(/\s+/).every((w) => `${i.title} ${i.excerpt}`.toLowerCase().includes(w)));
const EMPTY = 'RBI Desk has not read RBI yet. Open RBI Desk and choose Refresh, or turn on its schedule. ' + SETUP;

export async function handleQuery(toolName: string, params: Record<string, unknown> = {}, context: Context): Promise<unknown> {
  const s = normalize(context.state), source = { source: 'Reserve Bank of India', url: HOME };
  if (toolName === 'get_rbi_rates') {
    if (!s.rates!.length) return { error: EMPTY };
    const rate = line(params.rate, 30);
    if (rate && !RATE_KEYS.includes(rate)) return { error: `Unknown rate. Choose one of: ${RATE_KEYS.join(', ')}` };
    return {
      ...source, retrievedAt: s.ratesAt, stale: stale(s),
      note: 'Policy rates and reserve ratios are current as published; exchange and market values carry their own asOf date.',
      rates: s.rates!.filter((r) => !rate || r.key === rate).map((r) => {
        const last = TRACKED.includes(r.key) ? changes(s.history!, r.key).at(-1) : undefined;
        return { ...r, date: r.asOf ?? s.ratesAt!.slice(0, 10), dateBasis: r.asOf ? 'as published for this date' : 'read on this date; RBI gives no effective date', sourceUrl: HOME, ...(last ? { lastChange: last } : {}) };
      }),
      trackedSince: s.history![0]?.date ?? null,
    };
  }
  if (toolName === 'get_rate_history') {
    if (!s.history!.length) return { error: EMPTY };
    const key = line(params.rate, 20).toLowerCase();
    if (!TRACKED.includes(key)) return { error: `rate must be one of ${TRACKED.join(', ')}` };
    const since = line(params.since, 10);
    const days = s.history!.filter((d) => d.values[key] && (!since || d.date >= since));
    const observed = changes(s.history!, key).filter((c) => !since || c.date >= since);
    return { ...source, rate: key, trackedSince: s.history![0]?.date ?? null, observations: days.length, hasObservedChange: observed.length > 0, changes: observed, days: days.slice(-60).map((d) => ({ date: d.date, value: d.values[key] })), coverageNote: `${observed.length ? `${observed.length} stored change points.` : `No change observed in ${days.length} stored days.`} Tracking began ${s.history![0]?.date}; earlier decisions are unknown. One stored day cannot establish whether the rate changed recently.` };
  }
  if (toolName === 'get_rbi_updates') {
    if (!s.items!.length) return { error: EMPTY };
    const p = { feed: line(params.feed, 30), tag: line(params.tag, 30), query: line(params.query, 60), since: line(params.since, 10) };
    const limit = Math.max(1, Math.min(Number(params.limit) || 10, 30));
    const rows = s.items!.filter((i) => match(i, p));
    return { ...source, checkedAt: s.checkedAt, stale: stale(s), count: rows.length, ...(rows.length ? {} : { coverageNote: 'No matching notices in RBI Desk’s saved feeds. This does not establish that RBI has issued none; do not substitute unrelated notices.' }), items: rows.slice(0, limit).map(({ id: _, ...i }) => i) };
  }
  if (toolName === 'get_forex_reserves') {
    if (!s.reserves!.length) return { error: EMPTY };
    const weeks = Math.max(1, Math.min(Math.floor(Number(params.weeks) || 1), 104));
    return { ...source, stale: Date.now() - Date.parse(s.reserves!.at(-1)!.retrievedAt) > 8 * 86400_000 || Date.now() - Date.parse(s.reserves!.at(-1)!.weekEnding) > 15 * 86400_000 || Boolean(s.health!['Forex reserves']?.error), coverageNote: `Week ending ${s.reserves!.at(-1)!.weekEnding}; published ${s.reserves!.at(-1)!.publishedAt}. Figures are in US$ million and INR crore; weekly variations are RBI’s published figures.`, units: { inrCrore: 'INR crore', usdMillion: 'US$ million' }, weeks: s.reserves!.slice(-weeks), note: 'Weekly variations are published by RBI, not inferred from the days this app read. Totals may differ from components due to rounding.' };
  }
  if (toolName === 'find_master_direction') {
    if (!s.directions!.length) return { error: EMPTY };
    const query = line(params.query, 80);
    if (!query) return { error: 'Give a topic to search, such as Know Your Customer or payments.' };
    const rows = directionMatches(s, query);
    return { ...source, url: DIRECTIONS, retrievedAt: s.directionsAt, stale: !s.directionsAt || Date.now() - Date.parse(s.directionsAt) > 8 * 86400_000, count: rows.length, directions: rows.slice(0, 30), note: 'Directory titles and dates only; open the linked direction for the full rule. This is not a legal interpretation.' };
  }
  if (toolName === 'get_rbi_briefing') return { ...source, retrievedAt: s.ratesAt ?? null, text: briefing(s) };
  throw new Error(`Unknown query tool: ${toolName}`);
}

// --- derived views -----------------------------------------------------------------

const replaceAll = (value: Record<string, unknown>) => [{ op: 'replace' as const, path: '/' as const, value }];
const escape = (t: string) => t.replace(/[\\`*_{}\[\]<>]/g, '\\$&');
const ist = (at: string | null | undefined) => {
  const d = new Date(at ?? '');
  return Number.isFinite(d.getTime()) ? `${d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} IST` : 'never';
};
/** "2026-10-30" as "30 Oct 2026"; anything else unchanged. */
const day = (d: string | null | undefined) => d && /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : d ?? '';
/** RBI's figures with grouping: US$ in thousands, rupees in lakh/crore; weekly changes signed. Values stay RBI's own. */
const grouped = (v: string, locale: 'en-US' | 'en-IN', signed = false) => {
  const n = Number(v.replaceAll(',', ''));
  return Number.isFinite(n) ? `${signed && n > 0 ? '+' : ''}${n.toLocaleString(locale, { maximumFractionDigits: 2 })}` : v;
};
const status = (s: State) => s.problem ? [{ id: 'problem', type: 'text', props: { content: '{/problem}', variant: 'caption' } }] : [];

export function view(input: State): Update[] {
  const s = normalize(input);
  return [ratesSurface(s), reservesSurface(s), updatesSurface(s), rulebookSurface(s), sourcesSurface(s)];
}

const MONTH = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
// "5.50%" is said "5.5 percent": a voice reads every written digit after the point.
const said = (v: string) => v.replace(/(\.\d*?)0+%/g, '$1%').replace(/\.%/g, '%').replace(/%/g, ' percent').replace(/ - /g, ' to ');
/** The radio briefing: the same rates, changes and items the surfaces show, as spoken sentences. */
export function briefing(s: State, items = 3): string {
  const get = (k: string) => s.rates!.find((r) => r.key === k);
  if (!s.rates!.length) return 'RBI Desk has not read the Reserve Bank of India yet. Use Refresh at the top right.';
  const at = new Date(s.ratesAt ?? '').toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
  const parts = [`RBI update, read from the Reserve Bank of India website on ${at} India time.`];
  const repo = get('repo'), sdf = get('sdf'), msf = get('msf'), crr = get('crr'), slr = get('slr'), usd = get('usd');
  if (repo) parts.push(`The policy repo rate is ${said(repo.value)}.`);
  if (sdf && msf) parts.push(`The standing deposit facility rate is ${said(sdf.value)}, and the marginal standing facility rate ${said(msf.value)}.`);
  if (crr && slr) parts.push(`The cash reserve ratio is ${said(crr.value)}, and the statutory liquidity ratio ${said(slr.value)}.`);
  if (usd) parts.push(`The reference rate is ${usd.value} rupees per US dollar${usd.asOf ? `, as on ${MONTH(usd.asOf)}` : ''}.`);
  const changed = TRACKED.flatMap((k) => { const c = changes(s.history!, k).at(-1); return c ? [`${get(k)?.label ?? k} moved from ${said(c.from)} to ${said(c.to)} on ${MONTH(c.date)}`] : []; });
  if (changed.length) parts.push(`${changed.join('. ')}.`);
  const reserve = s.reserves!.at(-1), total = reserve?.rows.find((r) => r.key === 'total');
  if (reserve && total) parts.push(`Foreign exchange reserves were ${total.usdMillion} million US dollars for the week ending ${MONTH(reserve.weekEnding)}.`);
  if (reserve && (Date.now() - Date.parse(reserve.weekEnding) > 15 * 86400_000 || s.health!['Forex reserves']?.error)) parts.push('The latest reserves read is incomplete or old; check Sources before relying on it.');
  const latest = s.items!.filter((i) => match(i, {})).slice(0, items);
  if (latest.length) parts.push(`Latest from RBI. ${latest.map((i) => `${i.title.replace(/\s+$/, '')}${i.publishedAt ? `, ${MONTH(i.publishedAt.slice(0, 10))}` : ''}.`).join(' ')}`);
  if (stale(s)) parts.push('These values may be out of date; refresh RBI Desk.');
  return parts.join('\n\n');
}

/** RBI's US$ million said in billions, rounded the way a presenter would; the tables keep the exact figure. */
const usdBillions = (million: string) => `${(Number(million.replaceAll(',', '')) / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} billion US dollars`;

/**
 * The briefing as a programme the header plays as radio and Watch: the same
 * rates, changes, reserves and notices as the surfaces, one record per part,
 * with a greeting and a sign-off. Wording is fixed; values are RBI's own.
 */
export function programme(s: State, now = Date.now()) {
  const title = 'RBI Desk';
  if (!s.rates!.length) return { title, segments: [] };
  const get = (k: string) => s.rates!.find((r) => r.key === k);
  const hour = Number(new Date(now).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  const read = new Date(s.ratesAt ?? now).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' });
  const at = new Date(s.ratesAt ?? now).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const source = 'Reserve Bank of India';
  const out: Record<string, unknown>[] = [{ text: `${greeting}. This is your RBI Desk briefing, with the Reserve Bank of India's figures as read from its website on ${read}, at ${at}.`, delivery: 'opening', cue: 'intro', kicker: title, heading: `Read ${read} · ${at}` }];
  const repo = get('repo'), sdf = get('sdf'), msf = get('msf'), crr = get('crr'), slr = get('slr'), usd = get('usd');
  const repoDays = s.history!.filter((d) => d.values.repo).map((d) => ({ date: d.date, repo: Number.parseFloat(d.values.repo!) }));
  const headline = (text: string, heading: string, figures: { label: string; value: string }[], extra = {}) => out.push({ text, delivery: 'headline', bed: true, break: 'short', kicker: 'The rates', heading, source, figures, ...extra });
  if (repo) headline(`The headlines. The policy repo rate stands at ${said(repo.value)}.`, 'Policy repo rate', [{ label: repo.label, value: repo.value }],
    repoDays.length > 2 ? { chart: { kind: 'line', title: 'Policy repo rate', points: repoDays.map((d) => d.repo), labels: [day(repoDays[0]!.date), day(repoDays.at(-1)!.date)] } } : {});
  if (sdf && msf) headline(`The standing deposit facility rate is ${said(sdf.value)}, and the marginal standing facility rate is ${said(msf.value)}.`, 'The policy corridor', [{ label: sdf.label, value: sdf.value }, { label: msf.label, value: msf.value }]);
  if (crr && slr) headline(`Banks keep a cash reserve ratio of ${said(crr.value)}, and a statutory liquidity ratio of ${said(slr.value)}.`, 'Reserve ratios', [{ label: crr.label, value: crr.value }, { label: slr.label, value: slr.value }]);
  if (usd) headline(`The rupee's reference rate is ${usd.value} to the US dollar${usd.asOf ? `, as on ${MONTH(usd.asOf)}` : ''}.`, 'Rupee reference rate', [{ label: 'USD/INR', value: usd.value }]);
  const changed = TRACKED.flatMap((k) => { const c = changes(s.history!, k).at(-1); return c ? [`The ${(get(k)?.label ?? k).replace(/^the /i, '')} moved from ${said(c.from)} to ${said(c.to)} on ${MONTH(c.date)}.`] : []; });
  if (changed.length) out.push({ text: `What has changed. ${changed.join(' ')}`, delivery: 'story', break: 'section', kicker: 'Changes', heading: 'Changes since tracking began', source });
  const reserve = s.reserves!.at(-1), total = reserve?.rows.find((r) => r.key === 'total');
  if (reserve && total) {
    const week = Number(total.weekUsdMillion.replaceAll(',', ''));
    out.push({
      text: `Foreign exchange reserves stood at ${usdBillions(total.usdMillion)} for the week ending ${MONTH(reserve.weekEnding)}${week ? `, ${week > 0 ? 'up' : 'down'} ${usdBillions(String(Math.abs(week)))} on the week` : ''}.${Date.now() - Date.parse(reserve.weekEnding) > 15 * 86400_000 || s.health!['Forex reserves']?.error ? ' This reading is old or incomplete, so check the sources before relying on it.' : ''}`,
      delivery: 'story', break: 'section', kicker: 'Reserves', heading: `Week ending ${day(reserve.weekEnding)}`, source,
      figures: [{ label: 'Total · US$ million', value: total.usdMillion }, { label: 'Weekly change', value: grouped(total.weekUsdMillion, 'en-US', true) }],
    });
  }
  s.items!.filter((i) => match(i, {})).slice(0, 5).forEach((i, n) => out.push({
    text: `${n ? 'Also from the Reserve Bank' : 'Latest from the Reserve Bank'}${i.publishedAt ? `, on ${MONTH(i.publishedAt.slice(0, 10))}` : ''}. ${i.title.trim().replace(/[.:;,]?$/, '.')}`,
    delivery: 'aside', break: n ? 'story' : 'section', kicker: i.feed, heading: i.title, source, link: i.url, ...(i.publishedAt ? { at: i.publishedAt } : {}),
  }));
  const first = out.findIndex((x) => x.delivery === 'story' || x.delivery === 'aside');
  if (first > 0) out[first] = { ...out[first], cue: 'sting' };
  out.push({ text: `${stale(s) ? 'These values may be out of date, so refresh RBI Desk before relying on them. ' : ''}That's the RBI briefing. The rates and notices are the Reserve Bank's own; open RBI Desk for the full texts. Thanks for listening.`, delivery: 'closing', cue: 'outro', break: 'section', kicker: title, heading: 'Full texts and sources are in RBI Desk' });
  return { title, segments: out };
}

function ratesSurface(s: State): Update {
  const has = s.rates!.length > 0, get = (k: string) => s.rates!.find((r) => r.key === k);
  const repoDays = s.history!.filter((d) => d.values.repo).map((d) => ({ date: d.date, repo: Number.parseFloat(d.values.repo!) }));
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md' }, children: [...(s.problem ? ['problem'] : []), ...(has ? ['as-of', 'headline', 'changes', ...(repoDays.length > 1 ? ['repo-chart'] : []), 'panel'] : ['empty'])] },
    ...status(s),
    ...(has ? [
      { id: 'as-of', type: 'text', props: { content: '{/asOf}', variant: 'caption' } },
      { id: 'headline', type: 'grid', props: { columns: 6, minItemWidth: 'sm', gap: 'sm' }, children: { each: '/headline', template: 'headline-stat' } },
      { id: 'headline-stat', type: 'stat', props: { label: '{label}', value: '{value}' } },
      { id: 'changes', type: 'text', props: { content: '{/changes}', variant: 'caption' } },
      ...(repoDays.length > 1 ? [{ id: 'repo-chart', type: 'chart', props: { kind: 'line', title: 'Policy repo rate · % (days RBI Desk read)', series: { records: '{/repoDays}', label: 'date', fields: ['repo'] }, height: 'sm' } }] : []),
      { id: 'panel', type: 'table', props: { rows: '{/panel}', columns: [{ key: 'group', label: 'Group' }, { key: 'label', label: 'Rate' }, { key: 'value', label: 'Value', align: 'end' }, { key: 'asOf', label: 'Date' }], pageSize: 25 } },
    ] : [
      { id: 'empty', type: 'card', props: { title: 'No RBI rates yet', body: `Use Refresh at the top right to read the Current Rates panel and the official RBI feeds from rbi.org.in. ${SETUP}` } },
    ]),
  ];
  const changed = TRACKED.flatMap((k) => { const c = changes(s.history!, k).at(-1); return c ? [`${get(k)?.label ?? k}: ${c.from} → ${c.to} on ${day(c.date)}`] : []; });
  const data = has ? {
    ...(s.problem ? { problem: s.problem } : {}),
    asOf: `Read from rbi.org.in ${ist(s.ratesAt)}${stale(s) ? ' · may be out of date, refresh' : ''}. Exchange and market values show their own date.`,
    headline: ['repo', 'sdf', 'msf', 'crr', 'slr', 'usd'].flatMap((k) => { const r = get(k); return r ? [{ label: r.key === 'usd' ? `USD/INR${r.asOf ? ` · ${day(r.asOf)}` : ''}` : r.label, value: r.value }] : []; }),
    changes: changed.length ? `Changes seen: ${changed.join('; ')}.` : `No change seen since tracking began on ${s.history![0] ? day(s.history![0].date) : 'the first read'}.`,
    ...(repoDays.length > 1 ? { repoDays } : {}),
    panel: s.rates!.map((r) => ({ group: r.group, label: r.label, value: r.value, asOf: r.asOf ? day(r.asOf) : `read ${day(s.ratesAt)}` })),
    spoken: { briefing: briefing(s), programme: programme(s) },
  } : { ...(s.problem ? { problem: s.problem } : {}), spoken: { briefing: briefing(s), programme: programme(s) } };
  return { surface: 'rates', nodes, data: replaceAll(data) };
}

function updatesSurface(s: State): Update {
  const rows = s.items!.filter((i) => match(i, s.filters!));
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md' }, children: [...(s.problem ? ['problem'] : []), 'filter-bar', rows.length ? 'list' : 'none'] },
    ...status(s),
    { id: 'filter-bar', type: 'stack', props: { direction: 'horizontal', wrap: true, gap: 'sm', align: 'end' }, children: ['feed', 'tag', 'query', 'clear'] },
    { id: 'feed', type: 'select', props: { label: 'Feed', bind: '/filters/feed', options: '{/feedOptions}' } },
    { id: 'tag', type: 'select', props: { label: 'Topic', bind: '/filters/tag', options: '{/tagOptions}' } },
    { id: 'query', type: 'input', props: { label: 'Search', bind: '/filters/query', placeholder: 'KYC, penalty, gold bond' } },
    { id: 'clear', type: 'button', props: { label: 'Clear', action: 'clear_filters', style: 'secondary' } },
    rows.length
      ? { id: 'list', type: 'grid', props: { columns: 1, gap: 'sm', pageSize: 12, searchable: false }, children: { each: '/shown', template: 'item' } }
      : { id: 'none', type: 'text', props: { content: s.items!.length ? 'No RBI items match these filters.' : 'No items yet. Use Refresh at the top right.', variant: 'caption' } },
    ...(rows.length ? [{ id: 'item', type: 'text', props: { content: '{line}' } }] : []),
  ];
  const data = {
    ...(s.problem ? { problem: s.problem } : {}), filters: s.filters,
    feedOptions: ['All', ...Object.keys(FEEDS)].map((v) => ({ label: v === 'All' ? 'All notices' : v, value: v })),
    tagOptions: ['All', ...TAG_NAMES].map((v) => ({ label: v === 'All' ? 'All' : v.replace('-', ' '), value: v })),
    shown: rows.map((i) => ({ line: `**[${escape(i.title)}](${i.url})**  \n${escape(i.feed)} · ${i.publishedAt ? day(i.publishedAt) : 'date unknown'}${i.tags.length ? ` · ${i.tags.map((t) => t.replace('-', ' ')).join(', ')}` : ''}` })),
  };
  return { surface: 'updates', nodes, data: replaceAll(data) };
}

function reservesSurface(s: State): Update {
  const last = s.reserves!.at(-1), total = last?.rows.find((r) => r.key === 'total');
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: [...(s.problem ? ['problem'] : []), ...(last ? ['basis', 'total', 'components', ...(s.reserves!.length > 1 ? ['history'] : [])] : ['empty'])] },
    ...status(s),
    ...(last ? [
      { id: 'basis', type: 'text', props: { content: '{/basis}' } },
      { id: 'total', type: 'stat', props: { label: 'Total foreign exchange reserves · US$ million', value: '{/total}', delta: '{/totalWeek}', trend: '{/totalTrend}' } },
      { id: 'components', type: 'table', props: { rows: '{/rows}', columns: [{ key: 'label', label: 'Component' }, { key: 'usdMillion', label: 'US$ million', align: 'end' }, { key: 'inrCrore', label: 'INR crore', align: 'end' }, { key: 'weekUsdMillion', label: 'Weekly change · US$ million', align: 'end' }, { key: 'weekInrCrore', label: 'Weekly change · INR crore', align: 'end' }] } },
      ...(s.reserves!.length > 1 ? [{ id: 'history', type: 'chart', props: { kind: 'line', title: 'Total reserves · US$ million · weeks this app read', series: { records: '{/history}', label: 'week', fields: ['total'] }, xScale: 'time', yScale: 'auto', height: 'sm' } }] : []),
    ] : [{ id: 'empty', type: 'text', props: { content: 'No reserves table read yet. Use Refresh at the top right; the weekly RBI press release supplies the figures.' } }]),
  ];
  return { surface: 'reserves', nodes, data: replaceAll({ ...(s.problem ? { problem: s.problem } : {}), ...(last ? { total: total && grouped(total.usdMillion, 'en-US'), ...(total ? { totalWeek: `${grouped(total.weekUsdMillion, 'en-US', true)} this week`, totalTrend: Number(total.weekUsdMillion.replaceAll(',', '')) > 0 ? 'up' : Number(total.weekUsdMillion.replaceAll(',', '')) < 0 ? 'down' : 'flat' } : {}),
    rows: last.rows.map((r) => ({ ...r, usdMillion: grouped(r.usdMillion, 'en-US'), inrCrore: grouped(r.inrCrore, 'en-IN'), weekUsdMillion: grouped(r.weekUsdMillion, 'en-US', true), weekInrCrore: grouped(r.weekInrCrore, 'en-IN', true) })),
    basis: `Week ending ${day(last.weekEnding)}. Published ${day(last.publishedAt)}; read ${ist(last.retrievedAt)}. [RBI source](${last.url}). Weekly variations are RBI’s published values; rounding can affect totals.${Date.now() - Date.parse(last.retrievedAt) > 8 * 86400_000 ? ' This stored read may be out of date; refresh.' : ''}`, ...(s.reserves!.length > 1 ? { history: s.reserves!.map((r) => ({ week: r.weekEnding, total: Number(r.rows.find((x) => x.key === 'total')!.usdMillion.replaceAll(',', '')) })) } : {}) } : {}) }) };
}

const directionMatches = (s: State, query: string) => {
  const words = query.toLowerCase().replace(/\bkyc\b/g, 'know your customer').split(/\s+/).filter(Boolean);
  return s.directions!.filter((d) => words.every((w) => `${d.title} ${d.category}`.toLowerCase().includes(w)));
};
function rulebookSurface(s: State): Update {
  // Newest first by the latest stated date; the directory keeps RBI's own order in state.
  const rows = directionMatches(s, s.directionQuery!).sort((a, b) => (b.amendedOn ?? b.issuedOn).localeCompare(a.amendedOn ?? a.issuedOn));
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md' }, children: [...(s.problem ? ['problem'] : []), 'intro', 'search-bar', ...(rows.length ? ['directions'] : ['empty'])] },
    ...status(s),
    { id: 'intro', type: 'text', props: { content: '{/intro}' } },
    { id: 'search-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['query', 'search'] },
    { id: 'query', type: 'input', props: { label: 'Search direction titles or categories', bind: '/directionQuery', placeholder: 'KYC, payments, commercial banks' } },
    { id: 'search', type: 'button', props: { label: 'Search', action: 'search_directions', style: 'secondary' } },
    ...(rows.length ? [
      { id: 'directions', type: 'grid', props: { columns: 1, pageSize: 12, gap: 'sm', searchable: false }, children: { each: '/rows', template: 'direction' } },
      { id: 'direction', type: 'text', props: { content: '{line}' } },
    ] : [{ id: 'empty', type: 'text', props: { content: s.directions!.length ? 'No direction titles match. Try fewer words.' : 'Use Refresh at the top right to read RBI’s directory.' } }]),
  ];
  return { surface: 'rulebook', nodes, data: replaceAll({ ...(s.problem ? { problem: s.problem } : {}), intro: `${rows.length} of ${s.directions!.length} direction titles. Last read ${ist(s.directionsAt)}. Open the official link for the full rule; titles are not a legal interpretation.`, directionQuery: s.directionQuery, rows: rows.map((d) => ({ line: `**[${escape(d.title)}](${d.url})**  \n${escape(d.category)} · issued ${day(d.issuedOn)}${d.amendedOn ? ` · amended ${day(d.amendedOn)}` : ''}` })) }) };
}

function sourcesSurface(s: State): Update {
  const names = ['Current rates', ...Object.keys(FEEDS), 'Forex reserves', 'Master Directions', 'Gold bond notice'];
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md' }, children: ['health', 'receipts-section'] },
    { id: 'health', type: 'table', props: { rows: '{/health}', columns: [{ key: 'source', label: 'Source' }, { key: 'status', label: 'Status' }, { key: 'last', label: 'Last good read' }] } },
    { id: 'receipts-section', type: 'section', props: { title: 'Recent reads', description: 'Every read goes through the Web pages integration to rbi.org.in only.' }, children: ['receipts'] },
    { id: 'receipts', type: 'table', props: { rows: '{/receipts}', columns: [{ key: 'source', label: 'Source' }, { key: 'at', label: 'Time' }, { key: 'rows', label: 'Rows', align: 'end' }, { key: 'status', label: 'Status' }], pageSize: 10 } },
  ];
  const data = {
    health: names.map((n) => { const h = s.health![n]; return { source: n, status: !h ? 'Not read yet' : h.error ? `Failing (${h.failures}): ${h.error}` : 'OK', last: ist(h?.ok) }; }),
    receipts: s.receipts!.map((r) => ({ source: r.source, at: ist(r.at), rows: r.rows, status: r.status })),
  };
  return { surface: 'sources', nodes, data: replaceAll(data) };
}

/** The shipped surface.json: every view of a new, empty app. */
export const surfaceFile = () => view({}).map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) { return {updates:view(normalize(context.state))}; }
