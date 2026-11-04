import { randomUUID } from 'node:crypto';

export type Format = 'show' | 'short';
export interface Segment { text: string; delivery: 'opening' | 'headline' | 'story' | 'aside' | 'closing'; cue?: 'intro' | 'sting' | 'outro'; break?: 'short' | 'story' | 'section'; bed?: true; breaking?: true; chart?: Record<string, unknown>; figures?: Record<string, unknown>[]; kicker: string; heading: string; image?: string; source?: string; at?: string; link?: string }
export interface Programme { title: string; badge?: string; segments: Segment[]; ticker?: { text: string; kicker?: string; link?: string; at?: string; fresh?: true; change?: number }[] }
export interface Video { id: string; title: string; format: Format; source: string; savedAt: string; sourceCheckedAt?: string; status: 'draft' | 'library'; programme: Programme }
export interface State { videos?: Video[]; unreadable?: unknown[]; confirmUnreadable?: true; selected?: string; source?: string; format?: Format; edit?: { id: string; title: string; segment: number; heading: string; text: string }; topic?: string; notice?: string; confirmRemove?: string; seq?: number }
export interface Context { state: State; appRevision?: number; callTool(name: string, args: Record<string, unknown>): Promise<unknown> }
type Node = { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } };
type Update = { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] };

export const SOURCES = [
  { id: 'news', name: 'News Desk', tool: 'app-news-desk__get_bulletin', args: { channel: 'top' } },
  { id: 'markets', name: 'Market Terminal', tool: 'app-market-terminal__get_market_brief', args: {} },
  { id: 'weather', name: 'Weather Desk', tool: 'app-weather-desk__get_weather_briefing', args: {} },
  { id: 'wishes', name: 'Wish Radar', tool: 'app-wish-radar__get_broadcast_script', args: { format: 'programme' } },
] as const;
const SOURCE = new Map(SOURCES.map(x => [x.id, x]));
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
  return { text: body, delivery, ...(cue ? { cue } : {}), ...(brk ? { break: brk } : {}), ...(x.bed === true ? { bed: true as const } : {}), ...(x.breaking === true ? { breaking: true as const } : {}), ...(chart ? { chart } : {}), ...(figures?.length ? { figures } : {}), kicker, heading, ...(image ? { image } : {}), ...(str(x.source, 120) ? { source: str(x.source, 120) } : {}), ...(date(x.at) ? { at: date(x.at) } : {}), ...(link ? { link } : {}) };
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
  return { title: t(value.title, 80) || fallbackTitle, ...(str(value.badge, 20) ? { badge: str(value.badge, 20) } : {}), segments, ...(ticker.length ? { ticker } : {}) };
}

function normalize(raw: State = {}): State {
  // A saved record that no longer validates is kept untouched and reported, never silently dropped.
  const unreadable = (Array.isArray(raw.unreadable) ? raw.unreadable : []).slice(0, 100);
  const videos = (Array.isArray(raw.videos) ? raw.videos : []).slice(0, 100).flatMap(x => {
    try {
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !['draft', 'library'].includes(x.status)) throw new Error('unreadable');
      return [{ id: x.id.slice(0, 80), title: str(x.title, 80) || 'Untitled show', format: kind(x.format), source: str(x.source, 120) || 'Video Studio', savedAt: date(x.savedAt) ?? new Date(0).toISOString(), ...(date(x.sourceCheckedAt) ? { sourceCheckedAt: date(x.sourceCheckedAt) } : {}), status: x.status as Video['status'], programme: programme(x.programme, str(x.title, 80) || 'Untitled show', false) }];
    } catch { if (unreadable.length < 100) unreadable.push(x); return []; }
  });
  const selected = videos.some(x => x.id === raw.selected) ? raw.selected : videos[0]?.id;
  const v = videos.find(x => x.id === selected);
  const edit = raw.edit && v?.id === raw.edit.id ? { id: v.id, title: str(raw.edit.title, 80) || v.title, segment: Math.max(0, Math.min(v.programme.segments.length - 1, Math.floor(Number(raw.edit.segment) || 0))), heading: str(raw.edit.heading, 300), text: str(raw.edit.text, 4000) } : undefined;
  return { videos, ...(unreadable.length ? { unreadable, ...(raw.confirmUnreadable === true ? { confirmUnreadable: true as const } : {}) } : {}), selected, source: SOURCE.has(String(raw.source)) ? raw.source : 'news', format: kind(raw.format), edit, topic: str(raw.topic, 160), notice: str(raw.notice, 300), confirmRemove: videos.some(v => v.id === raw.confirmRemove) ? raw.confirmRemove : undefined, seq: Number.isSafeInteger(raw.seq) && Number(raw.seq) >= 0 ? Number(raw.seq) : 0 };
}

const val = (s: State) => {
  const active = s.videos!.find(x => x.id === s.selected), e = s.edit;
  const selectedView = active ? { ...active, programme: { ...active.programme, segments: active.programme.segments.map((x, index) => ({ ...x, index, source: x.source || active.source })) } } : null;
  const metadata = (status: Video['status']) => s.videos!.filter(x => x.status === status).map(x => ({ id: x.id, title: x.title, formatLabel: x.format === 'short' ? 'Short' : 'Show', source: x.source, savedAt: x.savedAt, savedLabel: when(x.savedAt), length: runtime(x.programme), image: x.programme.segments.find(p => p.image)?.image ?? '', statusLabel: status === 'library' ? 'In library' : 'Needs review' }));
  return { unreadableCount: s.unreadable?.length ?? 0, library: metadata('library'), drafts: metadata('draft'), selected: selectedView, edit: e ?? { id: '', title: '', segment: 0, heading: '', text: '' }, source: s.source, sourceOptions: SOURCES.map(x => ({ label: x.name, value: x.id })), format: s.format, formatOptions: [{ label: 'Show', value: 'show' }, { label: 'Short', value: 'short' }], segmentOptions: active?.programme.segments.map((x, i) => ({ label: `${i + 1}. ${x.heading || 'Untitled scene'}`, value: String(i) })) ?? [], notice: s.notice ?? '', topic: s.topic ?? '', authorRequest: `Help me create a watchable ${s.format === 'short' ? 'short' : 'show'}${s.topic ? ` about ${s.topic}` : ''}. Read Video Studio's creator context, use only source apps and information I choose or that match the topic, and save a complete programme as an unreviewed draft for me to edit and review. Preserve source names and dates. Do not publish it or claim a video file was rendered.`, authorWorkflow: workflow };
};
// Spoken runtime is an estimate at about 150 words a minute; the selected voice sets the real length.
const runtime = (p: Programme) => { const words = p.segments.reduce((sum, x) => sum + wordCount(x.text), 0), sec = Math.max(1, Math.round(words / 2.5)); return sec < 60 ? `About ${sec} s` : `About ${Math.round(sec / 60)} min`; };
const n = (id: string, type: string, props: Record<string, unknown> = {}, children?: Node['children']): Node => ({ id, type, props, ...(children ? { children } : {}) });
const btn = (id: string, label: string, action: string, payload: Record<string, unknown> = {}, style = 'secondary'): Node => n(id, 'button', { label, action, payload, style });
const addSection = (target: Node[], id: string, title: string, description: string, children: Node[]) => target.push(n(id, 'section', { title, description }, children.map(x => x.id)), ...children);
const workflow = { title: 'Video Studio', stages: ['Plan', 'Create', 'Review'], brief: 'Your show or short brief', boundary: 'This saves a watchable programme in your local library. Listen and Watch use the shared Vakyartha voice. No video file is rendered and nothing is posted outside Vakyartha.', saved: 'Draft saved. Review the source, narration and scenes in Video Studio before adding it to your library.', guide: { start: { heading: 'Choose a subject and source', hint: 'Agree the topic, style and source apps before writing the show.' }, responded: { heading: 'Shape the programme', hint: 'Build scenes from the selected app data and preserve the original source and dates.' }, saved: { heading: 'Review your draft', hint: 'Check every scene and attribution, then add the show to your local library.' } }, steps: [{ id: 'create', label: 'Create show draft', mode: 'send', stage: 1, message: 'Read get_creator_context for the current schema and expectedRevision. Use the source tools that the person selected or that match their topic. Set source to the declared source app name; use segment source for actual publishers. Create a complete, source-aware programme with a title, ordered segments, plain spoken text, headings, attribution and dates. For a short, use one or two scenes and at most 120 spoken words total. Preserve uncertainty and do not invent facts, images, links or sources. Call propose_video to save it as an unreviewed draft. Do not add it to the library.' }, { id: 'revise', label: 'Revise the plan', mode: 'edit', message: 'Revise the show plan with these changes: ' }], review: { label: 'Review drafts', surface: 'studio', tool: 'propose_video', stage: 2 } };

export function views(raw: State): Update[] {
  const s = normalize(raw), d = val(s), rows = (each: string, template: string) => ({ each, template });
  const libraryNodes: Node[] = [];
  addSection(libraryNodes, 'library-intro', 'Video library', 'Your saved Vakyartha shows and short programmes.', [n('library-count', 'text', { content: `${s.videos!.filter(x => x.status === 'library').length} saved` })]);
  if (d.library.length) {
    const ready = d.selected?.status === 'library' ? [n('library-ready', 'text', { content: `Ready to watch: ${d.selected.title}. Press Watch in the header to play it.` })] : [];
    addSection(libraryNodes, 'library-list', 'Saved videos', 'Choose Watch, then press Watch in the header.', [...ready, n('library-items', 'grid', { columns: 3, minItemWidth: 'sm', searchable: true, pageSize: 12 }, rows('/library', 'library-row'))]);
    libraryNodes.push(n('library-row', 'card', { title: '{title}', subtitle: '{formatLabel} · {length} · {source} · {savedLabel}', image: '{image}', imageLayout: 'cover', titleLines: 2 }, ['library-watch', 'library-edit', 'library-unlist']), btn('library-watch', 'Watch', 'choose_video', { id: '{id}' }, 'primary'), btn('library-edit', 'Edit', 'open_video', { id: '{id}' }), btn('library-unlist', 'Move to drafts', 'move_to_drafts', { id: '{id}' }));
  }
  else libraryNodes.push(n('library-empty', 'text', { content: 'Your library is empty. Import a programme or create one in Creator Studio.' }));
  const studioNodes: Node[] = [];
  addSection(studioNodes, 'creator-intro', 'Creator Studio', 'Create a source-aware production or bring a saved programme into your workspace.', [n('creator-paths', 'grid', { columns: 2, minItemWidth: 'md', gap: 'md' }, ['new-production', 'source-production'])]);
  addSection(studioNodes, 'new-production', 'Create a production', 'Describe the show or short you want to make.', [n('creator-topic', 'input', { label: 'Production brief', bind: '/topic', placeholder: 'What should this be about?' }), n('creator-format', 'select', { label: 'Format', bind: '/format', options: '{/formatOptions}', presentation: 'dropdown' }), btn('assistant-create', 'Create with assistant', 'assistant.compose', { path: 'authorRequest', workflowPath: 'authorWorkflow' }, 'primary')]);
  addSection(studioNodes, 'source-production', 'Use a saved programme', 'Import the latest programme already saved in a Vakyartha app.', [n('creator-source', 'select', { label: 'Source app', bind: '/source', options: '{/sourceOptions}', presentation: 'dropdown' }), btn('import-source', 'Import programme', 'import_source', {}, 'secondary')]);
  if (d.drafts.length) {
    addSection(studioNodes, 'drafts-list', 'Drafts to review', 'Imported or assistant-created programmes stay drafts until you add them to the library.', [n('draft-items', 'grid', { columns: 2, minItemWidth: 'md', searchable: true, pageSize: 12 }, rows('/drafts', 'draft-row'))]);
    studioNodes.push(n('draft-row', 'card', { title: '{title}', subtitle: '{formatLabel} · {length} · {source} · {statusLabel}', image: '{image}', imageLayout: 'thumbnail', titleLines: 2 }, ['draft-open', 'draft-add']), btn('draft-open', 'Review', 'open_video', { id: '{id}' }), btn('draft-add', 'Add to library', 'add_to_library', { id: '{id}' }, 'primary'));
  }
  if (d.selected && d.edit) {
    const seg = d.selected.programme.segments[d.edit.segment]!;
    addSection(studioNodes, 'studio-editor', 'Programme details', `${d.selected.format === 'short' ? 'Short' : 'Show'} · ${runtime(d.selected.programme)} · ${d.selected.source} · Saved ${when(d.selected.savedAt)}${d.selected.sourceCheckedAt ? ` · Source checked ${when(d.selected.sourceCheckedAt)}` : ''} · Changes save as you type`, [n('edit-title', 'input', { label: 'Title', bind: '/edit/title' }), n('edit-segment', 'select', { label: 'Selected scene', bind: '/edit/segment', options: '{/segmentOptions}', presentation: 'dropdown' }), n('edit-heading', 'input', { label: 'Scene heading', bind: '/edit/heading' }), n('edit-text', 'textarea', { label: 'Narration', bind: '/edit/text' }), n('scene-preview', 'text', { content: `Scene ${d.edit.segment + 1} of ${d.selected.programme.segments.length}: ${seg.heading || d.selected.title} · ${wordCount(seg.text)} words · ${runtime({ title: '', segments: [seg] })}`, variant: 'caption' }), ...(d.selected.status === 'library' ? [btn('editor-unlist', 'Move to drafts', 'move_to_drafts')] : [btn('editor-add', 'Add to library', 'add_to_library', {}, 'primary')]), btn('ask-remove', 'Remove show', 'ask_remove', {}, 'danger'), ...(s.confirmRemove === d.selected.id ? [n('remove-confirm', 'alert', { title: 'Remove this show?', body: 'This removes the saved programme and its scenes from Video Studio.', tone: 'warning' }), btn('remove-cancel', 'Keep show', 'cancel_remove'), btn('remove-confirmed', 'Remove from Video Studio', 'remove_video', {}, 'danger')] : [])]);
    addSection(studioNodes, 'studio-scenes', 'Storyboard', 'Select a scene to edit its narration or cut it into a short. Use Watch in the app header to preview the programme.', [n('scene-items', 'grid', { columns: 1, searchable: true, pageSize: 12 }, rows('/selected/programme/segments', 'scene-row'))]);
    studioNodes.push(n('scene-row', 'card', { title: '{heading}', subtitle: '{kicker} · {source}' }, ['scene-edit', 'scene-short']), btn('scene-edit', 'Edit scene', 'select_scene', { index: '{index}' }), btn('scene-short', 'Make a short', 'make_short', { index: '{index}' }, 'primary'));
    studioNodes.push(n('production-workspace', 'split', { ratio: '1:2', gap: 'md' }, ['studio-scenes', 'studio-editor']));
  }
  if (d.unreadableCount) {
    const many = d.unreadableCount === 1 ? '1 saved item' : `${d.unreadableCount} saved items`;
    addSection(studioNodes, 'unreadable', 'Items that could not be read', `${many} no longer match the programme format. They are kept unchanged and are not shown in the library.`, s.confirmUnreadable ? [n('unreadable-confirm', 'alert', { title: `Remove ${many}?`, body: 'This permanently removes them from Video Studio.', tone: 'warning' }), btn('unreadable-keep', 'Keep them', 'cancel_remove'), btn('unreadable-remove', 'Remove from Video Studio', 'remove_unreadable', {}, 'danger')] : [btn('unreadable-ask', 'Remove unreadable items', 'ask_remove_unreadable', {}, 'danger')]);
  }
  if (s.notice) studioNodes.push(n('studio-notice', 'text', { content: s.notice }));
  libraryNodes.unshift(n('root', 'stack', { direction: 'vertical', gap: 'md' }, libraryNodes.filter(x => ['library-intro', 'library-list', 'library-empty'].includes(x.id)).map(x => x.id)));
  studioNodes.unshift(n('root', 'stack', { direction: 'vertical', gap: 'md' }, studioNodes.filter(x => ['creator-intro', 'unreadable', 'drafts-list', 'production-workspace', 'studio-notice'].includes(x.id)).map(x => x.id)));
  return [
    { surface: 'library', nodes: libraryNodes, data: [{ op: 'replace', path: '/', value: d }] },
    { surface: 'studio', nodes: studioNodes, data: [{ op: 'replace', path: '/', value: d }] },
  ];
}

function sourceResult(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'programme' in raw) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { content?: unknown }).content)) {
    const textBlock = (raw as { content: { text?: unknown }[] }).content.find(x => typeof x.text === 'string')?.text;
    if (typeof textBlock === 'string') { try { return sourceResult(JSON.parse(textBlock)); } catch { /* a non-JSON tool message is handled as missing data */ } }
  }
  return raw;
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
  const s = c.state = normalize(c.state), p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!action) {
    if (controlId === '/source') { if (!SOURCE.has(String(value))) throw new Error('Choose an available source app'); s.source = String(value); }
    else if (controlId === '/format') s.format = kind(value);
    else if (controlId === '/topic') s.topic = str(value, 160);
    else if (controlId === '/edit/title') {
      const v = selected(s); if (!s.edit || s.edit.id !== v.id) throw new Error('Open a show in Creator Studio first');
      s.edit.title = str(value, 80);
      if (s.edit.title) { v.title = s.edit.title; v.programme.title = s.edit.title; s.notice = ''; } else s.notice = 'A show needs a title. The last title is kept until you type a new one.';
    }
    else if (controlId === '/edit/segment') { const v = selected(s); setEdit(s, v, Number(value)); }
    else if (controlId === '/edit/heading' || controlId === '/edit/text') {
      // Edits save straight into the canonical scene, so changing scene or closing the app never loses words.
      const v = selected(s), e = s.edit; if (!e || e.id !== v.id) throw new Error('Open a scene in Creator Studio first');
      const part = v.programme.segments[e.segment]; if (!part) throw new Error('Choose a scene first');
      if (controlId === '/edit/heading') { e.heading = str(value, 300); part.heading = e.heading || 'Untitled scene'; }
      else { e.text = str(value, 4000); part.text = e.text; }
      s.notice = '';
    }
    else throw new Error('Unknown Creator Studio field');
  } else if (action === 'import_source') {
    const src = SOURCE.get(String(s.source)); if (!src) throw new Error('Choose a source app first');
    let result: unknown;
    try { result = await c.callTool(src.tool, { ...src.args }); }
    catch (error) { throw new Error(`${src.name} could not be read. Check that it is installed, turned on and allowed in Access. (${error instanceof Error ? error.message : String(error)})`.slice(0, 300)); }
    const raw = sourceResult(result);
    const envelope = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const prog = programme(envelope.programme ?? raw, src.name);
    const id = randomUUID(), video: Video = { id, title: prog.title, format: 'show', source: src.name, savedAt: new Date().toISOString(), ...(date(envelope.checkedAt) || date(envelope.retrievedAt) ? { sourceCheckedAt: date(envelope.checkedAt) ?? date(envelope.retrievedAt) } : {}), status: 'draft', programme: prog };
    addVideo(s, video); setEdit(s, video); s.notice = `Imported ${src.name} programme as a draft. Review it before adding it to your library.`;
  } else if (action === 'open_video') { const v = selected(s, p.id); setEdit(s, v); s.notice = ''; }
  else if (action === 'choose_video') { const v = selected(s, p.id); setEdit(s, v); s.notice = ''; }
  else if (action === 'select_scene') setEdit(s, selected(s), Number(p.index));
  else if (action === 'make_short') {
    const base = selected(s), index = Number(p.index), part = base.programme.segments[index]; if (!part) throw new Error('Choose a scene first');
    if (wordCount(part.text) > 120) throw new Error('This scene is longer than the 120-word short limit. Shorten its narration and try again.');
    const title = str(part.heading, 80) || `${base.title} short`;
    const { cue: _cue, break: _break, ...rest } = part;
    const short: Video = { id: randomUUID(), title, format: 'short', source: `${base.source} · ${base.title}`, savedAt: new Date().toISOString(), ...(base.sourceCheckedAt ? { sourceCheckedAt: base.sourceCheckedAt } : {}), status: 'draft', programme: { title, segments: [{ ...rest, delivery: 'story' }] } };
    addVideo(s, short); setEdit(s, short); s.notice = 'Short created from one scene. Review it before adding it to your library.';
  } else if (action === 'add_to_library') {
    const v = selected(s, p.id); if (!v.programme.segments.length) throw new Error('A programme needs at least one scene'); v.status = 'library'; s.selected = v.id; setEdit(s, v); s.notice = 'Added to your local video library. This did not post it outside Vakyartha.';
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
  else if (action === 'cancel_remove') { s.confirmRemove = undefined; s.confirmUnreadable = undefined; }
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
  return { updates: views(s), ...(action === 'add_to_library' ? { focusSurface: 'library' } : action === 'open_video' || action === 'move_to_drafts' ? { focusSurface: 'studio' } : undefined) };
}

export async function handleQuery(name: string, _params: unknown, c: Context) {
  const s = normalize(c.state);
  if (name !== 'get_creator_context') throw new Error('Unknown Video Studio query');
  return { expectedRevision: c.appRevision ?? null, selectedSource: SOURCE.get(String(s.source))?.name ?? 'News Desk', topic: s.topic ?? '', savedCount: s.videos!.length, recent: s.videos!.slice(0, 20).map(v => ({ title: v.title, format: v.format, source: v.source, status: v.status })), schema: { programme: { title: 'text', segments: [{ text: 'spoken plain text', delivery: 'opening|headline|story|aside|closing', kicker: 'section', heading: 'scene title', source: 'actual contributing app or publication', at: 'source timestamp when available', image: 'optional actual https image' }] }, format: 'show or short; short should have one or two concise scenes' }, limits: '80 scenes per show; shorts have at most two scenes and 120 spoken words; 100 local videos; 8 MB total app content; each spoken scene up to 4000 characters' };
}

export function surfaceFile() { return views({}).map(u => ({ id: u.surface, title: u.surface === 'studio' ? 'Creator Studio' : 'Video library', nodes: u.nodes, data: u.data[0]!.value })); }
export async function renderApp(context: Context) { return { updates: views(normalize(context.state)) }; }
