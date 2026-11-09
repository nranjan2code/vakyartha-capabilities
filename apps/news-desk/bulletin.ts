// Spoken scripts for the host's voice: a radio-style bulletin from the ranked
// stories, written for the ear rather than read off the screen. Only the
// publishers' own headlines and excerpts are used, each attributed; the
// connecting phrases are fixed wording, never generated claims. Pure.
import type { Article } from './feed.ts';
import type { Story } from './rank.ts';

/** A headline or excerpt made speakable: no labels, links, bylines, emoji or trailing publisher names. */
export function speakable(text: string, source = ''): string {
  let t = text.replace(/https?:\/\/\S+/g, ' ').replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/^\s*(live( updates?)?|watch|video|photos?|exclusive|breaking( news)?|explained|opinion|analysis|editorial|podcast|in pics|listen|quiz)\s*[:|–—-]\s*/i, '')
    .replace(/\s*[|–—-]\s*(live updates?|watch|video|photos?|read more|details here|full list|check here)\b.*$/i, '')
    .replace(/\s*\[[^\]]*\]|\s*\((video|photos?|watch|live)\)/gi, '')
    .replace(/The post .* appeared first on .*$/i, '')
    .replace(/\s*\|\s*[^|]{1,30}$/, '')
    .replace(/\s*(\.\.\.|…)\s*$/, '.')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
  if (source) t = t.replace(new RegExp(`\\s*[|–—-]\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '');
  return t && !/[.!?"']$/.test(t) ? `${t}.` : t;
}

/** The excerpt's first one or two sentences, when they add something to the headline. */
export function lead(a: Article, max = 260): string {
  const x = speakable(a.excerpt ?? '', a.source);
  if (!x || x.length < 30 || /^(click|read|subscribe|sign up|watch)\b/i.test(x)) return '';
  const head = speakable(a.title).toLowerCase().slice(0, 40);
  if (x.toLowerCase().startsWith(head)) return '';
  // Feed excerpts are often cut mid-sentence; only complete sentences are read.
  const sentences = x.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];
  if (!/[.!?"'”’)]\s*$/.test(a.excerpt ?? '')) sentences.pop();
  let out = '';
  for (const s of sentences) { if ((out + s).length > max) break; out += s; }
  return out.trim();
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** Who carries the story, said once and naturally. */
function attribution(st: Story, i: number): string {
  const n = st.sources.length;
  if (n === 1) return [`That's from ${st.lead.source}.`, `${st.lead.source} reports.`, `According to ${st.lead.source}.`][i % 3]!;
  if (n === 2) return `${list(st.sources)} are both reporting this.`;
  if (n === 3) return `${list(st.sources)} are all reporting this.`;
  return `${n} publishers are carrying this story, including ${list(st.sources.slice(0, 2))}.`;
}

const OPENERS = ['Our top story.', 'Also making news.', 'Meanwhile,', 'In other news,', 'Elsewhere,', 'Turning to', 'And', 'Also today,'];
/** "In sports," and similar section segues; a section name the person chose is said as written. */
const segue = (section: string) => `In ${section.toLowerCase() === 'national' ? 'news from across India' : section.toLowerCase() === 'world' ? 'world news' : section.toLowerCase()},`;

export interface Clock { now: number; zone?: string }
function when({ now, zone = 'Asia/Kolkata' }: Clock) {
  const d = new Date(now), hour = Number(d.toLocaleString('en-GB', { timeZone: zone, hour: '2-digit', hour12: false }));
  const greeting = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return {
    greeting, day: d.toLocaleDateString('en-GB', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }),
  };
}

/**
 * One part of a programme the host plays: what is said, how it is delivered,
 * an optional music cue before it, and what is on screen while it is said.
 * The visual fields are the publisher's own headline, image and attribution.
 */
export interface Segment {
  text: string; delivery: 'opening' | 'headline' | 'story' | 'aside' | 'closing'; cue?: 'intro' | 'sting' | 'outro'; bed?: true; breaking?: true;
  kicker: string; heading: string; image?: string; source?: string; at?: string; link?: string; break?: 'short' | 'story' | 'section';
}
export interface TickerItem { text: string; kicker?: string; link?: string; at?: string; fresh?: true }
export interface Programme { title: string; segments: Segment[]; ticker?: TickerItem[] }

/**
 * Breaking, on the feeds' own evidence: new to News Desk in the last 30 minutes
 * and published in the last 90 (so a first refresh does not make old stories
 * breaking), and either carried by two or more publishers or on a topic the
 * person follows. The spoken line says which.
 */
const FRESH_SEEN = 30 * 60_000, FRESH_PUBLISHED = 90 * 60_000;
const firstSeen = (st: Story) => Math.min(...st.articles.map((a) => Date.parse((a as Article & { firstSeen?: string }).firstSeen ?? '') || Infinity));
const published = (st: Story) => Math.min(...st.articles.map((a) => Date.parse(a.publishedAt ?? '') || Infinity));
export function isBreaking(st: Story, now: number, topics: string[]): boolean {
  return now - firstSeen(st) <= FRESH_SEEN && now - published(st) <= FRESH_PUBLISHED && (st.sources.length >= 2 || st.topics.some((t) => topics.includes(t)));
}
const isFresh = (st: Story, now: number) => now - firstSeen(st) <= FRESH_SEEN && now - published(st) <= FRESH_PUBLISHED;

/** The story's picture: the lead report's own image, else another publisher's for the same story. */
const picture = (st: Story) => st.lead.image ?? st.articles.find((a) => a.image)?.image;
const visual = (st: Story, kicker: string, images: boolean) => ({
  kicker, heading: st.lead.title, source: st.sources.length > 1 ? `${st.lead.source} and ${st.sources.length - 1} more` : st.lead.source,
  ...(images && picture(st) ? { image: picture(st) } : {}), ...(st.lead.publishedAt ? { at: st.lead.publishedAt } : {}), link: st.lead.url,
});

/**
 * A two-to-three-minute programme: intro music under the greeting, the
 * headlines as quick reads, a sting, the leading stories with their context and
 * attribution, followed topics, a round of the other sections, and a sign-off
 * into the outro. The same segments are the spoken bulletin and the picture.
 */
export function programme(top: Story[], all: Story[], topics: string[], clock: Clock, channel = '', images = true): Programme {
  const title = channel ? `News Desk · ${channel}` : 'News Desk';
  if (!top.length) return { title, segments: [] };
  const w = when(clock), used = new Set<string>(), out: Segment[] = [];
  out.push({ text: `${w.greeting}. This is ${channel ? `the News Desk ${channel} bulletin` : 'your News Desk bulletin'} for ${w.day}, at ${w.time}.`, delivery: 'opening', cue: 'intro', kicker: channel || 'Bulletin', heading: `${w.day} · ${w.time}` });
  // A general bulletin covers the day across sections (at most three leading stories each); a channel covers its own stories.
  // Length follows the day's content: every story appears once, and a busy day makes a longer programme.
  const perSection = new Map<string, number>();
  // Breaking stories lead, at most two; the rest keep the ranking.
  const breaking = top.filter((st) => isBreaking(st, clock.now, topics)).slice(0, 2), flagged = new Set(breaking.map((st) => st.id));
  const ranked = channel ? top : top.filter((st) => { if (flagged.has(st.id)) return false; const n = perSection.get(st.category) ?? 0; if (n >= 3) return false; perSection.set(st.category, n + 1); return true; });
  const main = [...breaking, ...ranked.filter((st) => !flagged.has(st.id))].slice(0, 12);
  main.slice(0, 5).forEach((st, i) => out.push({ text: `${i ? '' : 'The headlines. '}${speakable(st.lead.title, st.lead.source)}`, delivery: 'headline', break: 'short', bed: true, ...visual(st, 'The headlines', images) }));
  main.forEach((st, i) => {
    used.add(st.id);
    const isNews = flagged.has(st.id);
    const headline = speakable(st.lead.title, st.lead.source), opener = isNews ? 'Breaking news.' : i === 0 ? OPENERS[0]! : i === main.length - 1 && main.length > 2 ? 'And' : OPENERS[1 + ((i - 1) % 6)]!;
    const intro = opener === 'Turning to' ? `Turning to ${st.category.toLowerCase() === 'national' ? 'India' : st.category.toLowerCase()}.` : opener;
    const body = lead(st.lead);
    const other = st.articles.find((a) => a.source !== st.lead.source && lead(a) && lead(a) !== body);
    out.push({
      text: [intro, headline, body, other && i < 3 ? `${other.source} adds: ${lead(other, 180)}` : '', attribution(st, i), isNews ? `First seen ${Math.max(1, Math.round((clock.now - firstSeen(st)) / 60_000))} minutes ago.` : ''].filter(Boolean).join(' '),
      delivery: 'story', break: 'story', ...(i === 0 ? { cue: 'sting' as const } : {}), ...(isNews ? { breaking: true as const } : {}), ...visual(st, isNews ? st.category : i === 0 ? 'Top story' : st.category, images),
    });
  });
  topics.flatMap((t) => { const st = all.find((x) => x.topics.includes(t) && !used.has(x.id)); if (st) used.add(st.id); return st ? [{ t, st }] : []; }).slice(0, 3).forEach(({ t, st }, i) => {
    const body = lead(st.lead, 200);
    out.push({ text: [`${i ? '' : 'On the topics you follow. '}On ${t}: ${speakable(st.lead.title, st.lead.source)}`, body, `That's from ${st.lead.source}.`].filter(Boolean).join(' '), delivery: 'aside', break: i ? 'story' : 'section', ...visual(st, `Following · ${t}`, images) });
  });
  // The round: every other section (or more of the channel), each story once with its lead.
  const rest = channel
    ? top.filter((st) => !used.has(st.id)).slice(0, 14).map((st) => ({ c: channel, st }))
    : [...new Set(all.map((st) => st.category))].flatMap((c) => all.filter((st) => st.category === c && !used.has(st.id)).slice(0, 3).map((st) => ({ c, st })));
  let section = '';
  rest.slice(0, 30).forEach(({ c, st }, i) => {
    used.add(st.id);
    const first = c !== section;
    section = c;
    const opener = channel ? (i ? 'Also,' : `More from ${channel}.`) : first ? `${i ? '' : 'Around the sections. '}${segue(c)}` : 'Also,';
    const body = lead(st.lead, 200);
    out.push({ text: [`${opener} ${speakable(st.lead.title, st.lead.source)}`, body, `That's from ${st.lead.source}.`].filter(Boolean).join(' '), delivery: 'aside', break: first && !channel ? 'section' : 'story', ...visual(st, c, images) });
  });
  // Everything the show does not read crawls along the bottom, in ranking order, newest marked.
  const ticker = all.filter((st) => !used.has(st.id)).slice(0, 60).map((st) => ({ text: st.lead.title, kicker: st.category, link: st.lead.url, ...(st.lead.publishedAt ? { at: st.lead.publishedAt } : {}), ...(isFresh(st, clock.now) ? { fresh: true as const } : {}) }));
  out.push({ text: `Those are the stories at ${w.time}. That was News Desk${channel ? `, ${channel}` : ''}, from the publishers you follow. Open the app for full coverage and the original reports.`, delivery: 'closing', cue: 'outro', break: 'section', kicker: title, heading: 'Full coverage and the original reports are in the app' });
  return { title, segments: out, ...(ticker.length ? { ticker } : {}) };
}

/** The programme as one spoken script, for tools and channels that take text. */
export const bulletin = (...args: Parameters<typeof programme>): string => {
  const { segments } = programme(...args);
  return segments.map((x, i) => (i && x.break !== 'short' ? '\n\n' : i ? ' ' : '') + x.text).join('');
};

/** One story read as a short report: what happened, how coverage developed, and who reported it. */
export function storyReport(st: Story, clock: Clock): string {
  const ordered = [...st.articles].sort((a, b) => (a.publishedAt ?? a.retrievedAt).localeCompare(b.publishedAt ?? b.retrievedAt));
  const w = when(clock), parts = [speakable(st.lead.title, st.lead.source), lead(st.lead, 400)].filter(Boolean);
  if (ordered.length > 1) {
    parts.push(`Among these saved reports, ${ordered[0]!.source} has the earliest timestamp.`);
    for (const a of ordered.filter((x) => x.id !== st.lead.id).slice(0, 4)) {
      const extra = lead(a, 200);
      parts.push(`${a.source}: ${speakable(a.title, a.source)}${extra ? ` ${extra}` : ''}`);
    }
  }
  parts.push(`${attribution(st, 0)} This report was put together at ${w.time} from the publishers' own headlines and summaries.`);
  return parts.join('\n\n');
}
