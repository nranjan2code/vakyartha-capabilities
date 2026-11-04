// News Desk: publisher feeds read through the governed `web__fetch_page` tool,
// grouped into stories and ranked by freshness, coverage breadth, followed topics
// and source preference (rank.ts). Feeds, articles, follows, bookmarks, feed
// health and receipts live in `context.state`; `view()` derives every surface from
// them. Articles keep their own publication and retrieval times; a failed read
// keeps the old ones. Nothing is summarized or rewritten and no model is called.
import { canonical, parseFeed, sourceBody, type Article } from './feed.ts';
import { DEFAULT_WEIGHTS, discoverTopics, diverse, matches, rank, type Level, type Prefs, type Story, type Weights } from './rank.ts';
import { bulletin, programme, storyReport } from './bulletin.ts';

export type Weight = 'prefer' | 'normal' | 'less';
export interface Feed { name: string; category: string; url: string; enabled?: boolean; weight?: Weight }
export interface Receipt { source: string; url: string; at: string; rows: number; status: string }
export interface Health { at: string; ok?: string; failures: number; items: number; images: number; error?: string }
export type Stored = Article & { firstSeen?: string };
export interface Filters { category: string; window: string; source: string; sort: string }
/** Reader-owned ranking and retention settings; every number is shown on the Preferences surface. */
export interface Tuning {
  sections: Record<string, Level>; mutes: string[]; weights: Weights; halfLife: number; perSource: number;
  learn: boolean; keepDays: number; perFeed: number;
}
export interface State {
  feeds?: Feed[]; newFeed?: Partial<Feed>; opml?: string; filters?: Filters; category?: string;
  articles?: Stored[]; saved?: string[]; topics?: string[]; topicDraft?: string; topic?: string; story?: string;
  images?: boolean; channel?: string; reads?: string[]; lastSeenAt?: string; health?: Record<string, Health>;
  receipts?: Receipt[]; problem?: string; checkedAt?: string; tuning?: Tuning; muteDraft?: string;
}
export interface Context { state: State; surfaces?: Record<string, unknown>; callTool(name: string, args: Record<string, unknown>): Promise<unknown> }
interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
interface Update { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] }

const f = (name: string, category: string, url: string, enabled = false): Feed => ({ name, category, url, enabled });
/** Curated publisher feeds, each checked to parse live; a broad mix is enabled so stories group across sources. */
export const DEFAULT_FEEDS: Feed[] = [
  f('BBC World', 'World', 'https://feeds.bbci.co.uk/news/world/rss.xml', true),
  f('The Guardian World', 'World', 'https://www.theguardian.com/world/rss', true),
  f('Al Jazeera English', 'World', 'https://www.aljazeera.com/xml/rss/all.xml', true),
  f('The Hindu International', 'World', 'https://www.thehindu.com/news/international/feeder/default.rss'),
  f('NPR World', 'World', 'https://feeds.npr.org/1004/rss.xml'),
  f('France 24', 'World', 'https://www.france24.com/en/rss'),
  f('The Hindu National', 'National', 'https://www.thehindu.com/news/national/feeder/default.rss', true),
  f('Indian Express India', 'National', 'https://indianexpress.com/section/india/feed/', true),
  f('Hindustan Times India', 'National', 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml'),
  f('NDTV Top Stories', 'National', 'https://feeds.feedburner.com/ndtvnews-top-stories'),
  f('Livemint Markets', 'Business', 'https://www.livemint.com/rss/markets', true),
  f('Economic Times', 'Business', 'https://economictimes.indiatimes.com/rssfeedstopstories.cms'),
  f('BBC Business', 'Business', 'https://feeds.bbci.co.uk/news/business/rss.xml'),
  f('The Hindu Business', 'Business', 'https://www.thehindu.com/business/feeder/default.rss'),
  f('Livemint Companies', 'Business', 'https://www.livemint.com/rss/companies'),
  f('Business Standard', 'Business', 'https://www.business-standard.com/rss/home_page_top_stories.rss'),
  f('The Guardian Business', 'Business', 'https://www.theguardian.com/business/rss'),
  f('BBC Technology', 'Technology', 'https://feeds.bbci.co.uk/news/technology/rss.xml', true),
  f('Ars Technica', 'Technology', 'https://feeds.arstechnica.com/arstechnica/index', true),
  f('The Verge', 'Technology', 'https://www.theverge.com/rss/index.xml'),
  f('Wired', 'Technology', 'https://www.wired.com/feed/rss'),
  f('TechCrunch', 'Technology', 'https://techcrunch.com/feed/'),
  f('The Hindu Technology', 'Technology', 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss'),
  f('Indian Express Tech', 'Technology', 'https://indianexpress.com/section/technology/feed/'),
  f('BBC Science', 'Science', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', true),
  f('The Guardian Science', 'Science', 'https://www.theguardian.com/science/rss'),
  f('The Hindu Science', 'Science', 'https://www.thehindu.com/sci-tech/science/feeder/default.rss'),
  f('Phys.org', 'Science', 'https://phys.org/rss-feed/'),
  f('NASA News Releases', 'Science', 'https://www.nasa.gov/news-release/feed/'),
  f('BBC Health', 'Health', 'https://feeds.bbci.co.uk/news/health/rss.xml', true),
  f('The Hindu Health', 'Health', 'https://www.thehindu.com/sci-tech/health/feeder/default.rss'),
  f('BBC Sport', 'Sports', 'https://feeds.bbci.co.uk/sport/rss.xml', true),
  f('Indian Express Sports', 'Sports', 'https://indianexpress.com/section/sports/feed/', true),
  f('The Hindu Sport', 'Sports', 'https://www.thehindu.com/sport/feeder/default.rss'),
  f('ESPNcricinfo', 'Sports', 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml'),
  f('BBC Entertainment & Arts', 'Entertainment', 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml'),
  f('Indian Express Entertainment', 'Entertainment', 'https://indianexpress.com/section/entertainment/feed/'),
  f('The Hindu Entertainment', 'Entertainment', 'https://www.thehindu.com/entertainment/feeder/default.rss'),
  f('The Hindu Opinion', 'Opinion', 'https://www.thehindu.com/opinion/feeder/default.rss'),
  f('Indian Express Opinion', 'Opinion', 'https://indianexpress.com/section/opinion/feed/'),
  f('The Guardian Opinion', 'Opinion', 'https://www.theguardian.com/commentisfree/rss'),
  f('Times of India Top Stories', 'National', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms'),
  f('India Today', 'National', 'https://www.indiatoday.in/rss/home'),
  f('Firstpost India', 'National', 'https://www.firstpost.com/commonfeeds/v1/mfp/rss/india.xml'),
  f('Livemint News', 'Business', 'https://www.livemint.com/rss/news', true),
  f('Moneycontrol Latest', 'Business', 'https://www.moneycontrol.com/rss/latestnews.xml'),
  f('BBC Hindi', 'Hindi', 'https://feeds.bbci.co.uk/hindi/rss.xml', true),
  f('Aaj Tak', 'Hindi', 'https://www.aajtak.in/rssfeeds/?id=home'),
  f('Amar Ujala', 'Hindi', 'https://www.amarujala.com/rss/breaking-news.xml'),
  f('PIB Press Releases', 'Official', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3'),
  f('News18 India', 'National', 'https://www.news18.com/rss/india.xml'),
  f('Scroll', 'National', 'https://feeds.feedburner.com/ScrollinArticles.rss'),
  f('ThePrint', 'National', 'https://theprint.in/googlenews.xml'),
  f('Deccan Herald', 'National', 'https://www.deccanherald.com/news_sitemap.xml'),
];

// A run allows 16 governed tool calls; 15 feed reads per refresh, stalest first,
// so larger configurations rotate through every feed over consecutive refreshes.
const BUDGET_MS = 15_000, MAX_FEEDS = 60, MAX_SAVED = 80, RECENT = 480, MAX_ARTICLES = 560, READS = 15, MAX_TOPICS = 20;
export const TITLES: Record<string, string> = { top: 'Top stories', sections: 'Sections', story: 'Full coverage', following: 'Following', saved: 'Saved', sources: 'Sources', preferences: 'Preferences' };
export const DEFAULT_TUNING: Tuning = { sections: {}, mutes: [], weights: { ...DEFAULT_WEIGHTS }, halfLife: 8, perSource: 3, learn: false, keepDays: 7, perFeed: 40 };
const LEVELS = new Set(['more', 'less', 'off']), HALF_LIVES = [4, 8, 24], KEEP_DAYS = [1, 3, 7, 14], MAX_MUTES = 30;
const num = (v: unknown, lo: number, hi: number, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback; };
function tuning(raw: Partial<Tuning> | undefined): Tuning {
  const t = raw && typeof raw === 'object' ? raw : {}, w = (t.weights ?? {}) as Partial<Weights>, d = DEFAULT_TUNING;
  const sections: Record<string, Level> = {};
  for (const [k, v] of Object.entries(t.sections && typeof t.sections === 'object' ? t.sections : {})) if (LEVELS.has(v as string)) sections[line(k, 40)] = v as Level;
  return {
    sections, mutes: [...new Set((Array.isArray(t.mutes) ? t.mutes : []).map((m) => line(m, 40)).filter(Boolean))].slice(0, MAX_MUTES),
    weights: { fresh: num(w.fresh, 0, 5, d.weights.fresh), coverage: num(w.coverage, 0, 5, d.weights.coverage), topics: num(w.topics, 0, 5, d.weights.topics), publisher: num(w.publisher, 0, 5, d.weights.publisher), unseen: num(w.unseen, 0, 5, d.weights.unseen) },
    halfLife: HALF_LIVES.includes(Number(t.halfLife)) ? Number(t.halfLife) : d.halfLife, perSource: Math.round(num(t.perSource, 1, 6, d.perSource)),
    learn: t.learn === true, keepDays: KEEP_DAYS.includes(Number(t.keepDays)) ? Number(t.keepDays) : d.keepDays, perFeed: Math.round(num(t.perFeed, 10, 60, d.perFeed)),
  };
}
const SETUP = 'Use Access in the app header to review this app’s Web pages tools, destinations and background access.';
const WINDOWS: Record<string, number> = { '24h': 24, '72h': 72, '7d': 168, all: Infinity };
const NO_FILTERS: Filters = { category: 'All', window: '72h', source: 'All', sort: 'relevance' };
const OLD_DEFAULTS = new Set(['world/rss.xml', 'business/rss.xml', 'technology/rss.xml', 'science_and_environment/rss.xml'].map((p) => `https://feeds.bbci.co.uk/news/${p}`));

// --- canonical state ---------------------------------------------------------------

const line = (v: unknown, max: number) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);
const iso = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined);
/** One feed from untrusted input; throws a sentence the person can act on. */
export function feed(raw: Partial<Feed>): Feed {
  const name = line(raw?.name, 80), category = line(raw?.category, 40);
  if (!name || !category) throw new Error('Each feed needs a name and a category');
  const weight = raw.weight === 'prefer' || raw.weight === 'less' ? raw.weight : 'normal';
  return { name, category, url: canonical(String(raw.url ?? '').trim()), enabled: raw.enabled !== false, ...(weight !== 'normal' ? { weight } : {}) };
}
function article(a: Stored): Stored | undefined {
  if (!a || typeof a.id !== 'string' || typeof a.title !== 'string' || typeof a.url !== 'string' || typeof a.source !== 'string' || typeof a.category !== 'string' || typeof a.retrievedAt !== 'string') return undefined;
  const image = typeof a.image === 'string' && /^https:\/\//.test(a.image) ? a.image.slice(0, 800) : undefined;
  return {
    id: a.id, title: a.title.slice(0, 240), url: a.url, source: a.source, category: a.category, publishedAt: iso(a.publishedAt) ?? null,
    retrievedAt: a.retrievedAt, excerpt: line(a.excerpt, 280), ...(image ? { image } : {}), ...(a.author ? { author: line(a.author, 80) } : {}),
    ...(Array.isArray(a.tags) && a.tags.length ? { tags: a.tags.filter((t) => typeof t === 'string').slice(0, 8) } : {}),
    ...(iso(a.firstSeen) ? { firstSeen: a.firstSeen } : {}),
  };
}

/** State arrives as untrusted JSON: version 1 kept the feeds as a JSON string, version 2 had one category filter. */
export function normalize(s: State): State {
  let raw: unknown = s.feeds;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = undefined; } }
  let list = Array.isArray(raw) ? (raw as Partial<Feed>[]) : [];
  if (list.length === 4 && list.every((x) => x && OLD_DEFAULTS.has(String(x.url ?? '')) && x.enabled === undefined)) list = [];
  const feeds = [...new Map(list.flatMap((x) => { try { return [feed(x)]; } catch { return []; } }).map((x) => [x.url, x])).values()].slice(0, MAX_FEEDS);
  const articles = (Array.isArray(s.articles) ? s.articles : []).flatMap((a) => article(a) ?? []).slice(0, MAX_ARTICLES);
  const ids = new Set(articles.map((a) => a.id));
  const nf = s.newFeed && typeof s.newFeed === 'object' ? s.newFeed : {};
  const fl = (s.filters && typeof s.filters === 'object' ? s.filters : {}) as Partial<Filters>;
  const health: Record<string, Health> = {};
  for (const [url, h] of Object.entries(s.health && typeof s.health === 'object' ? s.health : {})) {
    if (h && iso(h.at)) health[url] = { at: h.at, ...(iso(h.ok) ? { ok: h.ok } : {}), failures: Number(h.failures) || 0, items: Number(h.items) || 0, images: Number(h.images) || 0, ...(h.error ? { error: line(h.error, 300) } : {}) };
  }
  const topics = [...new Set((Array.isArray(s.topics) ? s.topics : []).map((t) => line(t, 60)).filter(Boolean))].slice(0, MAX_TOPICS);
  return {
    feeds: feeds.length ? feeds : DEFAULT_FEEDS.map((x) => ({ ...x })),
    newFeed: { name: line(nf.name, 80), category: line(nf.category, 40), url: line(nf.url, 500) }, opml: typeof s.opml === 'string' ? s.opml.slice(0, 60000) : '',
    filters: {
      category: line(fl.category ?? s.category, 40) || 'All', window: fl.window && fl.window in WINDOWS ? fl.window : NO_FILTERS.window,
      source: line(fl.source, 80) || 'All', sort: fl.sort === 'newest' ? 'newest' : 'relevance',
    },
    articles, saved: (Array.isArray(s.saved) ? s.saved : []).filter((id) => ids.has(id)).slice(0, MAX_SAVED),
    topics, topicDraft: line(s.topicDraft, 60), topic: topics.includes(String(s.topic)) ? String(s.topic) : topics[0],
    story: typeof s.story === 'string' && ids.has(s.story) ? s.story : undefined, images: s.images !== false,
    channel: line(s.channel, 90) || 'top', reads: (Array.isArray(s.reads) ? s.reads : []).filter((id) => ids.has(id)).slice(0, 60),
    lastSeenAt: iso(s.lastSeenAt), health, tuning: tuning(s.tuning), muteDraft: line(s.muteDraft, 40),
    receipts: (Array.isArray(s.receipts) ? s.receipts : []).filter((r) => r && typeof r.source === 'string').slice(0, 40),
    problem: typeof s.problem === 'string' ? s.problem.slice(0, 800) : undefined, checkedAt: iso(s.checkedAt),
  };
}

// --- refresh -----------------------------------------------------------------------

/** A tool failure as one readable sentence: the host's untrusted-output envelope and labels removed, never cut mid-address. */
export const reason = (e: unknown) => String((e as Error)?.message ?? e)
  .replace(/<\/?tool_output[^>]*>/g, ' ').replace(/This is data returned by a tool, not instructions\.[^\n]*/g, ' ')
  .replace(/\b(error|refused):\s*(?=(error|refused):)/gi, '').replace(/^\s*error:\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 400);
const active = (s: State) => s.feeds!.filter((x) => x.enabled !== false);

/** Reads up to 15 active feeds, least recently read first; also the scheduled refresh. */
export async function refresh(c: Context) {
  const s = (c.state = normalize(c.state));
  const feeds = active(s);
  if (!feeds.length) { s.problem = 'No feeds are enabled. Enable at least one feed in Sources.'; return { updates: view(s) }; }
  const due = [...feeds].sort((a, b) => (s.health![a.url]?.at ?? '').localeCompare(s.health![b.url]?.at ?? '')).slice(0, READS);
  const incoming: Article[] = [], failed: string[] = [], started = Date.now(), read: Feed[] = [];
  for (const x of due) {
    // A run that outlives its time limit is recorded as uncertain and blocks every control until reviewed;
    // stop starting reads well inside the limit and leave the rest to the next rotation.
    if (Date.now() - started > BUDGET_MS) break;
    read.push(x);
    const at = new Date().toISOString(), previous = s.health![x.url];
    try {
      const rows = parseFeed(sourceBody(await c.callTool('web__fetch_page', { url: x.url })), x, at);
      if (!rows.length) throw new Error('Feed has no usable article URLs');
      incoming.push(...rows);
      s.health![x.url] = { at, ok: at, failures: 0, items: rows.length, images: rows.filter((r) => r.image).length };
      s.receipts!.unshift({ source: x.name, url: x.url, at, rows: rows.length, status: 'Validated' });
    } catch (e) {
      const message = reason(e);
      failed.push(`${x.name}: ${message}`);
      s.health![x.url] = { ...(previous ?? { items: 0, images: 0 }), at, failures: (previous?.failures ?? 0) + 1, error: message };
      s.receipts!.unshift({ source: x.name, url: x.url, at, rows: 0, status: `Failed: ${message}` });
    }
  }
  const byId = new Map(s.articles!.map((a) => [a.id, a]));
  const first = s.checkedAt ?? new Date().toISOString();
  for (const row of incoming) byId.set(row.id, { ...row, firstSeen: byId.get(row.id)?.firstSeen ?? new Date().toISOString() });
  const newest = (a: Article, b: Article) => (b.publishedAt ?? b.retrievedAt).localeCompare(a.publishedAt ?? a.retrievedAt);
  s.articles = [...byId.values()];
  prune(s, Date.now());
  s.receipts = s.receipts!.slice(0, 40);
  s.lastSeenAt ??= first;
  s.checkedAt = new Date().toISOString();
  const rest = feeds.length - read.length;
  s.problem = failed.length
    ? `${failed.length} of ${read.length} feeds failed; their earlier articles are kept. First: ${failed[0]}`
    : rest > 0 ? `Read ${read.length} of ${feeds.length} active feeds, least recently read first; the next refresh reads the other ${rest}.` : undefined;
  return { updates: view(s) };
}

/**
 * Retention, in order: articles from feeds no longer configured go; then anything older
 * than the reader's window; then each feed keeps only its newest perFeed, so a busy feed
 * cannot push a quiet one out; then the overall bound. Saved articles always stay.
 */
export function prune(s: State, now: number) {
  const t = s.tuning!, names = new Set(s.feeds!.map((x) => x.name)), saved = new Set(s.saved!);
  const newest = (a: Article, b: Article) => (b.publishedAt ?? b.retrievedAt).localeCompare(a.publishedAt ?? a.retrievedAt);
  // The window counts back from the latest report kept (never from the future), so a quiet spell does not empty the desk.
  const latest = Math.min(now, Math.max(0, ...s.articles!.map((a) => Date.parse(a.publishedAt ?? a.retrievedAt) || 0))), cutoff = latest - t.keepDays * 86400_000;
  const perFeed = new Map<string, number>();
  const kept = [...s.articles!].sort(newest).filter((a) => {
    if (saved.has(a.id)) return true;
    if (!names.has(a.source) || (Date.parse(a.publishedAt ?? a.retrievedAt) || now) < cutoff) return false;
    const n = perFeed.get(a.source) ?? 0; perFeed.set(a.source, n + 1); return n < t.perFeed;
  });
  s.articles = [...kept.filter((a) => saved.has(a.id)), ...kept.filter((a) => !saved.has(a.id)).slice(0, RECENT)].slice(0, MAX_ARTICLES).sort(newest);
  const ids = new Set(s.articles.map((a) => a.id));
  s.reads = s.reads!.filter((id) => ids.has(id));
}

// --- actions ---------------------------------------------------------------------

const payloadId = (value: unknown) => (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' ? (value as { id: string }).id : '');
const payloadText = (value: unknown, key: string) => (value && typeof value === 'object' ? line((value as Record<string, unknown>)[key], 80) : '');

/** Feeds from pasted OPML outlines; the enclosing outline's text becomes the category. */
export function opmlFeeds(text: string): Feed[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('OPML with DTD or entity declarations is not accepted');
  const out: Feed[] = [];
  let category = 'Imported';
  for (const tag of text.match(/<outline\b[^>]*>/gi) ?? []) {
    const attr = (k: string) => new RegExp(`\\b${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined);
    const name = attr('title') || attr('text') || '', url = attr('xmlUrl');
    if (!url) { if (name) category = name; continue; }
    try { out.push(feed({ name: name || new URL(url).hostname, category, url: url.replace(/&amp;/g, '&') })); } catch { /* skip an unusable outline */ }
  }
  if (!out.length) throw new Error('No HTTPS feeds found in that OPML');
  return out;
}

export async function handleAction(controlId: string, value: unknown, c: Context, action?: string) {
  const s = (c.state = normalize(c.state));
  const id = payloadId(value);
  let focusSurface: string | undefined;
  if (!action) {
    const draft = /^\/newFeed\/(name|category|url)$/.exec(controlId), filter = /^\/filters\/(category|window|source|sort)$/.exec(controlId);
    if (filter) (s.filters as unknown as Record<string, string>)[filter[1]!] = line(value, 80);
    else if (controlId === '/category') s.filters!.category = line(value, 40) || 'All';
    else if (draft) s.newFeed![draft[1] as 'name' | 'category' | 'url'] = line(value, draft[1] === 'url' ? 500 : 80);
    else if (controlId === '/topicDraft') s.topicDraft = line(value, 60);
    else if (controlId === '/opml') s.opml = String(value ?? '').slice(0, 60000);
    else if (controlId === '/images') s.images = value === true;
    else if (controlId === '/channel') s.channel = line(value, 90) || 'top';
    else if (controlId === '/muteDraft') s.muteDraft = line(value, 40);
    else if (/^\/tuning\/(halfLife|perSource|keepDays|perFeed|learn)$/.test(controlId)) (s.tuning as unknown as Record<string, unknown>)[controlId.slice(8)] = controlId === '/tuning/learn' ? value === true : Number(value);
    else if (/^\/tuning\/weights\/(fresh|coverage|topics|publisher|unseen)$/.test(controlId)) (s.tuning!.weights as unknown as Record<string, number>)[controlId.slice(16)] = Number(value);
    else throw new Error(`Unknown News Desk field: ${controlId}`);
    c.state = normalize(s);
    const current = ranked(c.state, Date.now());
    if (draft || controlId === '/opml') return { updates: [sourcesSurface(current)] };
    if (controlId === '/topicDraft') return { updates: [followingSurface(current)] };
    if (controlId === '/muteDraft') return { updates: [preferencesSurface(current)] };
    return { updates: view(c.state) };
  }
  switch (action) {
    case 'refresh': return refresh(c);
    case 'save_article': {
      if (!s.articles!.some((a) => a.id === id)) throw new Error('That article is no longer available');
      if (s.saved!.includes(id)) s.saved = s.saved!.filter((x) => x !== id);
      else { if (s.saved!.length >= MAX_SAVED) throw new Error(`Saved keeps up to ${MAX_SAVED} articles; remove some first`); s.saved!.unshift(id); }
      break;
    }
    case 'open_story':
      if (!s.articles!.some((a) => a.id === id)) throw new Error('That story is no longer available; refresh for current coverage');
      s.story = id; s.reads = [id, ...s.reads!.filter((x) => x !== id)].slice(0, 60); focusSurface = 'story'; break;
    case 'mark_seen': s.lastSeenAt = new Date().toISOString(); break;
    case 'follow': {
      const topic = payloadText(value, 'topic') || s.topicDraft!;
      if (!topic) throw new Error('Type a topic to follow, such as a name, company or place');
      if (!s.topics!.some((t) => t.toLowerCase() === topic.toLowerCase())) {
        if (s.topics!.length >= MAX_TOPICS) throw new Error(`Follow up to ${MAX_TOPICS} topics; unfollow one first`);
        s.topics!.push(topic);
      }
      s.topic = s.topics!.find((t) => t.toLowerCase() === topic.toLowerCase()); s.topicDraft = '';
      if (payloadText(value, 'topic')) focusSurface = 'following';
      break;
    }
    case 'unfollow': {
      const target = payloadText(value, 'topic');
      s.topics = s.topics!.filter((t) => t !== target);
      if (s.topic === target) s.topic = s.topics[0];
      break;
    }
    case 'show_topic': s.topic = payloadText(value, 'topic'); break;
    case 'source_weight': {
      const x = s.feeds!.find((y) => y.name === payloadText(value, 'source'));
      const weight = payloadText(value, 'weight');
      if (!x || !['prefer', 'normal', 'less'].includes(weight)) throw new Error('Source not found');
      if (weight === 'normal') delete x.weight; else x.weight = weight as Weight;
      break;
    }
    case 'toggle_feed': {
      const x = s.feeds!.find((y) => y.url === id);
      if (!x) throw new Error('Feed not found');
      if (x.enabled !== false && active(s).length <= 1) throw new Error('Keep at least one feed enabled');
      x.enabled = x.enabled === false;
      break;
    }
    case 'toggle_category': {
      const category = payloadText(value, 'category'), group = s.feeds!.filter((x) => x.category === category);
      if (!group.length) throw new Error('No feeds in that category');
      const on = !group.some((x) => x.enabled !== false);
      if (!on && active(s).length <= group.filter((x) => x.enabled !== false).length) throw new Error('Keep at least one feed enabled');
      for (const x of group) x.enabled = on;
      break;
    }
    case 'add_feed': {
      if (s.feeds!.length >= MAX_FEEDS) throw new Error(`News Desk keeps up to ${MAX_FEEDS} feeds; remove one first`);
      const x = feed(s.newFeed!);
      if (s.feeds!.some((y) => y.url === x.url)) throw new Error('That feed is already listed');
      s.feeds!.push(x); s.newFeed = { name: '', category: '', url: '' };
      break;
    }
    case 'import_opml': {
      const known = new Set(s.feeds!.map((x) => x.url)), fresh = opmlFeeds(s.opml!).filter((x) => !known.has(x.url));
      if (!fresh.length) throw new Error('Every feed in that OPML is already listed');
      if (s.feeds!.length + fresh.length > MAX_FEEDS) throw new Error(`That would make ${s.feeds!.length + fresh.length} feeds; News Desk keeps up to ${MAX_FEEDS}`);
      s.feeds!.push(...fresh); s.opml = '';
      break;
    }
    case 'remove_feed':
      if (s.feeds!.length <= 1) throw new Error('Keep at least one feed');
      s.feeds = s.feeds!.filter((x) => x.url !== id); delete s.health![id]; prune(s, Date.now());
      break;
    case 'restore_feeds': s.feeds = DEFAULT_FEEDS.map((x) => ({ ...x })); prune(s, Date.now()); break;
    case 'set_section': {
      const category = payloadText(value, 'category'), level = payloadText(value, 'level');
      if (!category) throw new Error('Section not found');
      if (LEVELS.has(level)) s.tuning!.sections[category] = level as Level; else delete s.tuning!.sections[category];
      break;
    }
    case 'mute': {
      const word = payloadText(value, 'word') || s.muteDraft!;
      if (!word) throw new Error('Type a word or name to mute');
      if (s.tuning!.mutes.length >= MAX_MUTES) throw new Error(`Mute up to ${MAX_MUTES} words; unmute one first`);
      if (!s.tuning!.mutes.some((m) => m.toLowerCase() === word.toLowerCase())) s.tuning!.mutes.push(word);
      s.muteDraft = '';
      break;
    }
    case 'unmute': s.tuning!.mutes = s.tuning!.mutes.filter((m) => m !== payloadText(value, 'word')); break;
    case 'forget': {
      const kind = payloadText(value, 'kind'), key = payloadText(value, 'key');
      const drop = (a: Stored | undefined) => !a || (kind === 'section' ? a.category === key : kind === 'source' ? a.source === key : true);
      s.reads = s.reads!.filter((rid) => !drop(s.articles!.find((a) => a.id === rid)));
      break;
    }
    case 'reset_tuning': s.tuning = { ...DEFAULT_TUNING, weights: { ...DEFAULT_WEIGHTS }, sections: {}, mutes: [] }; break;
    case 'clear_articles': s.articles = s.articles!.filter((a) => s.saved!.includes(a.id)); s.reads = []; s.story = undefined; break;
    case 'clear_filters': s.filters = { ...NO_FILTERS }; break;
    case 'open_section': s.filters = { ...NO_FILTERS, category: payloadText(value, 'category') || 'All' }; focusSurface = 'sections'; break;
    case 'apply': prune(s, Date.now()); break;
    default: throw new Error(`Unknown News Desk action: ${action}`);
  }
  return { updates: view(s), ...(focusSurface ? { focusSurface } : {}) };
}

// --- derived views -----------------------------------------------------------------

const escape = (t: string) => t.replace(/[\\`*_{}\[\]<>]/g, '\\$&');
const utc = (at: string | null | undefined) => (at ? `${at.slice(0, 10)} ${at.slice(11, 16)} UTC` : 'time unknown');
const ist = (at: string | undefined) => {
  const d = new Date(at ?? '');
  return Number.isFinite(d.getTime()) ? `${d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST` : '—';
};
const ago = (at: string | null | undefined, now: number) => {
  const t = Date.parse(at ?? ''); if (!Number.isFinite(t)) return 'time unknown';
  const m = Math.max(0, now - t) / 60000;
  return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const replaceAll = (value: Record<string, unknown>) => [{ op: 'replace' as const, path: '/' as const, value }];
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith('y') && !/[aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`}`;
const tally = (keys: string[]) => [...keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())].map(([label, articles]) => ({ label, articles }));
const when = (a: Article) => a.publishedAt ?? a.retrievedAt;

interface Ctx { s: State; now: number; stories: Story[]; isNew: (a: Stored) => boolean }
function ranked(s: State, now: number): Ctx {
  const isNew = (a: Stored) => !!(s.lastSeenAt && a.firstSeen && a.firstSeen > s.lastSeenAt);
  // Disabling a feed hides its stories; its saved articles stay under Saved.
  const prefs: Prefs = {
    topics: s.topics!, prefer: s.feeds!.filter((x) => x.weight === 'prefer').map((x) => x.name), less: s.feeds!.filter((x) => x.weight === 'less').map((x) => x.name),
    hidden: s.feeds!.filter((x) => x.enabled === false).map((x) => x.name), seen: new Set(s.articles!.filter((a) => !isNew(a)).map((a) => a.id)),
    weights: s.tuning!.weights, halfLife: s.tuning!.halfLife, sections: s.tuning!.sections, mutes: s.tuning!.mutes,
  };
  return { s, now, stories: rank(s.articles!, prefs, now), isNew };
}

/** What the person reads: sections and publishers of the stories they open and save, most recent first. */
function interests(s: State) {
  // Learning from reading is opt-in; saved articles are an explicit signal and always count.
  const seen = [...(s.tuning!.learn ? s.reads! : []), ...s.saved!].map((id) => s.articles!.find((a) => a.id === id)).filter((a): a is Stored => !!a);
  const count = (key: (a: Stored) => string) => seen.reduce((m, a) => m.set(key(a), (m.get(key(a)) ?? 0) + 1), new Map<string, number>());
  return { sections: count((a) => a.category), sources: count((a) => a.source), signals: seen.length };
}
/** Radio channels: the day's top stories, a personal mix, any section, any followed topic. */
export function channels(c: Ctx): { label: string; value: string }[] {
  const sections = [...new Set(c.stories.map((st) => st.category))].sort();
  return [{ label: 'Top stories', value: 'top' }, { label: 'For you', value: 'foryou' },
    ...sections.map((x) => ({ label: x, value: `section:${x}` })), ...c.s.topics!.map((t) => ({ label: `Topic: ${t}`, value: `topic:${t}` }))];
}
/** The stories a channel plays, and its spoken name. For you adds the person's reading habits to the ranking. */
export function channelStories(c: Ctx, channel: string): { name: string; stories: Story[] } {
  if (channel.startsWith('section:')) { const x = channel.slice(8); return { name: x, stories: c.stories.filter((st) => st.category === x) }; }
  if (channel.startsWith('topic:')) { const t = channel.slice(6); return { name: t, stories: c.stories.filter((st) => st.topics.includes(t)) }; }
  if (channel === 'foryou') {
    const i = interests(c.s), total = Math.max(1, i.signals);
    const boost = (st: Story) => 2 * Math.min(st.topics.length, 2) + 2 * ((i.sections.get(st.category) ?? 0) / total) + st.sources.reduce((a, x) => a + (i.sources.get(x) ?? 0), 0) / total;
    const mine = c.stories.filter((st) => boost(st) > 0).sort((a, b) => b.score + boost(b) - (a.score + boost(a)));
    return { name: 'For you', stories: mine.length >= 3 ? mine : diverse(c.stories, 27, c.s.tuning!.perSource) };
  }
  return { name: '', stories: diverse(c.stories, 27, c.s.tuning!.perSource) };
}

/** A story as a card record: lead headline, its publisher, why it ranks, and the actions it supports. */
function storyCard(c: Ctx, st: Story) {
  const lead = st.lead, others = st.articles.length - 1, saved = c.s.saved!.includes(lead.id);
  const fresh = st.articles.some(c.isNew);
  // The card says each fact once: publisher count in the byline, report count on the coverage button.
  const reasons = st.why.filter((w) => w !== 'Single publisher').map(escape);
  return {
    id: lead.id, title: lead.title,
    meta: `${lead.source} · ${ago(when(lead), c.now)}`,
    body: `[Read at ${escape(lead.source)}](${lead.url})`,
    byline: `[${escape(lead.source)}](${lead.url}) · ${reasons.join(' · ')}`,
    why: st.why.map(escape).join(' · '),
    image: c.s.images && st.image ? st.image : '',
    badge: fresh ? 'New' : st.category,
    tone: 'neutral',
    coverageLabel: others ? `Full coverage · ${st.articles.length}` : 'Details',
    saveLabel: saved ? 'Saved' : 'Save',
  };
}
const storyNodes = (prefix: string): Node[] => [
  { id: `${prefix}-card`, type: 'card', props: { title: '{title}', image: '{image}', imageLayout: 'thumbnail', titleLines: 2, badge: '{badge}', tone: '{tone}' }, children: [`${prefix}-why`, `${prefix}-actions`] },
  { id: `${prefix}-why`, type: 'text', props: { content: '{byline}', variant: 'caption' } },
  { id: `${prefix}-actions`, type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: [`${prefix}-open`, `${prefix}-save`] },
  { id: `${prefix}-open`, type: 'button', props: { label: '{coverageLabel}', action: 'open_story', payload: { id: '{id}' }, style: 'secondary' } },
  { id: `${prefix}-save`, type: 'button', props: { label: '{saveLabel}', action: 'save_article', payload: { id: '{id}' }, style: 'link' } },
];

export function view(input: State, now = Date.now()): Update[] {
  const s = normalize(input), c = ranked(s, now);
  return [topSurface(c), sectionsSurface(c), storySurface(c), followingSurface(c), savedSurface(c), sourcesSurface(c), preferencesSurface(c)];
}

function statusLine(c: Ctx) {
  const s = c.s, fresh = s.articles!.filter(c.isNew).length;
  return [`${plural(c.stories.length, 'story')} · ${plural(new Set(s.articles!.map((a) => a.source)).size, 'publisher')}`, fresh ? `${fresh} new` : '', s.checkedAt ? `updated ${ist(s.checkedAt)}` : ''].filter(Boolean).join(' · ');
}
/** Detail and operations panels render only the selected tab; empty panels are left out. */
function tabbed(id: string, panels: [string, string[]][]): Node[] {
  const live = panels.filter(([, children]) => children.length);
  const pid = (title: string) => `${id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return live.length ? [{ id, type: 'tabs', children: live.map(([t]) => pid(t)) }, ...live.map(([t, children]) => ({ id: pid(t), type: 'section', props: { title: t }, children }))] : [];
}
const problemNode = (id: string): Node => ({ id, type: 'alert', props: { title: 'Refresh notice', body: '{/problem}', tone: 'warning' } });

/** Section links use the same action and counts everywhere, including the front page. */
function sectionLinks(id: string): Node[] {
  return [
    { id, type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: { each: '/chips', template: `${id}-chip` } },
    { id: `${id}-chip`, type: 'button', props: { label: '{label}', action: 'open_section', payload: { category: '{value}' }, style: '{style}' } },
  ];
}
const sectionChips = (c: Ctx) => [...new Set([...active(c.s).map((x) => x.category), ...c.stories.map((st) => st.category)])].sort()
  .map((category) => ({ value: category, label: `${category} · ${c.stories.filter((st) => st.category === category).length}`, style: 'secondary' }));

function topSurface(c: Ctx): Update {
  const s = c.s, has = c.stories.length > 0;
  const top = diverse(c.stories, 28, c.s.tuning!.perSource), lead = top.slice(0, 4), more = top.slice(4);
  const forYou = s.topics!.length ? c.stories.filter((st) => st.topics.length && !lead.includes(st)) : [];
  const sections = [...new Set(c.stories.map((st) => st.category))].sort().map((category) => ({ category, stories: c.stories.filter((st) => st.category === category) }));
  // Routine feed rotation is progress, not a failure. The full message is retained.
  // Reading the news never shows feed diagnostics: failures and rotation live under Sources → Health,
  // and the front page carries one quiet link when a feed needs attention. Only setup problems that
  // leave the desk empty are shown here.
  const failing = active(s).filter((x) => (s.health![x.url]?.failures ?? 0) > 0).length;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['top-heading', 'top-status', ...(has ? ['lead-grid', 'top-sections', 'top-lower'] : [...(s.problem ? ['top-problem'] : []), 'top-empty'])] },
    { id: 'top-heading', type: 'text', props: { content: 'Top stories', variant: 'heading' } },
    { id: 'top-status', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'center' }, children: ['top-line', ...(has && failing ? ['top-attention'] : []), ...(has ? ['top-seen'] : [])] },
    { id: 'top-line', type: 'text', props: { content: '{/line}', variant: 'caption' } },
    ...(s.problem && !has ? [problemNode('top-problem')] : []),
    ...(has && failing ? [{ id: 'top-attention', type: 'button', props: { label: failing === 1 ? '1 feed needs attention' : `${failing} feeds need attention`, action: 'view.open', payload: { surface: 'sources' }, style: 'link' } } as Node] : []),
    ...(has ? [
      { id: 'top-seen', type: 'button', props: { label: 'Mark all seen', action: 'mark_seen', style: 'link' } },
      ...sectionLinks('top-sections'),
      { id: 'lead-grid', type: 'grid', props: { columns: 2, minItemWidth: 'lg', gap: 'sm' }, children: { each: '/lead', template: 'lead-card' } } as Node, ...storyNodes('lead'),
      { id: 'top-lower', type: more.length || forYou.length ? 'split' : 'stack', props: { ...(more.length || forYou.length ? { ratio: '2:1' } : {}), gap: 'md' }, children: [...(more.length || forYou.length ? ['top-feed'] : []), 'digest-section'] },
      ...(more.length || forYou.length ? [{ id: 'top-feed', type: 'stack', props: { gap: 'md' }, children: [...(more.length ? ['more-section'] : []), ...(forYou.length ? ['for-you'] : [])] }] : []),
      ...(more.length ? [
        { id: 'more-section', type: 'section', props: { title: 'More headlines', description: 'Ranked by freshness, coverage and your preferences. Browse every story in Sections.' }, children: ['more-grid'] },
        { id: 'more-grid', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'sm', searchable: true, pageSize: 6 }, children: { each: '/more', template: 'more-card' } } as Node, ...storyNodes('more'),
      ] : []),
      ...(forYou.length ? [
        { id: 'for-you', type: 'section', props: { title: 'For you', description: 'Matching the topics you follow.' }, children: ['for-you-grid'] },
        { id: 'for-you-grid', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'sm', searchable: true, pageSize: 6 }, children: { each: '/forYou', template: 'fy-card' } } as Node, ...storyNodes('fy'),
      ] : []),
      { id: 'digest-section', type: 'section', props: { title: 'Across sections' }, children: ['digest'] },
      { id: 'digest', type: 'grid', props: { columns: 1, gap: 'sm', pageSize: 3, searchable: false }, children: { each: '/digest', template: 'digest-card' } },
      { id: 'digest-card', type: 'card', props: { title: '{category}', subtitle: '{meta}' }, children: ['digest-first', 'digest-second', 'digest-open'] },
      { id: 'digest-first', type: 'text', props: { content: '{first}' } },
      { id: 'digest-second', type: 'text', props: { content: '{second}', variant: 'caption', visibleIf: '{second}' } },
      { id: 'digest-open', type: 'button', props: { label: '{openLabel}', action: 'open_section', payload: { category: '{category}' }, style: 'link' } },
    ] : [
      { id: 'top-empty', type: 'card', props: { title: 'Your news starts here', body: '{/emptyHint}' }, children: ['top-sources'] },
      { id: 'top-sources', type: 'button', props: { label: 'Review feeds', action: 'view.open', payload: { surface: 'sources' }, style: 'secondary' } },
    ]),
  ];
  const headline = (st: Story | undefined) => st ? `[${escape(st.lead.title)}](${st.lead.url}) — ${escape(st.lead.source)}` : '';
  const data = {
    line: has ? statusLine(c) : `${plural(active(s).length, 'active feed')} configured`, channel: s.channel, channelOptions: channels(c),
    ...(s.problem ? { problem: s.problem } : {}),
    ...(has ? {
      lead: lead.map((st) => storyCard(c, st)), forYou: forYou.map((st) => storyCard(c, st)), more: more.map((st) => storyCard(c, st)), chips: sectionChips(c),
      digest: sections.map((x) => ({ category: x.category, meta: plural(x.stories.length, 'story'), first: headline(x.stories[0]), second: headline(x.stories[1]), openLabel: `All ${x.category} stories →` })),
      spoken: { bulletin: ((ch) => programme(ch.stories, c.stories, s.topics!, { now: c.now }, ch.name, s.images !== false))(channelStories(c, s.channel!)) },
    } : { emptyHint: `${SETUP} Then press refresh in the header to read your ${plural(active(s).length, 'active feed')}.` }),
  };
  return { surface: 'top', nodes, data: replaceAll(data) };
}

function sectionsSurface(c: Ctx): Update {
  const s = c.s, fl = s.filters!;
  const categories = [...new Set([...s.feeds!.filter((x) => x.enabled !== false).map((x) => x.category), ...c.stories.map((st) => st.category)])].sort();
  const sources = [...new Set(s.articles!.map((a) => a.source))].sort();
  const hours = WINDOWS[fl.window]!, inWindow = (st: Story) => hours === Infinity || c.now - Date.parse(st.newest) <= hours * 3600_000;
  let list = c.stories.filter((st) => (fl.category === 'All' || st.category === fl.category) && (fl.source === 'All' || st.sources.includes(fl.source)) && inWindow(st));
  if (fl.sort === 'newest') list = [...list].sort((a, b) => b.newest.localeCompare(a.newest));
  const leads = list.slice(0, 4), rest = list.slice(4);
  const filtered = !list.length || fl.category !== 'All' || fl.source !== 'All' || fl.window !== NO_FILTERS.window || fl.sort !== 'relevance';
  const name = fl.category === 'All' ? 'All sections' : fl.category;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['sec-heading', 'filters', ...(list.length ? ['sec-leads', ...(rest.length ? ['sec-more'] : [])] : ['sec-none'])] },
    { id: 'sec-heading', type: 'text', props: { content: '{/heading}', variant: 'heading' } },
    { id: 'filters', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end', maxWidth: 'lg' }, children: ['f-category', 'f-window', 'f-source', 'f-sort', ...(filtered ? ['f-clear'] : [])] },
    { id: 'f-category', type: 'select', props: { label: 'Section', bind: '/filters/category', options: '{/categoryOptions}', presentation: 'dropdown' } },
    { id: 'f-window', type: 'select', props: { label: 'Published', presentation: 'dropdown', bind: '/filters/window', options: [{ label: 'Last 24 hours', value: '24h' }, { label: 'Last 3 days', value: '72h' }, { label: 'Last week', value: '7d' }, { label: 'Any time', value: 'all' }] } },
    { id: 'f-source', type: 'select', props: { label: 'Publisher', presentation: 'dropdown', bind: '/filters/source', options: '{/sourceOptions}' } },
    { id: 'f-sort', type: 'select', props: { label: 'Order', presentation: 'dropdown', bind: '/filters/sort', options: [{ label: 'Relevance', value: 'relevance' }, { label: 'Newest', value: 'newest' }] } },
    ...(filtered ? [{ id: 'f-clear', type: 'button', props: { label: 'Reset filters', action: 'clear_filters', style: 'link' } }] : []),
    ...(list.length ? [
      { id: 'sec-leads', type: 'section', props: { title: '{/line}' }, children: ['sec-lead-grid'] },
      { id: 'sec-lead-grid', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm' }, children: { each: '/leads', template: 'secl-card' } } as Node, ...storyNodes('secl'),
      ...(rest.length ? [
        { id: 'sec-more', type: 'section', props: { title: '{/moreTitle}' }, children: ['sec-grid'] },
        { id: 'sec-grid', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm', searchable: true, pageSize: 12 }, children: { each: '/stories', template: 'sec-card' } } as Node, ...storyNodes('sec'),
      ] : []),
    ] : [{ id: 'sec-none', type: 'text', props: { content: '{/none}', variant: 'caption' } }]),
  ];
  const count = (x: string) => c.stories.filter((st) => (x === 'All' || st.category === x) && inWindow(st)).length;
  const data = {
    heading: 'Sections', filters: fl, sourceOptions: [{ label: 'All publishers', value: 'All' }, ...sources.map((value) => ({ label: value, value }))],
    categoryOptions: ['All', ...categories].map((x) => ({ value: x, label: `${x === 'All' ? 'All sections' : x} · ${count(x)}` })),
    ...(list.length ? {
      moreTitle: `More in ${name.toLowerCase() === 'all sections' ? 'all sections' : name}`,
      line: `${plural(list.length, 'story')}${fl.source !== 'All' ? ` from ${fl.source}` : ''}, ${fl.sort === 'newest' ? 'newest first' : 'most relevant first'}.`,
      leads: leads.map((st) => storyCard(c, st)), ...(rest.length ? { stories: rest.map((st) => storyCard(c, st)) } : {}),
    } : { none: c.stories.length ? 'No stories match. Widen the time window or clear filters.' : `Nothing read yet. ${SETUP}` }),
  };
  return { surface: 'sections', nodes, data: replaceAll(data) };
}

function storySurface(c: Ctx): Update {
  const s = c.s;
  // A bookmark remains readable even after its publisher is disabled.
  const selected = s.articles!.find((a) => a.id === s.story);
  const st = selected ? c.stories.find((x) => x.articles.some((a) => a.id === selected.id)) ?? rank([selected], { topics: s.topics!, prefer: [], less: [], hidden: [], seen: new Set() }, c.now)[0] : undefined;
  if (!st) {
    const nodes: Node[] = [{ id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['story-empty'] }, { id: 'story-empty', type: 'card', props: { title: 'Explore a story', body: 'Open Details or Full coverage on a headline to compare publisher reports, publication times and related stories.' }, children: ['story-browse'] }, { id: 'story-browse', type: 'button', props: { label: 'Browse top stories', action: 'view.open', payload: { surface: 'top' }, style: 'secondary' } }];
    return { surface: 'story', nodes, data: replaceAll({}) };
  }
  const related = c.stories.filter((x) => x !== st && (x.topics.some((t) => st.topics.includes(t)) || x.category === st.category)).slice(0, 6);
  const leadSource = s.feeds!.find((x) => x.name === st.lead.source);
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['story-nav', 'story-heading', 'story-split', 'story-tabs'] },
    ...tabbed('story-tabs', [['Every report', ['story-articles-section']], ['Timeline', ['story-timeline']], ['Related', related.length ? ['related-section'] : []]]),
    { id: 'story-nav', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: ['story-back', 'story-section'] },
    { id: 'story-back', type: 'button', props: { label: '← Top stories', action: 'view.open', payload: { surface: 'top' }, style: 'link' } },
    { id: 'story-section', type: 'button', props: { label: `More in ${st.category} →`, action: 'open_section', payload: { category: st.category }, style: 'link' } },
    { id: 'story-heading', type: 'text', props: { content: '{/heading}', variant: 'heading' } },
    { id: 'story-split', type: 'split', props: { ratio: '1:2', gap: 'md' }, children: ['story-lead', 'story-facts'] },
    { id: 'story-lead', type: 'card', props: { subtitle: '{/lead/meta}', image: '{/lead/image}', badge: '{/lead/badge}', maxWidth: 'sm' } },
    { id: 'story-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: ['story-listen', 'story-save', ...(leadSource ? ['story-prefer', 'story-less'] : [])] },
    { id: 'story-listen', type: 'button', props: { label: 'Listen to this story', action: 'voice.read', payload: { text: '/spoken/story' }, style: 'primary' } },
    { id: 'story-save', type: 'button', props: { label: '{/lead/saveLabel}', action: 'save_article', payload: { id: '{/lead/id}' }, style: 'secondary' } },
    ...(leadSource ? [
      { id: 'story-prefer', type: 'button', props: { label: '{/preferLabel}', action: 'source_weight', payload: { source: st.lead.source, weight: leadSource.weight === 'prefer' ? 'normal' : 'prefer' }, style: 'link' } },
      { id: 'story-less', type: 'button', props: { label: '{/lessLabel}', action: 'source_weight', payload: { source: st.lead.source, weight: leadSource.weight === 'less' ? 'normal' : 'less' }, style: 'link' } },
    ] : []),
    { id: 'story-facts', type: 'stack', props: { gap: 'sm' }, children: ['story-summary', 'story-stats', 'story-why', 'story-score', 'story-actions'] },
    { id: 'story-summary', type: 'text', props: { content: '{/summary}' } },
    { id: 'story-why', type: 'text', props: { content: '{/lead/why}', variant: 'caption' } },
    { id: 'story-score', type: 'text', props: { content: '{/score}', variant: 'caption' } },
    { id: 'story-stats', type: 'grid', props: { columns: 4, gap: 'sm' }, children: ['st-sources', 'st-reports', 'st-first', 'st-latest'] },
    { id: 'st-sources', type: 'stat', props: { label: 'Publishers', value: '{/stats/sources}' } },
    { id: 'st-reports', type: 'stat', props: { label: 'Reports', value: '{/stats/reports}' } },
    { id: 'st-first', type: 'stat', props: { label: 'Earliest saved', value: '{/stats/first}' } },
    { id: 'st-latest', type: 'stat', props: { label: 'Latest', value: '{/stats/latest}' } },
    { id: 'story-timeline', type: 'timeline', props: { events: '{/timeline}' } },
    { id: 'story-articles-section', type: 'section', props: { description: 'Grouped by shared headline words within two days; each report keeps its own link and time.' }, children: ['story-articles'] },
    { id: 'story-articles', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm', searchable: true, pageSize: 6 }, children: { each: '/articles', template: 'report-card' } },
    { id: 'report-card', type: 'card', props: { title: '{title}', subtitle: '{meta}', body: '{body}', image: '{image}', imageLayout: 'thumbnail', titleLines: 2 }, children: ['report-save'] },
    { id: 'report-save', type: 'button', props: { label: '{saveLabel}', action: 'save_article', payload: { id: '{id}' }, style: 'link' } },
    ...(related.length ? [
      { id: 'related-section', type: 'section', props: { title: 'Keep reading' }, children: ['related-grid'] },
      { id: 'related-grid', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm' }, children: { each: '/related', template: 'rel-card' } } as Node, ...storyNodes('rel'),
    ] : []),
  ];
  const ordered = [...st.articles].sort((a, b) => when(a).localeCompare(when(b)));
  const data = {
    heading: escape(st.lead.title), lead: storyCard(c, st), summary: `${escape(st.lead.excerpt || st.lead.title)}\n\n[Read at ${escape(st.lead.source)}](${st.lead.url})`, spoken: { story: storyReport(st, { now: c.now }) },
    preferLabel: leadSource?.weight === 'prefer' ? `Stop preferring ${st.lead.source}` : `More from ${st.lead.source}`,
    lessLabel: leadSource?.weight === 'less' ? `Show ${st.lead.source} normally` : `Fewer from ${st.lead.source}`,
    score: `Score ${st.score.toFixed(2)} = ${st.parts.map((x) => `${x.label} ${x.value > 0 ? '+' : ''}${x.value}`).join(' · ')}. Change the weights in Preferences.`,
    stats: { sources: String(st.publishers), reports: String(st.articles.length), first: ago(when(ordered[0]!), c.now), latest: ago(when(ordered.at(-1)!), c.now) },
    timeline: ordered.map((a) => ({ title: a.source, date: when(a).slice(0, 10), note: `${utc(when(a)).slice(11)} · ${a.title}` })),
    articles: st.articles.map((a) => ({
      id: a.id, title: a.title, meta: `${a.source} · ${ago(when(a), c.now)}${a.author ? ` · ${a.author}` : ''}`, image: s.images && a.image ? a.image : '',
      body: `${a.excerpt ? `${escape(a.excerpt)}\n\n` : ''}[Read at ${escape(a.source)}](${a.url})`, saveLabel: s.saved!.includes(a.id) ? 'Saved' : 'Save',
    })),
    ...(related.length ? { related: related.map((x) => storyCard(c, x)) } : {}),
  };
  return { surface: 'story', nodes, data: replaceAll(data) };
}

function followingSurface(c: Ctx): Update {
  const s = c.s, topics = s.topics!, selected = s.topic;
  const count = (t: string) => c.stories.filter((st) => st.topics.includes(t));
  const shown = selected ? count(selected) : [];
  const suggestions = discoverTopics(s.articles!, topics, s.feeds!.map((x) => x.category));
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['follow-heading', 'follow-bar', ...(topics.length ? ['topic-chips', 'topic-stories'] : ['follow-empty']), ...(suggestions.length ? ['suggest-section'] : [])] },
    { id: 'follow-heading', type: 'text', props: { content: 'Following', variant: 'heading' } },
    { id: 'follow-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end', maxWidth: 'md' }, children: ['topic-input', 'topic-add'] },
    { id: 'topic-input', type: 'input', props: { label: 'Follow a topic', bind: '/topicDraft', placeholder: 'A person, company, place or subject' } },
    { id: 'topic-add', type: 'button', props: { label: 'Follow topic', action: 'follow', style: 'primary' } },
    ...(topics.length ? [
      { id: 'topic-chips', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: { each: '/topics', template: 'topic-chip' } },
      { id: 'topic-chip', type: 'button', props: { label: '{chip}', action: 'show_topic', payload: { topic: '{label}' }, style: '{style}' } },
      { id: 'topic-stories', type: 'section', props: { title: '{/selectedTitle}', description: 'Matching publisher headlines, excerpts and tags.' }, children: ['topic-remove', shown.length ? 'topic-grid' : 'topic-none'] },
      { id: 'topic-remove', type: 'button', props: { label: `Unfollow ${selected}`, action: 'unfollow', payload: { topic: selected }, style: 'link' } },
      ...(shown.length ? [{ id: 'topic-grid', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm', searchable: true, pageSize: 12 }, children: { each: '/stories', template: 'tp-card' } } as Node, ...storyNodes('tp')]
        : [{ id: 'topic-none', type: 'text', props: { content: 'No stories match yet. New matches appear after refresh.', variant: 'caption' } }]),
    ] : [{ id: 'follow-empty', type: 'card', props: { title: 'Make room for your interests', body: 'Follow a topic above. Matching stories gather here and rank higher in Top stories.' } }]),
    ...(suggestions.length ? [
      { id: 'suggest-section', type: 'section', props: { title: 'Discover topics', description: 'Trending across headlines, story clusters and publisher tags.' }, children: ['suggest'] },
      { id: 'suggest', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: { each: '/suggestions', template: 'suggest-chip' } } as Node,
      { id: 'suggest-chip', type: 'button', props: { label: '{chip}', action: 'follow', payload: { topic: '{label}' }, style: 'secondary' } },
    ] : []),
  ];
  const data = {
    topicDraft: s.topicDraft,
    ...(suggestions.length ? { suggestions: suggestions.map((x) => ({ label: x.label, chip: `+ ${x.label} (${x.articles})` })) } : {}),
    ...(topics.length ? {
      topics: topics.map((t) => ({ label: t, chip: `${t} · ${count(t).length}`, style: t === selected ? 'primary' : 'secondary' })),
      selectedTitle: `${selected} · ${plural(shown.length, 'story')}`,
      ...(shown.length ? { stories: shown.map((st) => storyCard(c, st)) } : {}),
    } : {}),
  };
  return { surface: 'following', nodes, data: replaceAll(data) };
}

function savedSurface(c: Ctx): Update {
  const s = c.s, saved = s.saved!.map((id) => s.articles!.find((a) => a.id === id)!).filter(Boolean);
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['saved-heading', saved.length ? 'saved-line' : 'saved-empty', ...(saved.length ? ['saved'] : [])] },
    { id: 'saved-heading', type: 'text', props: { content: 'Saved', variant: 'heading' } },
    ...(saved.length ? [
      { id: 'saved-line', type: 'text', props: { content: '{/line}', variant: 'caption' } },
      { id: 'saved', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm', searchable: true, pageSize: 12 }, children: { each: '/saved', template: 'saved-card' } },
      { id: 'saved-card', type: 'card', props: { title: '{title}', subtitle: '{meta}', body: '{body}', image: '{image}', imageLayout: 'thumbnail', titleLines: 2 }, children: ['saved-actions'] },
      { id: 'saved-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: ['saved-open', 'saved-remove'] },
      { id: 'saved-open', type: 'button', props: { label: 'Full coverage', action: 'open_story', payload: { id: '{id}' }, style: 'secondary' } },
      { id: 'saved-remove', type: 'button', props: { label: 'Remove', action: 'save_article', payload: { id: '{id}' }, style: 'link' } },
    ] : [{ id: 'saved-empty', type: 'card', props: { title: 'A reading list worth keeping', body: 'Save a story to find it here, even after it leaves the feeds.' }, children: ['saved-browse'] }, { id: 'saved-browse', type: 'button', props: { label: 'Find a story to save', action: 'view.open', payload: { surface: 'top' }, style: 'secondary' } }]),
  ];
  const data = saved.length ? {
    line: `${plural(saved.length, 'saved article')}. Your reading list, kept on this device. Open a publisher link for the full report.`,
    saved: saved.map((a) => ({ id: a.id, title: a.title, meta: `${a.source} · ${a.category} · ${utc(when(a))}`, image: s.images && a.image ? a.image : '', body: `[Read at ${escape(a.source)}](${a.url})` })),
  } : {};
  return { surface: 'saved', nodes, data: replaceAll(data) };
}

const tallyBy = (xs: Stored[], key: (a: Stored) => string) => xs.reduce((m, a) => m.set(key(a), (m.get(key(a)) ?? 0) + 1), new Map<string, number>());
/** The publisher's own site icon, from the site its articles link to (feeds often live on a separate host). */
const siteIcon = (x: Feed, all: Stored[]) => {
  try { return `https://${new URL(all.find((a) => a.source === x.name)?.url ?? x.url).hostname}/favicon.ico`; } catch { return ''; }
};
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
/** What a reader can expect from a feed, measured on its latest read. */
function quality(x: Feed, h: Health, all: Stored[]) {
  const mine = all.filter((a) => a.source === x.name), notes = [];
  if (h.items && !h.images) notes.push('no images');
  if (mine.length && !mine.some((a) => a.excerpt)) notes.push('headlines only');
  if (mine.length && !mine.some((a) => a.publishedAt)) notes.push('no publish times');
  return notes.length ? ` · ${notes.join(', ')}` : '';
}

/** Every ranking, interest and retention choice, with the rule it changes stated beside it. */
function preferencesSurface(c: Ctx): Update {
  const s = c.s, t = s.tuning!, opened = s.reads!.flatMap((id) => s.articles!.find((a) => a.id === id) ?? []), dated = s.articles!.map((a) => a.publishedAt ?? a.retrievedAt).sort();
  const categories = [...new Set([...s.feeds!.map((x) => x.category), ...Object.keys(t.sections)])].sort();
  const scale = [0, 0.5, 1, 1.5, 2, 3, 4, 5].map((v) => ({ label: String(v), value: v }));
  const weight = (key: keyof Weights, label: string) => ({ id: `w-${key}`, type: 'select', props: { label, presentation: 'dropdown', bind: `/tuning/weights/${key}`, options: scale } });
  const mutedToday = (m: string) => s.articles!.filter((a) => rank([a], { topics: [], prefer: [], less: [], hidden: [], seen: new Set(), mutes: [m] }, c.now).length === 0).length;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['pref-heading', 'pref-intro', 'pref-tabs'] },
    { id: 'pref-heading', type: 'text', props: { content: 'Preferences', variant: 'heading' } },
    { id: 'pref-intro', type: 'text', props: { content: 'News Desk ranks with fixed, visible rules and no model. Every choice here says what it changes; open any story to see its score broken down.', variant: 'caption' } },
    ...tabbed('pref-tabs', [['Interests', ['int-sections', 'int-mutes']], ['Ranking', ['rank-section']], ['Learning', ['learn-section']], ['Keeping', ['keep-section']]]),
    { id: 'int-sections', type: 'section', props: { title: 'Sections', description: 'More adds 1.5 to every story in a section, Less subtracts 1.5, Off hides the section everywhere. Followed topics live under Following.' }, children: ['sec-list'] },
    { id: 'sec-list', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'sm' }, children: { each: '/sections', template: 'sec-row' } },
    { id: 'sec-row', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'center' }, children: ['sec-name', 'sec-more', 'sec-normal', 'sec-less', 'sec-off'] },
    { id: 'sec-name', type: 'text', props: { content: '{category}' } },
    ...(['more', 'normal', 'less', 'off'] as const).map((level) => ({ id: `sec-${level}`, type: 'button', props: { label: level[0]!.toUpperCase() + level.slice(1), action: 'set_section', payload: { category: '{category}', level }, style: `{${level}Style}` } })),
    { id: 'int-mutes', type: 'section', props: { title: 'Muted words', description: 'A story is hidden when its headline or publisher tags contain every word of a muted entry.' }, children: ['mute-add', 'mute-list'] },
    { id: 'mute-add', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['mute-input', 'mute-button'] },
    { id: 'mute-input', type: 'input', props: { label: 'Word or name', bind: '/muteDraft', placeholder: 'IPL' } },
    { id: 'mute-button', type: 'button', props: { label: 'Mute', action: 'mute', style: 'secondary' } },
    { id: 'mute-list', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: { each: '/mutes', template: 'mute-chip' } },
    { id: 'mute-chip', type: 'button', props: { label: '{label}', action: 'unmute', payload: { word: '{word}' }, style: 'secondary' } },
    { id: 'rank-section', type: 'section', props: { title: 'How stories are ranked', description: '{/rule}' }, children: ['weights', 'rank-more', 'pref-preview', 'rank-reset'] },
    { id: 'weights', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm' }, children: ['w-fresh', 'w-coverage', 'w-topics', 'w-publisher', 'w-unseen'] },
    weight('fresh', 'Freshness'), weight('coverage', 'Coverage'), weight('topics', 'Followed topics'), weight('publisher', 'Publisher preference'), weight('unseen', 'Unseen'),
    { id: 'rank-more', type: 'grid', props: { columns: 2, minItemWidth: 'sm', gap: 'sm' }, children: ['half-life', 'per-source'] },
    { id: 'half-life', type: 'select', props: { label: 'Freshness halves every', presentation: 'dropdown', bind: '/tuning/halfLife', options: HALF_LIVES.map((h) => ({ label: `${h} hours`, value: h })) } },
    { id: 'per-source', type: 'select', props: { label: 'Most top stories from one publisher', presentation: 'dropdown', bind: '/tuning/perSource', options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: n })) } },
    { id: 'pref-preview', type: 'text', props: { content: '{/preview}', variant: 'caption' } },
    { id: 'rank-reset', type: 'button', props: { label: 'Reset ranking and interests to defaults', action: 'reset_tuning', style: 'link' } },
    { id: 'learn-section', type: 'section', props: { title: 'Learning from your reading', description: 'Off by default. When on, the For you channel adds weight to the sections and publishers of stories you open. Saved articles always count. Nothing leaves this app.' }, children: ['learn-toggle', 'learned', 'learn-forget'] },
    { id: 'learn-toggle', type: 'checkbox', props: { label: 'Learn from stories I open', bind: '/tuning/learn' } },
    { id: 'learned', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: { each: '/learned', template: 'learned-chip' } },
    { id: 'learned-chip', type: 'button', props: { label: '{label}', action: 'forget', payload: { kind: '{kind}', key: '{key}' }, style: 'secondary' } },
    { id: 'learn-forget', type: 'button', props: { label: 'Forget all reading history', action: 'forget', payload: { kind: 'all', key: 'all' }, style: 'link' } },
    { id: 'keep-section', type: 'section', props: { title: 'Keeping articles', description: '{/keepLine}' }, children: ['keep-grid', 'keep-clear'] },
    { id: 'keep-grid', type: 'grid', props: { columns: 2, minItemWidth: 'sm', gap: 'sm' }, children: ['keep-days', 'keep-feed'] },
    { id: 'keep-days', type: 'select', props: { label: 'Keep articles for', presentation: 'dropdown', bind: '/tuning/keepDays', options: KEEP_DAYS.map((d) => ({ label: d === 1 ? '1 day' : `${d} days`, value: d })) } },
    { id: 'keep-feed', type: 'select', props: { label: 'Newest articles kept per feed', presentation: 'dropdown', bind: '/tuning/perFeed', options: [10, 20, 40, 60].map((n) => ({ label: String(n), value: n })) } },
    { id: 'keep-clear', type: 'button', props: { label: 'Clear all articles (saved ones stay)', action: 'clear_articles', style: 'link' } },
  ];
  const W = t.weights, style = (on: boolean) => (on ? 'primary' : 'secondary');
  const data = {
    tuning: t, muteDraft: s.muteDraft,
    sections: categories.map((category) => { const level = t.sections[category] ?? 'normal'; return { category, moreStyle: style(level === 'more'), normalStyle: style(level === 'normal'), lessStyle: style(level === 'less'), offStyle: style(level === 'off') }; }),
    mutes: t.mutes.map((word) => ({ word, label: `${word} · ${mutedToday(word)} hidden ×` })),
    rule: `Score = Freshness ${W.fresh} × (halves every ${t.halfLife} h) + Coverage ${W.coverage} × log₂(1 + independent publishers) + Followed topics ${W.topics} × matches (up to 2) + Publisher preference ${W.publisher} × (+1 preferred, −1 shown less) + section interest ± 1.5 + 0.2 with an image + Unseen ${W.unseen}. Syndicated copies and several feeds from one site count as one publisher.`,
    preview: c.stories.length ? `Top stories now lead with: ${diverse(c.stories, 3, t.perSource).map((st) => `${escape(st.lead.title)} (${st.score.toFixed(1)})`).join(' · ')}` : 'Refresh to preview the ranking.',
    learned: t.learn ? [...tallyBy(opened, (a) => a.category)].map(([key, n]) => ({ kind: 'section', key, label: `${key} · ${n} opened ×` }))
      .concat([...tallyBy(opened, (a) => a.source)].map(([key, n]) => ({ kind: 'source', key, label: `${key} · ${n} opened ×` }))) : [],
    keepLine: `${plural(s.articles!.length, 'article')} kept${dated.length ? `, oldest ${ist(dated[0])}` : ''}. Saved articles are always kept. Older or surplus articles are dropped on the next refresh or Apply.`,
  };
  return { surface: 'preferences', nodes, data: replaceAll(data) };
}

function sourcesSurface(c: Ctx): Update {
  const s = c.s, receipts = s.receipts!, all = s.articles!, activeCount = active(s).length;
  const custom = JSON.stringify(s.feeds) !== JSON.stringify(DEFAULT_FEEDS);
  const categories = [...new Set(s.feeds!.map((x) => x.category))].sort();
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['src-heading', 'src-stats', 'src-tabs'] },
    { id: 'src-heading', type: 'text', props: { content: 'Sources', variant: 'heading' } },
    ...tabbed('src-tabs', [['Feeds', ['feeds-section']], ['Manage', ['manage-section']], ['Health', ['health-section']], ['Coverage', all.length ? ['coverage'] : []], ['Add feeds', ['add-section']], ['Ledger', ['ledger-section']]]),
    { id: 'src-stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['s-active', 's-articles', 's-images', 's-failing'] },
    { id: 's-active', type: 'stat', props: { label: 'Active feeds', value: '{/stats/active}' } },
    { id: 's-articles', type: 'stat', props: { label: 'Articles kept', value: '{/stats/articles}' } },
    { id: 's-images', type: 'stat', props: { label: 'With images', value: '{/stats/images}' } },
    { id: 's-failing', type: 'stat', props: { label: 'Failing feeds', value: '{/stats/failing}', tone: '{/stats/failTone}' } },
    ...(all.length ? [
      { id: 'coverage', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm' }, children: ['by-category', 'by-day', 'by-feed'] },
      { id: 'by-category', type: 'chart', props: { kind: 'pie', title: 'Articles by section', series: { records: '{/byCategory}', label: 'label', fields: ['articles'] }, height: 'sm' } },
      { id: 'by-day', type: 'chart', props: { kind: 'bar', title: 'Articles by publication day (UTC)', series: { records: '{/byDay}', label: 'label', fields: ['articles'] }, height: 'sm' } },
      { id: 'by-feed', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', title: 'Articles by publisher', series: { records: '{/byFeed}', label: 'label', fields: ['articles'] }, height: 'sm' } },
    ] : []),
    { id: 'feeds-section', type: 'section', props: { description: 'Tap a feed to turn it on or off. Green: on and reading. Blue: on, not read yet. Red: failing or needs permission. Plain: off. Each refresh reads up to 15 feeds, least recently read first; {/rotation}' }, children: ['category-toggles', 'feed-groups', 'feed-footer'] },
    { id: 'feed-groups', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm' }, children: categories.map((_, i) => `fg-${i}`) },
    ...categories.flatMap((category, i): Node[] => [
      { id: `fg-${i}`, type: 'stack', props: { gap: 'xs' }, children: [`fg-${i}-title`, `fg-${i}-chips`] },
      { id: `fg-${i}-title`, type: 'text', props: { content: category, variant: 'caption' } },
      { id: `fg-${i}-chips`, type: 'stack', props: { direction: 'horizontal', gap: 'xs', wrap: true }, children: { each: `/groups/${i}`, template: 'feed-chip' } },
    ]),
    { id: 'feed-chip', type: 'button', props: { label: '{chip}', action: 'toggle_feed', payload: { id: '{url}' }, style: 'secondary', tone: '{tone}', icon: '{icon}' } },
    { id: 'manage-section', type: 'section', props: { description: 'Prefer a publisher to rank its stories higher, or show it less; remove feeds you never want.' }, children: ['feeds'] },
    { id: 'category-toggles', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: { each: '/categories', template: 'cat-toggle' } },
    { id: 'cat-toggle', type: 'button', props: { label: '{label}', action: 'toggle_category', payload: { category: '{category}' }, style: '{style}' } },
    { id: 'feeds', type: 'grid', props: { columns: 3, minItemWidth: 'md', gap: 'sm', searchable: true, pageSize: 12 }, children: { each: '/feeds', template: 'feed-card' } },
    { id: 'feed-card', type: 'card', props: { title: '{name}', subtitle: '{subtitle}', body: '{health}', badge: '{badge}', tone: '{tone}' }, children: ['feed-actions'] },
    { id: 'feed-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: ['feed-toggle', 'feed-weight', 'feed-remove'] },
    { id: 'feed-toggle', type: 'button', props: { label: '{toggleLabel}', action: 'toggle_feed', payload: { id: '{url}' }, style: '{toggleStyle}' } },
    { id: 'feed-weight', type: 'button', props: { label: '{weightLabel}', action: 'source_weight', payload: { source: '{name}', weight: '{nextWeight}' }, style: 'link' } },
    { id: 'feed-remove', type: 'button', props: { label: 'Remove', action: 'remove_feed', payload: { id: '{url}' }, style: 'link', visibleIf: '{removable}' } },
    { id: 'feed-footer', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['images-toggle', ...(custom ? ['restore-feeds'] : [])] },
    { id: 'images-toggle', type: 'checkbox', props: { label: 'Show images from publisher servers', bind: '/images' } },
    ...(custom ? [{ id: 'restore-feeds', type: 'button', props: { label: 'Restore curated feeds', action: 'restore_feeds', style: 'link' } }] : []),
    { id: 'health-section', type: 'section', props: { description: 'Latest result per feed. Failing feeds keep their earlier articles.' }, children: [...(s.problem ? ['health-problem'] : []), Object.keys(s.health!).length ? 'health' : 'no-health'] },
    ...(s.problem ? [s.problem.startsWith('Read ') ? { id: 'health-problem', type: 'text', props: { content: '{/problem}', variant: 'caption' } } as Node : problemNode('health-problem')] : []),
    Object.keys(s.health!).length
      ? { id: 'health', type: 'table', props: { rows: '{/health}', columns: [{ key: 'name', label: 'Feed' }, { key: 'category', label: 'Section' }, { key: 'read', label: 'Last read' }, { key: 'ok', label: 'Last success' }, { key: 'items', label: 'Items', align: 'end' }, { key: 'images', label: 'Images', align: 'end' }, { key: 'status', label: 'Status' }], sortable: true, searchable: true, pageSize: 10 } }
      : { id: 'no-health', type: 'text', props: { content: `No feed has been read yet. ${SETUP}`, variant: 'caption' } },
    { id: 'add-section', type: 'section', props: { description: 'Any credential-free HTTPS RSS, Atom or JSON Feed. Paste OPML exported from another reader to add many at once.' }, children: ['add-split'] },
    { id: 'add-split', type: 'split', props: { ratio: '1:1', gap: 'md' }, children: ['add-feed', 'import'] },
    { id: 'add-feed', type: 'stack', props: { gap: 'sm' }, children: ['feed-name', 'feed-category', 'feed-url', 'feed-add'] },
    { id: 'feed-name', type: 'input', props: { label: 'Name', bind: '/newFeed/name', placeholder: 'Publisher' } },
    { id: 'feed-category', type: 'input', props: { label: 'Section', bind: '/newFeed/category', placeholder: 'World' } },
    { id: 'feed-url', type: 'input', props: { label: 'Feed URL', bind: '/newFeed/url', placeholder: 'https://…/rss.xml' } },
    { id: 'feed-add', type: 'button', props: { label: 'Add feed', action: 'add_feed', style: 'secondary' } },
    { id: 'import', type: 'stack', props: { gap: 'sm' }, children: ['opml', 'opml-import'] },
    { id: 'opml', type: 'textarea', props: { label: 'OPML', bind: '/opml', placeholder: '<opml><body><outline text="Tech"><outline text="…" xmlUrl="https://…"/></outline></body></opml>' } },
    { id: 'opml-import', type: 'button', props: { label: 'Import OPML', action: 'import_opml', style: 'secondary' } },
    { id: 'ledger-section', type: 'section', props: { description: 'The latest 40 reads. A scheduled refresh (off until you enable it under Manage) runs every 15 minutes while the app and computer are awake.' }, children: [receipts.length ? 'receipts' : 'no-receipts'] },
    receipts.length
      ? { id: 'receipts', type: 'table', props: { rows: '{/receipts}', columns: [{ key: 'source', label: 'Feed' }, { key: 'at', label: 'Retrieved' }, { key: 'rows', label: 'Items', align: 'end' }, { key: 'status', label: 'Status' }], searchable: true, pageSize: 10 } }
      : { id: 'no-receipts', type: 'text', props: { content: `Nothing read yet. ${SETUP}`, variant: 'caption' } },
  ];
  const failing = s.feeds!.filter((x) => (s.health![x.url]?.failures ?? 0) > 0).length;
  const data = {
    stats: { active: `${activeCount} of ${s.feeds!.length}`, articles: String(all.length), images: all.length ? `${Math.round((all.filter((a) => a.image).length / all.length) * 100)}%` : '—', failing: String(failing), failTone: failing ? 'warning' : 'neutral' },
    ...(all.length ? {
      byCategory: tally(all.map((a) => a.category)), byFeed: tally(all.map((a) => a.source)).sort((a, b) => b.articles - a.articles).slice(0, 15),
      byDay: tally(all.flatMap((a) => (a.publishedAt ? [a.publishedAt.slice(0, 10)] : []))).sort((a, b) => a.label.localeCompare(b.label)).slice(-14),
    } : {}),
    categories: categories.map((category) => { const on = s.feeds!.filter((x) => x.category === category && x.enabled !== false).length, n = s.feeds!.filter((x) => x.category === category).length; return { category, label: `${category} ${on}/${n}`, style: on ? 'primary' : 'secondary' }; }),
    feeds: s.feeds!.map((x) => {
      const on = x.enabled !== false, h = s.health![x.url], weight = x.weight ?? 'normal';
      return {
        ...x, subtitle: `${x.category}${weight === 'prefer' ? ' · preferred' : weight === 'less' ? ' · shown less' : ''}`,
        health: h ? (h.failures ? `Read failed ${h.failures}× · details in Health`
          : `${h.items} articles · ${ist(h.at)}${quality(x, h, s.articles!)}`) : on ? 'Not read yet' : 'Disabled',
        badge: on ? (h?.failures ? 'Failing' : 'Active') : 'Off', tone: on ? (h?.failures ? 'warning' : 'success') : 'neutral',
        toggleLabel: on ? 'Disable' : 'Enable', toggleStyle: on ? 'link' : 'secondary',
        weightLabel: weight === 'prefer' ? 'Unprefer' : weight === 'less' ? 'Show normally' : 'Prefer', nextWeight: weight === 'normal' ? 'prefer' : 'normal',
        removable: s.feeds!.length > 1,
      };
    }),
    groups: categories.map((category) => s.feeds!.filter((x) => x.category === category).map((x) => {
      const h = s.health![x.url], tone = x.enabled === false ? 'neutral' : h?.failures ? 'danger' : h ? 'success' : 'info';
      return { url: x.url, tone, icon: s.images ? siteIcon(x, all) : '', chip: `${x.name.replace(new RegExp(`\\s+${category}$`, 'i'), '')}` };
    })),
    rotation: ((n) => (n <= READS ? 'every active feed is read on each refresh.' : `all ${n} active feeds are read every ${Math.ceil(n / READS)} refreshes (about every ${Math.ceil(n / READS) * 15} minutes on the schedule).`))(activeCount),
    images: s.images, newFeed: s.newFeed, opml: s.opml, ...(s.problem ? { problem: s.problem } : {}),
    ...(Object.keys(s.health!).length ? { health: s.feeds!.filter((x) => s.health![x.url]).map((x) => { const h = s.health![x.url]!; return { name: x.name, category: x.category, read: ist(h.at), ok: ist(h.ok), items: h.items, images: h.images, status: h.failures ? `Failed ${h.failures}×: ${h.error ?? ''}` : 'OK' }; }) } : {}),
    ...(receipts.length ? { receipts: receipts.map((r) => ({ ...r, at: ist(r.at) })) } : {}),
  };
  return { surface: 'sources', nodes, data: replaceAll(data) };
}

/** Read-only queries for other apps and the assistant, over the same ranked stories. */
export async function handleQuery(toolName: string, params: Record<string, unknown> = {}, context: Context): Promise<unknown> {
  const s = normalize(context.state), now = Date.now(), c = ranked(s, now);
  const category = typeof params.category === 'string' ? params.category.toLowerCase().trim() : '';
  const query = typeof params.query === 'string' ? params.query.trim().slice(0, 80) : '';
  const limit = Math.max(1, Math.min(Number(params.limit) || 10, 50));
  const story = (st: Story) => ({
    title: st.lead.title, source: st.lead.source, category: st.category, url: st.lead.url, publishedAt: st.lead.publishedAt, excerpt: st.lead.excerpt,
    publishers: st.sources, reports: st.articles.length, why: st.why,
  });
  const matching = c.stories.filter((st) => (!category || st.articles.some((a) => a.category.toLowerCase() === category)) && (!query || st.articles.some((a) => matches(query, a))));
  if (toolName === 'get_latest_articles') return { count: matching.length, category: category || 'all', ...(query ? { query } : {}), checkedAt: s.checkedAt ?? null, stories: matching.slice(0, limit).map(story) };
  if (toolName === 'get_bulletin') {
    const ch = typeof params.channel === 'string' && params.channel ? channelStories(c, params.channel) : { name: query || (category ? matching[0]?.category ?? category : ''), stories: diverse(category || query ? matching : c.stories, 27, c.s.tuning!.perSource) };
    const top = ch.stories;
    // The programme is the shareable broadcast: another app publishes it at its own voice.listen path to play or watch it.
    const prog = programme(top, c.stories, s.topics!, { now }, ch.name, s.images !== false);
    return { checkedAt: s.checkedAt ?? null, text: bulletin(top, c.stories, s.topics!, { now }, ch.name) || 'News Desk has no stories yet; refresh it first.', stories: top.slice(0, 6).map(story), ...(prog.segments.length ? { programme: prog } : {}) };
  }
  if (toolName === 'get_story_coverage') {
    if (!query) throw new Error('Pass a query naming the story, such as a person, place or event');
    const st = matching[0];
    if (!st) return { query, found: false, checkedAt: s.checkedAt ?? null };
    return {
      query, found: true, checkedAt: s.checkedAt ?? null, story: story(st), spoken: storyReport(st, { now }),
      reports: [...st.articles].sort((a, b) => (a.publishedAt ?? a.retrievedAt).localeCompare(b.publishedAt ?? b.retrievedAt)).map((a) => ({ title: a.title, source: a.source, url: a.url, publishedAt: a.publishedAt, excerpt: a.excerpt, author: a.author ?? null })),
    };
  }
  throw new Error(`Unknown query tool: ${toolName}`);
}

/** The shipped surface.json: every view of a new, empty app. */
export const surfaceFile = () => view({}, 0).map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) { return {updates:view(normalize(context.state))}; }
