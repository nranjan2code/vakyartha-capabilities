import { randomUUID } from 'node:crypto';
import { parseComposition, type Composition } from './composition.ts';
import { creatorAction, creatorView, sourceResult, normalizeCreator, retainProject, remember, accept, shortComposition, type CreatorState, type Snapshot, type ProjectHistory } from './creator.ts';

export type Format = 'show' | 'short';
export interface Segment { sourceApp?: string; checkedAt?: string; text: string; delivery: 'opening' | 'headline' | 'story' | 'aside' | 'closing'; cue?: 'intro' | 'sting' | 'outro'; break?: 'short' | 'story' | 'section'; bed?: true; breaking?: true; chart?: Record<string, unknown>; figures?: Record<string, unknown>[]; kicker: string; heading: string; image?: string; source?: string; at?: string; link?: string }
export interface Programme { composition?: Composition; title: string; badge?: string; segments: Segment[]; ticker?: { text: string; kicker?: string; link?: string; at?: string; fresh?: true; change?: number }[] }
export interface Video { proposal?: { segment: number; heading: string; text: string }; accepted?: Snapshot; parentId?: string; history?: ProjectHistory; id: string; title: string; format: Format; source: string; savedAt: string; sourceCheckedAt?: string; status: 'draft' | 'library'; programme: Programme }
export interface Progress { part: number; done: boolean; at: string }
export interface Playlist { id: string; name: string; items: string[] }
export interface State { creator?: CreatorState; videos?: Video[]; unreadable?: unknown[]; confirmUnreadable?: true; progress?: Record<string, Progress>; history?: { id: string; at: string }[]; playlists?: Playlist[]; playlist?: string; later?: string[]; channel?: string; playlistName?: string; confirmPlaylist?: string; selected?: string; source?: string; format?: Format; edit?: { id: string; title: string; segment: number; heading: string; text: string }; topic?: string; notice?: string; confirmRemove?: string; seq?: number }
export interface Context { state: State; appRevision?: number; callTool(name: string, args: Record<string, unknown>): Promise<unknown> }
type Node = { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } };
type Update = { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] };

export const SOURCES = [
  { id: 'news', name: 'News Desk', tool: 'app-news-desk__get_bulletin', args: { channel: 'top' } },
  { id: 'markets', name: 'Market Terminal', tool: 'app-market-terminal__get_market_brief', args: {} },
  { id: 'weather', name: 'Weather Desk', tool: 'app-weather-desk__get_weather_briefing', args: {} },
] as const;
const SOURCE = new Map<string, (typeof SOURCES)[number]>(SOURCES.map(x => [x.id, x]));
const str = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined;
// Untrusted source text loses HTML tags and bare links at import. Saved text is only bounded, so a
// person's own words such as "C# tips" survive every reload; Watch reduces fields to plain words itself.
const clean = (v: unknown, max: number) => str(typeof v === 'string' ? v.replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, '') : v, max);
const when = (v: string) => { const d = new Date(v); return Number.isFinite(d.getTime()) && d.getTime() > 0 ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Unknown time'; };
const kind = (v: unknown): Format => v === 'short' ? 'short' : 'show';
const wordCount = (v: string) => v.trim() ? v.trim().split(/\s+/).length : 0;

function segment(raw: unknown, imported: boolean): Segment | undefined {
  if (!raw || typeof raw !== 'object') return;
  const t = imported ? clean : str, x = raw as Record<string, unknown>, body = t(x.text, 4000), kicker = t(x.kicker, 60);
  let heading = t(x.heading, 300);
  if (!body && !heading) { if (imported) return; heading = 'Untitled scene'; }
  const delivery = ['opening', 'headline', 'story', 'aside', 'closing'].includes(String(x.delivery)) ? x.delivery as Segment['delivery'] : 'story';
  const cue = ['intro', 'sting', 'outro'].includes(String(x.cue)) ? x.cue as Segment['cue'] : undefined;
  const brk = ['short', 'story', 'section'].includes(String(x.break)) ? x.break as Segment['break'] : undefined;
  const image = typeof x.image === 'string' && /^https:\/\//.test(x.image) ? x.image.slice(0, 2048) : undefined;
  const link = typeof x.link === 'string' && /^https:\/\//.test(x.link) ? x.link.slice(0, 2048) : undefined;
  const chart = x.chart && typeof x.chart === 'object' ? x.chart as Record<string, unknown> : undefined;
  const figures = Array.isArray(x.figures) ? x.figures.slice(0, 6).filter(f => f && typeof f === 'object') as Record<string, unknown>[] : undefined;
  return { ...(str(x.sourceApp,120) ? { sourceApp: str(x.sourceApp,120) } : {}), ...(date(x.checkedAt) ? { checkedAt: date(x.checkedAt) } : {}), text: body, delivery, ...(cue ? { cue } : {}), ...(brk ? { break: brk } : {}), ...(x.bed === true ? { bed: true as const } : {}), ...(x.breaking === true ? { breaking: true as const } : {}), ...(chart ? { chart } : {}), ...(figures?.length ? { figures } : {}), kicker, heading, ...(image ? { image } : {}), ...(str(x.source, 120) ? { source: str(x.source, 120) } : {}), ...(date(x.at) ? { at: date(x.at) } : {}), ...(link ? { link } : {}) };
}

export function programme(raw: unknown, fallbackTitle: string, imported = true): Programme {
  const t = imported ? clean : str;
  if (!raw || typeof raw !== 'object') throw new Error('The selected app did not return a watchable programme');
  const value = raw as Record<string, unknown>;
  if (Array.isArray(value.segments) && value.segments.length > 80) throw new Error('The selected programme has more than 80 scenes. Shorten it in the source app and try again.');
  const segments = Array.isArray(value.segments) ? value.segments.flatMap(x => segment(x, imported) ?? []) : [];
  if (!segments.length) throw new Error('The selected app has no saved programme yet. Refresh it there, then try again.');
  const ticker = Array.isArray(value.ticker) ? value.ticker.slice(0, 80).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const x = item as Record<string, unknown>, body = t(x.text, 200);
    if (!body) return [];
    const link = typeof x.link === 'string' && /^https:\/\//.test(x.link) ? x.link.slice(0, 2048) : undefined;
    return [{ text: body, ...(str(x.kicker, 40) ? { kicker: str(x.kicker, 40) } : {}), ...(link ? { link } : {}), ...(date(x.at) ? { at: date(x.at) } : {}), ...(x.fresh === true ? { fresh: true as const } : {}), ...(typeof x.change === 'number' && Number.isFinite(x.change) ? { change: x.change } : {}) }];
  }) : [];
  const composition = parseComposition(value.composition, segments.length);
  return { ...(composition ? { composition } : {}), title: t(value.title, 80) || fallbackTitle, ...(str(value.badge, 20) ? { badge: str(value.badge, 20) } : {}), segments, ...(ticker.length ? { ticker } : {}) };
}

function normalize(raw: State = {}): State {
  // A saved record that no longer validates is kept untouched and reported, never silently dropped.
  const unreadable = (Array.isArray(raw.unreadable) ? raw.unreadable : []).slice(0, 100);
  const videos = (Array.isArray(raw.videos) ? raw.videos : []).slice(0, 100).flatMap(x => {
    try {
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !['draft', 'library'].includes(x.status)) throw new Error('unreadable');
      return [{ ...retainProject(x, programme), id: x.id.slice(0, 80), title: str(x.title, 80) || 'Untitled show', format: kind(x.format), source: str(x.source, 120) || 'Video Studio', savedAt: date(x.savedAt) ?? new Date(0).toISOString(), ...(date(x.sourceCheckedAt) ? { sourceCheckedAt: date(x.sourceCheckedAt) } : {}), status: x.status as Video['status'], programme: programme(x.programme, str(x.title, 80) || 'Untitled show', false) }];
    } catch { if (unreadable.length < 100) unreadable.push(x); return []; }
  });
  const selected = videos.some(x => x.id === raw.selected) ? raw.selected : videos[0]?.id;
  const v = videos.find(x => x.id === selected);
  const edit = raw.edit && v?.id === raw.edit.id ? { id: v.id, title: str(raw.edit.title, 80) || v.title, segment: Math.max(0, Math.min(v.programme.segments.length - 1, Math.floor(Number(raw.edit.segment) || 0))), heading: str(raw.edit.heading, 300), text: str(raw.edit.text, 4000) } : undefined;
  // Watching records refer to saved items by id; references to removed items fall away.
  const known = new Set(videos.map(x => x.id));
  const progress: Record<string, Progress> = {};
  for (const [id, x] of Object.entries(raw.progress && typeof raw.progress === 'object' ? raw.progress : {})) {
    const v = videos.find(y => y.id === id); if (!v || !x || typeof x !== 'object') continue;
    progress[id] = { part: Math.max(0, Math.min(v.programme.segments.length - 1, Math.floor(Number(x.part) || 0))), done: x.done === true, at: date(x.at) ?? new Date(0).toISOString() };
  }
  const history = (Array.isArray(raw.history) ? raw.history : []).filter(x => x && known.has(x.id)).slice(0, 50).map(x => ({ id: x.id, at: date(x.at) ?? new Date(0).toISOString() }));
  const playlists = (Array.isArray(raw.playlists) ? raw.playlists : []).slice(0, 20).flatMap(x => x && typeof x.id === 'string' && str(x.name, 60) ? [{ id: x.id.slice(0, 80), name: str(x.name, 60), items: [...new Set((Array.isArray(x.items) ? x.items : []).filter(i => known.has(i)))].slice(0, 50) }] : []);
  const playlist = playlists.some(x => x.id === raw.playlist) ? raw.playlist : playlists[0]?.id;
  const later = [...new Set((Array.isArray(raw.later) ? raw.later : []).filter(i => known.has(i)))].slice(0, 100);
  return { creator: normalizeCreator(raw.creator), videos, progress, history, playlists, later, channel: str(raw.channel, 120), ...(playlist ? { playlist } : {}), playlistName: str(raw.playlistName, 60), ...(playlists.some(x => x.id === raw.confirmPlaylist) ? { confirmPlaylist: raw.confirmPlaylist } : {}), ...(unreadable.length ? { unreadable, ...(raw.confirmUnreadable === true ? { confirmUnreadable: true as const } : {}) } : {}), selected, source: SOURCE.has(String(raw.source)) ? raw.source : 'news', format: kind(raw.format), edit, topic: str(raw.topic, 160), notice: str(raw.notice, 300), confirmRemove: videos.some(v => v.id === raw.confirmRemove) ? raw.confirmRemove : undefined, seq: Number.isSafeInteger(raw.seq) && Number(raw.seq) >= 0 ? Number(raw.seq) : 0 };
}

const val = (s: State) => {
  const active = s.videos!.find(x => x.id === s.selected), e = s.edit;
  const selectedView = active ? { ...active, programme: { ...active.programme, segments: active.programme.segments.map((x, index) => ({ ...x, index, source: x.source || active.source })) } } : null;
  const metadata = (status: Video['status']) => s.videos!.filter(x => x.status === status).map((x, index) => ({ id: x.id, index, title: x.title, formatLabel: x.format === 'short' ? 'Short' : 'Show', source: x.source, savedAt: x.savedAt, savedLabel: when(x.savedAt), length: runtime(x.programme), image: x.programme.segments.find(p => p.image)?.image ?? '', statusLabel: status === 'library' ? 'In library' : 'Needs review' }));
  return { unreadableCount: s.unreadable?.length ?? 0, library: metadata('library'), drafts: metadata('draft'), selected: selectedView, edit: e ?? { id: '', title: '', segment: 0, heading: '', text: '' }, source: s.source, sourceOptions: SOURCES.map(x => ({ label: x.name, value: x.id })), format: s.format, formatOptions: [{ label: 'Show', value: 'show' }, { label: 'Short', value: 'short' }], segmentOptions: active?.programme.segments.map((x, i) => ({ label: `${i + 1}. ${x.heading || 'Untitled scene'}`, value: String(i) })) ?? [], notice: s.notice ?? '', topic: s.topic ?? '', authorRequest: `Help me create a watchable ${s.format === 'short' ? 'short' : 'show'}${s.topic ? ` about ${s.topic}` : ''}. Read Video Studio's creator context, use only source apps and information I choose or that match the topic, and save a complete programme as an unreviewed draft for me to edit and review. Preserve source names and dates. Do not publish it or claim a video file was rendered.`, authorWorkflow: workflow };
};
// Estimated length at normal speed: about 150 words a minute, the host's pauses between parts and its theme
// cues (the opening holds at least 4.5 s, the sting and outro about 5.5 s). The voice and speed set the real length.
const PAUSE: Record<string, number> = { short: 0.22, story: 0.6, section: 0.9 };
const CUE: Record<string, number> = { intro: 5, sting: 5.5, outro: 5.8 };
const seconds = (p: Programme) => p.composition ? p.composition.duration : Math.max(1, Math.round(p.segments.reduce((sum, x, i) => sum + wordCount(x.text) / 2.5 + (i && x.break ? PAUSE[x.break] ?? 0 : 0) + (x.cue ? CUE[x.cue] ?? 0 : 0), 0)));
const runtime = (p: Programme) => { const sec = seconds(p); return sec < 60 ? `About ${sec} s` : `About ${Math.round(sec / 60)} min`; };
/** 74 → "1:14": the estimated length shown on a cover. */
const clock = (sec: number) => `~${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const day = (v: string) => { const d = new Date(v); return Number.isFinite(d.getTime()) && d.getTime() > 0 ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown date'; };
const COVERS = [['#1d3b6e', '#e5484d'], ['#0f4c3a', '#f5b400'], ['#3b1d6e', '#38c6d4'], ['#5a2410', '#ff8a3d'], ['#123d57', '#9ad94f']];
/**
 * A cover for every video: its first picture, or else a title card drawn from
 * its own words (title and source on a colour chosen by the source), so a
 * programme without pictures never shows as an empty card.
 */
function cover(v: Video): string {
  const picture = v.programme.segments.find(x => x.image)?.image;
  if (picture) return picture;
  const tall = v.format === 'short', w = tall ? 360 : 640, h = tall ? 640 : 360, width = tall ? 13 : 24, size = tall ? 38 : 40;
  const [bg, accent] = COVERS[[...v.source].reduce((a, c) => a + c.charCodeAt(0), 0) % COVERS.length]!;
  const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const lines: string[] = [];
  for (const word of v.title.split(' ')) { const last = lines.at(-1); if (last !== undefined && (last + ' ' + word).length <= width) lines[lines.length - 1] = `${last} ${word}`; else lines.push(word.slice(0, width)); }
  const shown = lines.slice(0, 4), top = h / 2 - ((shown.length - 1) * size * 1.15) / 2;
  const text = shown.map((l, i) => `<text x="32" y="${Math.round(top + i * size * 1.15)}" font-size="${size}">${esc(l)}${i === 3 && lines.length > 4 ? '…' : ''}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#07090c"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect x="32" y="${Math.round(top - size - 14)}" width="56" height="6" rx="3" fill="${accent}"/><g fill="#fff" font-family="system-ui, sans-serif" font-weight="700">${text}</g><text x="32" y="${h - 28}" fill="#ffffffb3" font-family="system-ui, sans-serif" font-size="22">${esc(v.source)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const n = (id: string, type: string, props: Record<string, unknown> = {}, children?: Node['children']): Node => ({ id, type, props, ...(children ? { children } : {}) });
const btn = (id: string, label: string, action: string, payload: Record<string, unknown> = {}, style = 'secondary'): Node => n(id, 'button', { label, action, payload, style });
const addSection = (target: Node[], id: string, title: string, description: string, children: Node[]) => target.push(n(id, 'section', { title, description }, children.map(x => x.id)), ...children);
const workflow = { title: 'Video Studio', stages: ['Plan', 'Create', 'Review'], brief: 'Your show or short brief', boundary: 'This saves a watchable programme in your local library. Listen and Watch use the shared Vakyartha voice. No video file is rendered and nothing is posted outside Vakyartha.', saved: 'Draft saved. Review the source, narration and scenes in Video Studio before adding it to your library.', guide: { start: { heading: 'Choose a subject and source', hint: 'Agree the topic, style and source apps before writing the show.' }, responded: { heading: 'Shape the programme', hint: 'Build scenes from the selected app data and preserve the original source and dates.' }, saved: { heading: 'Review your draft', hint: 'Check every scene and attribution, then add the show to your local library.' } }, steps: [{ id: 'create', label: 'Create show draft', mode: 'send', stage: 1, message: 'Read get_creator_context for the current schema and expectedRevision. Use the source tools that the person selected or that match their topic. Set source to the declared source app name; use segment source for actual publishers. Create a complete, source-aware programme with a title, ordered segments, plain spoken text, headings, attribution and dates. For a short, use one or two scenes and at most 120 spoken words total. Preserve uncertainty and do not invent facts, images, links or sources. Call propose_video to save it as an unreviewed draft. Do not add it to the library.' }, { id: 'revise', label: 'Revise the plan', mode: 'edit', message: 'Revise the show plan with these changes: ' }], review: { label: 'Review drafts', surface: 'studio', tool: 'propose_video', stage: 2 } };

export function views(raw: State): Update[] {
  const s = normalize(raw), creator = creatorView(s, SOURCES), d = val(s), rows = (each: string, template: string) => ({ each, template });
  const lib = s.videos!.filter(x => x.status === 'library'), pos = new Map(lib.map((x, i) => [x.id, i]));
  const at = (id: string) => pos.get(id) ?? -1, later = new Set(s.later);
  const target = s.playlists!.find(x => x.id === s.playlist);
  // One row shape for every video card: cover, length on the cover, title, then source and date.
  const card = (record: Video, index: number) => { const x = record.accepted ? { ...record, title: record.accepted.title, programme: record.accepted.programme } : record; return ({ id: x.id, index, title: x.title, image: cover(x), length: clock(seconds(x.programme)), meta: `${x.source} · ${day(x.savedAt)}`, laterLabel: later.has(x.id) ? 'Remove from Watch later' : 'Watch later' }); };
  const queue = (list: Video[]) => list.map(x => ({ id: x.id, programme: x.accepted?.programme ?? x.programme }));
  const watch = (q: string, label: string, extra: Record<string, unknown> = {}) => ({ action: 'voice.watch', payload: { queue: q, index: '{index}', progress: 'watch_progress', ...extra }, actionLabel: label });
  const videoCard = (id: string, q: string, kids: string[], extra: Record<string, unknown> = {}) => n(id, 'card', { title: '{title}', subtitle: '{meta}', image: '{image}', imageLabel: '{length}', titleLines: 2, ...watch(q, 'Watch'), ...extra }, kids);
  const shortCard = (id: string, q: string) => n(id, 'card', { title: '{title}', subtitle: '{meta}', image: '{image}', imageAspect: 'tall', imageLabel: '{length}', titleLines: 2, ...watch(q, 'Watch short', { portrait: true }) });
  const libraryQueue = queue(lib);
  const resumeRows = lib.filter(x => s.progress![x.id] && !s.progress![x.id]!.done && s.progress![x.id]!.part > 0).sort((a, b) => s.progress![b.id]!.at.localeCompare(s.progress![a.id]!.at)).slice(0, 4)
    .map(x => { const pr = s.progress![x.id]!, total = x.programme.segments.length; return { ...card(x, at(x.id)), part: pr.part, progress: pr.part / total, meta: `Scene ${pr.part + 1} of ${total} · ${x.source}` }; });
  // Home: chips choose a source app; shows fill the grid and shorts get their own shelf.
  const channels = [...new Set(lib.map(x => x.source))];
  const channel = channels.includes(s.channel ?? '') ? s.channel! : 'all';
  const inChannel = lib.filter(x => channel === 'all' || x.source === channel), shows = inChannel.filter(x => x.format === 'show'), shelf = inChannel.filter(x => x.format === 'short');
  const libraryNodes: Node[] = [];
  addSection(libraryNodes, 'library-intro', 'Home', lib.length ? `${lib.length} saved in your library. Choose a video to watch it; Watch carries on to the next. Swipe, scroll or use the up and down keys to move between them.` : 'Your library is empty. Import a programme or create one in Creator Studio.', lib.length ? [...(channels.length > 1 ? [n('library-channel', 'select', { label: 'Source', bind: '/channel', options: '{/channelOptions}' })] : []), btn('library-play-all', 'Play all', 'voice.watch', { queue: '{/homeQueue}', index: 0, progress: 'watch_progress' }, 'primary')] : [btn('library-create', 'Open Creator Studio', 'view.open', { surface: 'studio' }, 'primary')]);
  if (resumeRows.length) {
    addSection(libraryNodes, 'library-continue', 'Continue watching', '', [n('continue-items', 'grid', { columns: 4, minItemWidth: 'sm' }, rows('/continueRows', 'continue-row'))]);
    libraryNodes.push(videoCard('continue-row', '{/libraryQueue}', [], { progress: '{progress}', ...watch('{/libraryQueue}', 'Resume', { from: '{part}' }) }));
  }
  if (shelf.length) {
    addSection(libraryNodes, 'library-shorts', 'Shorts', '', [n('shelf-items', 'grid', { columns: 6, minItemWidth: 'sm', pageSize: 6 }, rows('/shelfRows', 'shelf-row'))]);
    libraryNodes.push(shortCard('shelf-row', '{/shelfQueue}'));
  }
  if (shows.length) {
    addSection(libraryNodes, 'library-list', channel === 'all' ? 'Shows' : channel, target ? `Add to playlist adds to ${target.name}.` : '', [n('library-items', 'grid', { columns: 4, minItemWidth: 'sm', searchable: true, pageSize: 12 }, rows('/homeRows', 'library-row'))]);
    libraryNodes.push(videoCard('library-row', '{/homeQueue}', ['library-later', 'library-edit', ...(target ? ['library-collect'] : [])]), btn('library-later', '{laterLabel}', 'toggle_later', { id: '{id}' }, 'link'), btn('library-edit', 'Edit', 'open_video', { id: '{id}' }, 'link'), ...(target ? [btn('library-collect', 'Add to playlist', 'add_to_playlist', { id: '{id}' }, 'link')] : []));
  }
  if (s.notice) libraryNodes.push(n('library-notice', 'text', { content: s.notice, variant: 'caption' }));
  // Shorts: every short as a tall card; Watch plays them as a vertical feed.
  const shorts = lib.filter(x => x.format === 'short'), shortsNodes: Node[] = [];
  addSection(shortsNodes, 'shorts-intro', 'Shorts', shorts.length ? `${shorts.length} ${shorts.length === 1 ? 'short' : 'shorts'} in a tall frame, one after another. Swipe, scroll or use the up and down keys for the next one.` : 'No shorts in your library yet. Make a short from any scene in Creator Studio, then add it to your library.', shorts.length ? [btn('shorts-play', 'Play shorts', 'voice.watch', { queue: '{/shortsQueue}', portrait: true, index: 0, progress: 'watch_progress' }, 'primary')] : [btn('shorts-create', 'Open Creator Studio', 'view.open', { surface: 'studio' })]);
  if (shorts.length) {
    shortsNodes.push(n('shorts-items', 'grid', { columns: 6, minItemWidth: 'sm', searchable: true, pageSize: 18 }, rows('/shortRows', 'short-row')), shortCard('short-row', '{/shortsQueue}'));
  }
  // You: what you watched, what you saved for later, and your playlists.
  const listNodes: Node[] = [], chosen = target;
  const historyRows = s.history!.filter(h => at(h.id) >= 0).slice(0, 12).map(h => { const x = lib[at(h.id)]!, pr = s.progress![x.id]; return { ...card(x, at(x.id)), progress: pr?.done ? 1 : (pr?.part ?? 0) / x.programme.segments.length, meta: `${x.source} · watched ${day(h.at)}` }; });
  const laterList = s.later!.flatMap(id => lib[at(id)] ? [lib[at(id)]!] : []), laterRows = laterList.map(card);
  if (historyRows.length) {
    addSection(listNodes, 'you-history', 'History', '', [n('history-items', 'grid', { columns: 4, minItemWidth: 'sm', pageSize: 8 }, rows('/historyRows', 'history-row')), btn('history-clear', 'Clear history', 'clear_history')]);
    listNodes.push(videoCard('history-row', '{/libraryQueue}', [], { progress: '{progress}', ...watch('{/libraryQueue}', 'Watch again') }));
  }
  addSection(listNodes, 'you-later', 'Watch later', laterRows.length ? `${laterRows.length} saved for later` : 'Use Watch later on any video on Home to save it here.', laterRows.length ? [btn('later-play', 'Play all', 'voice.watch', { queue: '{/laterQueue}', index: 0, progress: 'watch_progress' }, 'primary'), n('later-items', 'grid', { columns: 4, minItemWidth: 'sm', pageSize: 8 }, rows('/laterRows', 'later-row'))] : []);
  if (laterRows.length) listNodes.push(videoCard('later-row', '{/laterQueue}', ['later-remove']), btn('later-remove', 'Remove', 'toggle_later', { id: '{id}' }, 'link'));
  const listItems = (chosen?.items ?? []).flatMap((id, i) => { const x = lib[at(id)]; return x ? [{ id, index: i, title: x.title, label: `${x.format === 'short' ? 'Short' : 'Show'} · ${runtime(x.programme)} · ${x.source}` }] : []; });
  addSection(listNodes, 'playlists-intro', 'Playlists', 'Collect library videos into running orders and play them straight through.', [n('playlist-name', 'input', { label: 'New playlist', bind: '/playlistName', placeholder: 'Name, for example Morning briefing' }), btn('playlist-create', 'Create playlist', 'create_playlist', {}, 'primary'), ...(s.playlists!.length ? [n('playlist-pick', 'select', { label: 'Playlist', bind: '/playlist', options: '{/playlistOptions}', presentation: 'dropdown' })] : [])]);
  if (chosen) {
    addSection(listNodes, 'playlist-detail', chosen.name, listItems.length ? `${listItems.length} ${listItems.length === 1 ? 'video' : 'videos'} · add more with Add to playlist in the library` : 'Empty. Use Add to playlist on any video in the library.', [...(listItems.length ? [btn('playlist-play', 'Play playlist', 'voice.watch', { queue: '{/playlistQueue}', index: 0, progress: 'watch_progress' }, 'primary'), n('playlist-items', 'grid', { columns: 1, pageSize: 20 }, rows('/listItems', 'playlist-row'))] : []), btn('playlist-ask-delete', 'Delete playlist', 'ask_delete_playlist', {}, 'danger'), ...(s.confirmPlaylist === chosen.id ? [n('playlist-confirm', 'alert', { title: `Delete ${chosen.name}?`, body: 'The playlist is removed; its videos stay in your library.', tone: 'warning' }), btn('playlist-keep', 'Keep playlist', 'cancel_remove'), btn('playlist-delete', 'Delete playlist', 'delete_playlist', {}, 'danger')] : [])]);
    // Row templates go only with the list that uses them: an empty playlist has neither.
    if (listItems.length) listNodes.push(n('playlist-row', 'card', { title: '{title}', subtitle: '{label}' }, ['playlist-row-play', 'playlist-up', 'playlist-down', 'playlist-remove']), btn('playlist-row-play', 'Watch from here', 'voice.watch', { queue: '{/playlistQueue}', index: '{index}', progress: 'watch_progress' }, 'primary'), btn('playlist-up', 'Move up', 'move_in_playlist', { id: '{id}', by: -1 }), btn('playlist-down', 'Move down', 'move_in_playlist', { id: '{id}', by: 1 }), btn('playlist-remove', 'Remove', 'remove_from_playlist', { id: '{id}' }));
  }
  if (s.notice) listNodes.push(n('playlists-notice', 'text', { content: s.notice, variant: 'caption' }));
  const studioNodes = creator.nodes;
  const root = (list: Node[], ids: string[]) => list.unshift(n('root', 'stack', { direction: 'vertical', gap: 'md' }, list.filter(x => ids.includes(x.id)).map(x => x.id)));
  root(libraryNodes, ['library-intro', 'library-continue', 'library-shorts', 'library-list', 'library-notice']);
  root(shortsNodes, ['shorts-intro', 'shorts-items']);
  root(listNodes, ['you-history', 'you-later', 'playlists-intro', 'playlist-detail', 'playlists-notice']);

  // Each view carries only the data it shows; programmes travel as the queues that play them.
  const notice = d.notice, { library: _library, ...studioData } = d;
  return [
    { surface: 'library', nodes: libraryNodes, data: [{ op: 'replace', path: '/', value: { channel, channelOptions: [{ label: 'All', value: 'all' }, ...channels.map(x => ({ label: x, value: x }))], homeRows: shows.map(card), homeQueue: queue(shows), shelfRows: shelf.map(card), shelfQueue: queue(shelf), continueRows: resumeRows, libraryQueue, notice } }] },
    { surface: 'shorts', nodes: shortsNodes, data: [{ op: 'replace', path: '/', value: { shortRows: shorts.map(card), shortsQueue: queue(shorts) } }] },
    { surface: 'playlists', nodes: listNodes, data: [{ op: 'replace', path: '/', value: { historyRows, libraryQueue, laterRows, laterQueue: queue(laterList), playlist: s.playlist ?? '', playlistName: s.playlistName ?? '', playlistOptions: s.playlists!.map(x => ({ label: `${x.name} (${x.items.length})`, value: x.id })), listItems, playlistQueue: listItems.map(x => ({ id: x.id, programme: lib[at(x.id)]!.accepted?.programme ?? lib[at(x.id)]!.programme })), notice } }] },
    { surface: 'studio', nodes: studioNodes, data: [{ op: 'replace', path: '/', value: { ...studioData, ...creator.data } }] },
  ];
}

function selected(s: State, id?: unknown): Video {
  const video = s.videos!.find(x => x.id === (typeof id === 'string' ? id : s.selected));
  if (!video) throw new Error('Choose a show or short first');
  return video;
}
function setEdit(s: State, v: Video, index = 0) {
  const part = v.programme.segments[index]; if (!part) throw new Error('Choose a scene first');
  s.selected = v.id; s.edit = { id: v.id, title: v.title, segment: index, heading: part.heading, text: part.text };
}
function addVideo(s: State, video: Video) {
  if (s.videos!.length >= 100) throw new Error('Video Studio holds 100 saved items. Remove one before creating another.');
  const bytes = new TextEncoder().encode(JSON.stringify([video, ...s.videos!])).length;
  if (bytes > 8 * 1024 * 1024) throw new Error('Video Studio has reached its 8 MB content limit. Remove an item or shorten a programme before creating another.');
  s.videos!.unshift(video);
}
function checkStateSize(s: State) {
  if (new TextEncoder().encode(JSON.stringify(s)).length > 8 * 1024 * 1024) throw new Error('Video Studio has reached its 8 MB content limit. Shorten this programme or remove an item before saving.');
}

export async function handleAction(controlId: string, value: unknown, c: Context, action?: string) {
  const s = normalize(c.state), p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const working = { ...c, state: s };
  if (await creatorAction(controlId, value, working, action, SOURCES, programme)) { /* handled by the project writer */ }
  else if (!action) {
    if (controlId === '/source') { if (!SOURCE.has(String(value))) throw new Error('Choose an available source app'); s.source = String(value); }
    else if (controlId === '/format') s.format = kind(value);
    else if (controlId === '/topic') s.topic = str(value, 160);
    else if (controlId === '/playlistName') s.playlistName = str(value, 60);
    else if (controlId === '/channel') s.channel = value === 'all' ? '' : str(value, 120);
    else if (controlId === '/playlist') { if (!s.playlists!.some(x => x.id === value)) throw new Error('Choose a playlist'); s.playlist = String(value); s.confirmPlaylist = undefined; }
    else if (controlId === '/edit/title') {
      const v = selected(s); if (!s.edit || s.edit.id !== v.id) throw new Error('Open a show in Creator Studio first');
      remember(v); s.edit.title = str(value, 80);
      if (s.edit.title) { v.title = s.edit.title; v.programme.title = s.edit.title; s.notice = ''; } else s.notice = 'A show needs a title. The last title is kept until you type a new one.';
    }
    else if (controlId === '/edit/segment') { const v = selected(s); setEdit(s, v, Number(value)); }
    else if (controlId === '/edit/heading' || controlId === '/edit/text') {
      // Edits save straight into the canonical scene, so changing scene or closing the app never loses words.
      const v = selected(s), e = s.edit; if (!e || e.id !== v.id) throw new Error('Open a scene in Creator Studio first');
      const part = v.programme.segments[e.segment]; if (!part) throw new Error('Choose a scene first');
      remember(v);
      if (controlId === '/edit/heading') { e.heading = str(value, 300); part.heading = e.heading || 'Untitled scene'; }
      else { e.text = str(value, 4000); part.text = e.text; }
      s.notice = '';
    }
    else throw new Error('Unknown Creator Studio field');
  } else if (action.startsWith('import_') && SOURCE.has(action.slice(7) as never)) {
    // One action per source, so the host's access check asks only about the app being read.
    const src = SOURCE.get(action.slice(7) as never)!;
    let result: unknown;
    try { result = await c.callTool(src.tool, { ...src.args }); }
    catch (error) { throw new Error(`${src.name} could not be read. Check that it is installed, turned on and allowed in Access. (${error instanceof Error ? error.message : String(error)})`.slice(0, 300)); }
    const raw = sourceResult(result);
    const envelope = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const prog = programme(envelope.programme ?? raw, src.name);
    const id = randomUUID(), video: Video = { id, title: prog.title, format: 'show', source: src.name, savedAt: new Date().toISOString(), ...(date(envelope.checkedAt) || date(envelope.retrievedAt) ? { sourceCheckedAt: date(envelope.checkedAt) ?? date(envelope.retrievedAt) } : {}), status: 'draft', programme: { ...prog, segments: prog.segments.map(segment => ({ ...segment, sourceApp: src.name, ...(date(envelope.checkedAt) ? { checkedAt: date(envelope.checkedAt) } : {}) })) } };
    addVideo(s, video); setEdit(s, video); s.notice = `Imported ${src.name} programme as a draft. Review it before adding it to your library.`;
  } else if (action === 'open_video') { const v = selected(s, p.id); setEdit(s, v); s.creator!.panel = 'scene'; s.notice = ''; }
  else if (action === 'select_scene') { setEdit(s, selected(s), Number(p.index)); s.creator!.panel = 'scene'; }
  else if (action === 'make_short') {
    const base = selected(s), index = Number(p.index), part = base.programme.segments[index]; if (!part) throw new Error('Choose a scene first');
    const title = str(part.heading, 80) || `${base.title} short`;
    const { cue: _cue, break: _break, ...rest } = part;
    const short: Video = { id: randomUUID(), title, format: 'short', source: base.source, parentId: base.id, savedAt: new Date().toISOString(), ...(base.sourceCheckedAt ? { sourceCheckedAt: base.sourceCheckedAt } : {}), status: 'draft', programme: { title, segments: [{ ...rest, delivery: 'story' }], composition: shortComposition(base, index) } };
    addVideo(s, short); setEdit(s, short); s.notice = 'Short created from one scene. Review it before adding it to your library.';
  } else if (action === 'add_to_library') {
    const v = selected(s, p.id); accept(v); s.selected = v.id; setEdit(s, v); s.notice = 'Added to your local video library. This did not post it outside Vakyartha.';
  } else if (action === 'move_to_drafts') {
    const v = selected(s, p.id); v.status = 'draft'; s.selected = v.id; setEdit(s, v); s.notice = `Moved ${v.title} back to drafts.`;
  } else if (action === 'propose_video') {
    const title = str(p.title, 80), source = str(p.source, 120), format = kind(p.format), prog = programme(p.programme, title);
    if (!title || !SOURCES.some(x => x.name === source)) throw new Error('A proposed show needs a title and a declared source app');
    if (c.appRevision === undefined) throw new Error('Video Studio did not supply the current revision. Read creator context again before saving this draft.');
    if (format === 'short' && (prog.segments.length > 2 || prog.segments.reduce((sum, part) => sum + wordCount(part.text), 0) > 120)) throw new Error('A short can have at most two scenes and 120 spoken words');
    const video: Video = { id: randomUUID(), title, format, source, savedAt: new Date().toISOString(), status: 'draft', programme: { ...prog, title } };
    addVideo(s, video); setEdit(s, video); s.notice = 'Assistant proposal saved as a draft. Review the words and sources before adding it to your library.';
  } else if (action === 'ask_remove') { const v = selected(s, p.id); s.confirmRemove = v.id; }
  else if (action === 'cancel_remove') { s.confirmRemove = undefined; s.confirmUnreadable = undefined; s.confirmPlaylist = undefined; }
  else if (action === 'watch_progress') {
    // Reported by Watch when a video ends, when the viewer moves on, and when Watch closes.
    const v = s.videos!.find(x => x.id === p.id); if (!v) return { updates: views(s) };
    const at = new Date().toISOString(), part = Math.max(0, Math.min(v.programme.segments.length - 1, Math.floor(Number(p.part) || 0)));
    s.progress![v.id] = { part: p.done === true ? 0 : part, done: p.done === true, at };
    s.history = [{ id: v.id, at }, ...s.history!.filter(x => x.id !== v.id)].slice(0, 50);
    s.notice = '';
  } else if (action === 'toggle_later') {
    const v = selected(s, p.id); if (v.status !== 'library') throw new Error('Add the video to your library first');
    const saved = s.later!.includes(v.id);
    s.later = saved ? s.later!.filter(x => x !== v.id) : [v.id, ...s.later!].slice(0, 100);
    s.notice = saved ? `Removed ${v.title} from Watch later.` : `Saved ${v.title} to Watch later.`;
  } else if (action === 'clear_history') { s.history = []; s.progress = {}; s.notice = 'Watch history cleared.'; }
  else if (action === 'create_playlist') {
    const name = str(s.playlistName, 60); if (!name) throw new Error('Name the playlist first');
    if (s.playlists!.length >= 20) throw new Error('Video Studio holds 20 playlists. Delete one before creating another.');
    if (s.playlists!.some(x => x.name.toLowerCase() === name.toLowerCase())) throw new Error(`A playlist called ${name} already exists`);
    const list = { id: randomUUID(), name, items: [] }; s.playlists!.push(list); s.playlist = list.id; s.playlistName = ''; s.notice = `Created ${name}. Add videos from the library.`;
  } else if (action === 'add_to_playlist') {
    const v = selected(s, p.id), list = s.playlists!.find(x => x.id === s.playlist); if (!list) throw new Error('Create a playlist in Playlists first');
    if (v.status !== 'library') throw new Error('Add the video to your library first');
    if (list.items.includes(v.id)) s.notice = `${v.title} is already in ${list.name}.`;
    else { if (list.items.length >= 50) throw new Error(`${list.name} holds 50 videos. Remove one first.`); list.items.push(v.id); s.notice = `Added ${v.title} to ${list.name}.`; }
  } else if (action === 'remove_from_playlist' || action === 'move_in_playlist') {
    const list = s.playlists!.find(x => x.id === s.playlist), k = list?.items.indexOf(String(p.id)) ?? -1; if (!list || k < 0) throw new Error('Choose a video in this playlist');
    if (action === 'remove_from_playlist') { list.items.splice(k, 1); s.notice = ''; }
    else { const j = k + (Number(p.by) < 0 ? -1 : 1); if (j >= 0 && j < list.items.length) [list.items[k], list.items[j]] = [list.items[j]!, list.items[k]!]; }
  } else if (action === 'ask_delete_playlist') { if (!s.playlist) throw new Error('Choose a playlist'); s.confirmPlaylist = s.playlist; }
  else if (action === 'delete_playlist') {
    const list = s.playlists!.find(x => x.id === s.playlist); if (!list || s.confirmPlaylist !== list.id) throw new Error('Review the removal first');
    s.playlists = s.playlists!.filter(x => x.id !== list.id); s.playlist = s.playlists[0]?.id; s.confirmPlaylist = undefined; s.notice = `Deleted ${list.name}. Its videos stay in your library.`;
  }
  else if (action === 'ask_remove_unreadable') { if (!s.unreadable?.length) throw new Error('There are no unreadable items'); s.confirmUnreadable = true; }
  else if (action === 'remove_unreadable') {
    if (!s.confirmUnreadable) throw new Error('Review the removal first');
    const count = s.unreadable?.length ?? 0; s.unreadable = undefined; s.confirmUnreadable = undefined;
    s.notice = `Removed ${count === 1 ? '1 unreadable item' : `${count} unreadable items`} from Video Studio.`;
  }
  else if (action === 'remove_video') {
    const v = selected(s, p.id); if (s.confirmRemove !== v.id) throw new Error('Review the removal first');
    s.videos = s.videos!.filter(x => x.id !== v.id); s.selected = s.videos[0]?.id; s.confirmRemove = undefined;
    const next = s.videos.find(x => x.id === s.selected); if (next) setEdit(s, next); else s.edit = undefined;
    s.notice = 'Removed from Video Studio. Source apps and shared media are unchanged.';
  } else if (action === 'refresh') { /* The host rebuilds saved views without fetching source data. */ }
  else throw new Error(`Unknown Video Studio action: ${action}`);
  checkStateSize(s);
  c.state = s;
  return { updates: views(s), ...(action === 'add_to_library' ? { focusSurface: 'library' } : action === 'open_video' || action === 'move_to_drafts' ? { focusSurface: 'studio' } : undefined) };
}

export async function handleQuery(name: string, _params: unknown, c: Context) {
  const s = normalize(c.state);
  if (name !== 'get_creator_context') throw new Error('Unknown Video Studio query');
  const selectedProject = s.videos!.find(v => v.id === s.selected), selectedSegment = s.edit?.segment ?? 0;
  return { expectedRevision: c.appRevision ?? null, selected: selectedProject ? { id: selectedProject.id, title: selectedProject.title, segment: selectedSegment, scene: selectedProject.programme.segments[selectedSegment], clips: selectedProject.programme.composition?.clips.filter(c => c.segment === selectedSegment), proposalTool: 'propose_edit' } : null, selectedSource: SOURCE.get(String(s.source))?.name ?? 'News Desk', topic: s.topic ?? '', savedCount: s.videos!.length, recent: s.videos!.slice(0, 20).map(v => ({ title: v.title, format: v.format, source: v.source, status: v.status })), schema: { programme: { title: 'text', segments: [{ text: 'spoken plain text', delivery: 'opening|headline|story|aside|closing', cue: 'show only: intro on the opening, sting on the first detailed scene, outro on the closing', break: 'short between headlines, story between stories, section between sections', bed: 'true on headline scenes to play the theme quietly under them', kicker: 'section', heading: 'scene title', source: 'actual contributing app or publication', at: 'source timestamp when available', link: 'optional https link to the original report', image: 'optional actual https image', chart: 'optional, only from source numbers: {kind: line, points, labels: [first, last], base} or {kind: bars, bars: [{label, value}], unit}', figures: 'optional, up to six source figures: [{label, value, change}]' }] }, format: 'show or short; a show opens, runs its scenes and closes with the cues above; a short has one or two concise scenes and no cues' }, limits: '80 scenes per show; shorts have at most two scenes and 120 spoken words; 100 local videos; 8 MB total app content; each spoken scene up to 4000 characters' };
}

const TITLES: Record<string, string> = { library: 'Home', shorts: 'Shorts', playlists: 'You', studio: 'Creator Studio' };
export function surfaceFile() { return views({}).map(u => ({ id: u.surface, title: TITLES[u.surface]!, nodes: u.nodes, data: u.data[0]!.value })); }
export async function renderApp(context: Context) { return { updates: views(normalize(context.state)) }; }
