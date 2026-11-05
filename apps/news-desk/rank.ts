// Story grouping and ranking. Deterministic and explainable: every score is a sum
// of named parts the card shows as "why", so a reader can see why a story leads.
// Grouping is a headline-similarity heuristic within a time window, never a claim
// that two reports are the same; each grouped article keeps its own link and time.
import type { Article } from './feed.ts';

export interface Weights { fresh: number; coverage: number; topics: number; publisher: number; unseen: number }
export const DEFAULT_WEIGHTS: Weights = { fresh: 3, coverage: 1.5, topics: 2, publisher: 1, unseen: 0.5 };
export type Level = 'more' | 'less' | 'off';
export interface Prefs {
  topics: string[]; prefer: string[]; less: string[]; hidden: string[]; seen: Set<string>;
  weights?: Weights; halfLife?: number; sections?: Record<string, Level>; mutes?: string[];
}
export interface Part { label: string; value: number }
export interface Story {
  id: string; lead: Article; articles: Article[]; sources: string[]; publishers: number; category: string;
  newest: string; image?: string; topics: string[]; score: number; why: string[]; parts: Part[];
}

const STOP = new Set(('a an and are as at be been but by for from has have he her his in into is it its of on or our over she that the their them they this to up was we were what when where which who will with after amid about against before new says say said live update updates latest news video watch photos how why than more most out off not now just also all can could may might would should over under first last top day days week year years report reports amp').split(' '));
const WINDOW_MS = 48 * 3600_000, HALF_LIFE_H = 8, SECTION_STEP = 1.5;

/** Significant title words: case- and accent-folded, stop words removed, a light plural/possessive fold. */
// Ranking, topic discovery and filters ask for the same headlines' words many thousands
// of times per command; the words of a text never change, so they are kept (bounded).
const TERMS = new Map<string, string[]>(), WORD_SETS = new Map<string, Set<string>>(), CACHE_LIMIT = 20_000;
const kept = <T>(cache: Map<string, T>, key: string, make: () => T): T => {
  let value = cache.get(key);
  if (value === undefined) { if (cache.size >= CACHE_LIMIT) cache.clear(); value = make(); cache.set(key, value); }
  return value;
};
const wordSet = (text: string) => kept(WORD_SETS, text, () => new Set(terms(text)));

export function terms(text: string): string[] {
  return kept(TERMS, text, () => splitTerms(text)).slice();
}
function splitTerms(text: string): string[] {
  // "$6.3bn" and "$6.3 billion" are the same figure: keep decimals whole and spell out unit suffixes.
  const units: Record<string, string> = { bn: 'billion', b: 'billion', m: 'million', mn: 'million', k: 'thousand', cr: 'crore', tn: 'trillion' };
  return [...new Set(text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]s\b/g, '')
    .replace(/(\d)(bn|mn|cr|tn|b|m|k)\b/g, (_, d: string, u: string) => `${d} ${units[u]}`)
    .split(/(?:[^\p{L}\p{N}.]|\.(?!\d))+/u).map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w && !STOP.has(w) && (w.length > 2 || /\d/.test(w)))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))];
}
const when = (a: Article) => Date.parse(a.publishedAt ?? a.retrievedAt) || 0;

/** Same story: sharing most significant headline words, and no conflicting numbers (dates, figures). */
export function similar(a: string[], b: string[]): boolean {
  const B = new Set(b), shared = a.filter((w) => B.has(w)).length;
  if (shared < 2) return false;
  // Both headlines carrying a figure the other lacks ("October 30" vs "October 31") are different reports.
  const A = new Set(a), figure = (w: string) => /^\d+(\.\d+)?$/.test(w);
  if (a.some((w) => figure(w) && !B.has(w)) && b.some((w) => figure(w) && !A.has(w))) return false;
  const jaccard = shared / (a.length + b.length - shared), overlap = shared / Math.min(a.length, b.length);
  return jaccard >= 0.45 || (shared >= 3 && overlap >= 0.6 && jaccard >= 0.3);
}

/**
 * Newest first, each article joins the existing group it resembles most, and only
 * when it matches at least half of that group's members within the time window:
 * average linkage, so a chain of loosely related headlines never becomes one story.
 */
export function group(articles: Article[]): Article[][] {
  const order = [...articles].sort((a, b) => when(b) - when(a)), groups: { members: Article[]; words: string[][]; latest: number }[] = [];
  const index = new Map<string, Set<number>>();
  for (const a of order) {
    const words = terms(a.title), t = when(a), seen = new Set<number>();
    for (const w of words) for (const g of index.get(w) ?? []) seen.add(g);
    let best = -1, bestHits = 0;
    for (const g of seen) {
      const G = groups[g]!;
      if (G.latest - t > WINDOW_MS) continue;
      const hits = G.words.filter((m) => similar(words, m)).length;
      if (hits * 2 >= G.words.length && hits > bestHits) { best = g; bestHits = hits; }
    }
    if (best < 0) { best = groups.length; groups.push({ members: [], words: [], latest: t }); }
    groups[best]!.members.push(a); groups[best]!.words.push(words);
    for (const w of words) index.set(w, (index.get(w) ?? new Set()).add(best));
  }
  // A report seen before the rest of its story arrived is a singleton; give it a second chance against the finished groups.
  for (let i = 0; i < groups.length; i++) {
    const G = groups[i]!;
    if (G.members.length !== 1) continue;
    let best = -1, bestHits = 0;
    groups.forEach((H, j) => {
      if (j === i || H.members.length < 2 || Math.abs(H.latest - when(G.members[0]!)) > WINDOW_MS) return;
      const hits = H.words.filter((m) => similar(G.words[0]!, m)).length;
      if (hits * 2 >= H.words.length && hits > bestHits) { best = j; bestHits = hits; }
    });
    if (best >= 0) { groups[best]!.members.push(G.members[0]!); groups[best]!.words.push(G.words[0]!); G.members = []; G.words = []; }
  }
  return groups.filter((g) => g.members.length).map((g) => g.members);
}

const articleWords = (a: Article) => wordSet(`${a.title} ${a.excerpt} ${(a.tags ?? []).join(' ')}`);

/** A followed topic matches when every one of its words appears in the article's headline, excerpt or tags. */
export function matches(topic: string, a: Article): boolean {
  const need = terms(topic);
  if (!need.length) return false;
  const have = articleWords(a);
  return need.every((w) => have.has(w));
}

/** The publisher behind an article: its site, so several feeds from one outlet count once. */
export function publisher(url: string): string {
  try {
    const labels = new URL(url).hostname.replace(/^www\./, '').split('.');
    const n = labels.length > 2 && /^(co|com|org|net|gov|ac|nic|edu)$/.test(labels.at(-2)!) ? 3 : 2;
    return labels.slice(-n).join('.');
  } catch { return url; }
}
/** A muted word hides a report when it appears in the headline or publisher tags; a leading "-" is accepted and ignored. */
export function muted(mutes: string[], a: Article): boolean {
  if (!mutes.length) return false;
  const have = wordSet(`${a.title} ${(a.tags ?? []).join(' ')}`);
  return mutes.some((m) => { const need = terms(m.replace(/^-/, '')); return need.length > 0 && need.every((w) => have.has(w)); });
}
/**
 * Coverage counts independent publishers. A headline nearly identical to one already
 * counted from another publisher is syndicated wire copy and adds nothing.
 */
function independent(members: Article[]): { count: number; copies: number } {
  const counted: { site: string; words: Set<string> }[] = [];
  let copies = 0;
  for (const a of members) {
    const site = publisher(a.url), words = new Set(terms(a.title));
    if (counted.some((c) => c.site === site)) continue;
    const copy = counted.some((c) => { const shared = [...words].filter((w) => c.words.has(w)).length; return shared / (words.size + c.words.size - shared) >= 0.85; });
    if (copy) { copies++; continue; }
    counted.push({ site, words });
  }
  return { count: counted.length, copies };
}

const weight = (p: Prefs, source: string) => (p.prefer.includes(source) ? 1 : p.less.includes(source) ? -1 : 0);
const ago = (ms: number) => { const h = ms / 3600_000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`; };

/** Stories ranked by freshness, independent coverage, followed topics, section interest and source preference; every part is kept for "why". */
export function rank(articles: Article[], p: Prefs, now: number): Story[] {
  const W = p.weights ?? DEFAULT_WEIGHTS, half = p.halfLife ?? HALF_LIFE_H, sections = p.sections ?? {}, mutes = p.mutes ?? [];
  const visible = articles.filter((a) => !p.hidden.includes(a.source) && sections[a.category] !== 'off' && !muted(mutes, a));
  return group(visible).map((members) => {
    const sorted = [...members].sort((a, b) => weight(p, b.source) - weight(p, a.source) || Number(!!b.image) - Number(!!a.image) || when(b) - when(a));
    const lead = sorted[0]!, newest = Math.max(...members.map(when)), sources = [...new Set(members.map((a) => a.source))];
    const topics = p.topics.filter((t) => members.some((a) => matches(t, a)));
    const categories = members.reduce((m, a) => m.set(a.category, (m.get(a.category) ?? 0) + 1), new Map<string, number>());
    const category = [...categories].sort((a, b) => b[1] - a[1])[0]![0];
    const fresh = 2 ** (-Math.max(0, now - newest) / 3600_000 / half), { count, copies } = independent(sorted);
    const preference = sources.reduce((sum, s) => sum + weight(p, s), 0) / sources.length;
    const unseen = members.some((a) => !p.seen.has(a.id));
    const level = sections[category], section = level === 'more' ? SECTION_STEP : level === 'less' ? -SECTION_STEP : 0;
    const parts: Part[] = [
      { label: 'Freshness', value: W.fresh * fresh }, { label: 'Coverage', value: W.coverage * Math.log2(1 + count) },
      { label: 'Followed topics', value: W.topics * Math.min(topics.length, 2) }, { label: 'Publisher preference', value: W.publisher * preference },
      { label: 'Section interest', value: section }, { label: 'Image', value: lead.image ? 0.2 : 0 }, { label: 'Unseen', value: unseen ? W.unseen : 0 },
    ].filter((x) => x.value !== 0).map((x) => ({ ...x, value: Number(x.value.toFixed(2)) }));
    const score = parts.reduce((a, x) => a + x.value, 0);
    const why = [
      ago(Math.max(0, now - newest)),
      count > 1 ? `${count} publishers` : 'Single publisher',
      ...(copies ? [`${copies} syndicated ${copies === 1 ? 'copy' : 'copies'}`] : []),
      ...topics.map((t) => `Following: ${t}`),
      ...(preference > 0 ? ['Preferred source'] : preference < 0 ? ['Source shown less'] : []),
      ...(section > 0 ? [`More ${category}`] : section < 0 ? [`Less ${category}`] : []),
    ];
    return {
      id: lead.id, lead, articles: sorted, sources, publishers: count, category,
      newest: new Date(newest).toISOString(), ...(sorted.find((a) => a.image) ? { image: sorted.find((a) => a.image)!.image } : {}),
      topics, score: Number(score.toFixed(3)), why, parts,
    };
  }).sort((a, b) => b.score - a.score || b.newest.localeCompare(a.newest));
}

/** Highest-ranked stories with at most `perSource` leads from one publisher, so one feed cannot fill a section. */
export function diverse(stories: Story[], limit: number, perSource = 3): Story[] {
  const used = new Map<string, number>(), out: Story[] = [];
  for (const s of stories) {
    if (out.length >= limit) break;
    const n = used.get(s.lead.source) ?? 0;
    if (n >= perSource) continue;
    used.set(s.lead.source, n + 1); out.push(s);
  }
  return out;
}

const VERBS = new Set(('says said tells told seeks meets calls orders files reviews targets claims agrees questions announces approaches deploys outlines holds held joins leads plans urges wants takes makes gives sees').split(' '));

/**
 * Discovers trending topics across publisher tags, headline entities, and recurring story subjects.
 * Excludes section categories, already-followed topics and generic news terms.
 */
export function discoverTopics(articles: Article[], followed: string[] = [], categories: string[] = []): { label: string; articles: number }[] {
  const generic = new Set([
    ...categories,
    ...followed,
    'news', 'world news', 'india news', 'latest news', 'top stories', 'show types', 'opinion', 'video', 'live', 'update', 'updates', 'photos', 'today', 'daily', 'briefing', 'briefings', 'report', 'reports',
  ].map((t) => t.toLowerCase()));

  const candidates = new Map<string, string>();
  const add = (raw: string) => {
    const label = raw.trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    if (label.length < 2 || label.length > 40) return;
    const lower = label.toLowerCase();
    if (generic.has(lower) || /\bnews\b/i.test(lower)) return;
    const words = lower.split(/\s+/);
    if (words.every((w) => STOP.has(w) || VERBS.has(w))) return;
    if (words.length > 1 && (STOP.has(words[0]!) || STOP.has(words[words.length - 1]!))) return;
    if (!candidates.has(lower) || label[0] === label[0]!.toUpperCase()) candidates.set(lower, label);
  };

  for (const a of articles) {
    for (const t of a.tags ?? []) add(t);
    for (const m of a.title.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) ?? []) add(m);
    for (const m of a.title.match(/\b[A-Z]{2,6}\b/g) ?? []) add(m);
    for (const m of a.title.match(/(?<=[a-z,;:"'”’]\s+)[A-Z][a-z]{3,}\b/g) ?? []) add(m);
  }

  const scored: { label: string; lower: string; articles: number }[] = [];
  const sets = articles.map(articleWords);
  for (const [lower, label] of candidates.entries()) {
    const need = terms(label);
    const count = need.length ? sets.filter((have) => need.every((w) => have.has(w))).length : 0;
    if (count >= 3) scored.push({ label, lower, articles: count });
  }

  const filtered = scored.filter((c) => !scored.some((other) => other.lower !== c.lower && other.lower.includes(c.lower) && other.articles >= c.articles));
  return filtered.sort((a, b) => b.articles - a.articles).slice(0, 8).map(({ label, articles }) => ({ label, articles }));
}

