import { randomUUID } from 'node:crypto';
import { parseComposition, type Composition, type CompositionClip, type ClipKind } from './composition.ts';
import type { State, Video, Programme, Context, Segment } from './server.ts';

export interface Snapshot { title: string; programme: Programme; at: string; name?: string }
export interface ProjectHistory { past: Snapshot[]; future: Snapshot[]; checkpoints: Snapshot[] }
export interface CreatorState { panel: string; clip: string; cursor: number; command: Record<string, unknown>; asset: string; assetKind: string; assetTitle: string; assetDuration: number; checkpoint: string; target: number }
type Rec = Record<string, unknown>;
type Node = { id: string; type: string; props?: Rec; children?: string[] | { each: string; template: string } };
type Source = { id: string; name: string; tool: string; args: Rec };
const text = (v: unknown, max = 120) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const number = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const snapshot = (v: Video, name?: string): Snapshot => ({ title: v.title, programme: structuredClone(v.programme), at: new Date().toISOString(), ...(name ? { name } : {}) });
export function normalizeCreator(raw?: Partial<CreatorState>): CreatorState { return { panel: text(raw?.panel) || 'scene', clip: text(raw?.clip, 80), cursor: Math.max(0, number(raw?.cursor)), command: {}, asset: text(raw?.asset, 80), assetKind: text(raw?.assetKind), assetTitle: text(raw?.assetTitle), assetDuration: Math.max(.1, Math.min(14400, number(raw?.assetDuration, 10))), checkpoint: text(raw?.checkpoint, 60), target: Math.max(1, Math.min(600, number(raw?.target, 45))) }; }
export function retainProject(x: Video) { return { ...(x.proposal ? { proposal: structuredClone(x.proposal) } : {}), ...(x.accepted ? { accepted: structuredClone(x.accepted) } : {}), ...(x.parentId ? { parentId: text(x.parentId, 80) } : {}), history: { past: (x.history?.past ?? []).slice(-12), future: (x.history?.future ?? []).slice(-12), checkpoints: (x.history?.checkpoints ?? []).slice(-8) } }; }
export function remember(v: Video) { if (v.status === 'library' && !v.accepted) v.accepted = snapshot(v); const h = v.history ??= { past: [], future: [], checkpoints: [] }; h.past.push(snapshot(v)); h.past = h.past.slice(-12); h.future = []; }
const wordCount = (p: Programme) => p.segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
export function accept(v: Video) {
  if (v.format === 'short' && wordCount(v.programme) > 120) throw Error('Short narration exceeds 120 words. Edit this independent draft before adding it to the library.');
  if (!v.programme.segments.length) throw Error('Add a scene first');
  if (v.programme.composition) v.programme.composition = parseComposition(v.programme.composition, v.programme.segments.length);
  v.accepted = snapshot(v); v.status = 'library';
}
export function composition(v: Video): Composition {
  if (v.programme.composition) return v.programme.composition;
  let start = 0; const clips: CompositionClip[] = [];
  v.programme.segments.forEach((s, segment) => {
    const duration = Math.max(3, s.text.split(/\s+/).filter(Boolean).length / 2.5);
    const add = (kind: ClipKind, track: string, src?: string) => clips.push({ id: randomUUID(), label: s.heading || kind, kind, track, start, duration, in: 0, segment, ...(src ? { src } : {}), volume: 1, fadeIn: 0, fadeOut: 0, loop: false, muted: false, fit: 'contain', x: 50, y: 50 });
    if (s.text) { add('narration', 'voice'); add('caption', 'captions'); }
    add(s.image ? 'image' : s.chart ? 'chart' : s.figures?.length ? 'figures' : 'title', 'visual', s.image);
    start += duration;
  });
  return v.programme.composition = { portrait: v.format === 'short', duration: Math.max(.1, start), clips, captions: true };
}
function selected(s: State) { const v = s.videos?.find(v => v.id === s.selected); if (!v) throw Error('Open or create a project first'); return v; }
function editScene(s: State, v: Video, i = 0) { const part = v.programme.segments[i]; if (!part) throw Error('Choose a scene'); s.selected = v.id; s.edit = { id: v.id, title: v.title, segment: i, heading: part.heading, text: part.text }; }
function duration(p: Composition) { p.duration = Math.max(.1, ...p.clips.map(c => c.start + c.duration)); }
function addClip(p: Composition, kind: ClipKind, label: string, start: number, length: number, extra: Partial<CompositionClip> = {}) { const c: CompositionClip = { id: randomUUID(), kind, label, track: kind === 'audio' ? 'music' : kind === 'narration' ? 'voice' : kind === 'caption' ? 'captions' : 'visual', start, duration: length, in: 0, volume: kind === 'audio' ? .18 : 1, fadeIn: 0, fadeOut: 0, loop: false, muted: false, fit: 'contain', x: 50, y: 50, ...extra }; p.clips.push(c); duration(p); return c; }

export async function creatorAction(controlId: string, value: unknown, c: Context, action: string | undefined, sources: readonly Source[], validate: (r: unknown, title: string, imported?: boolean) => Programme): Promise<boolean> {
  const s = c.state, ui = s.creator ??= normalizeCreator(), args = value && typeof value === 'object' ? value as Rec : {};
  if (!action && controlId.startsWith('/creator/')) {
    const field = controlId.slice(9);
    if (field === 'command') {
      const v = selected(s), p = composition(v), clip = p.clips.find(c => c.id === args.id);
      ui.cursor = Math.max(0, Math.min(p.duration, number(args.cursor ?? args.time, ui.cursor)));
      if (args.op === 'seek') return true;
      if (args.op === 'select') { if (clip) { ui.clip = clip.id; ui.panel = 'clip'; if (clip.segment !== undefined) editScene(s, v, clip.segment); } return true; }
      if (!clip) throw Error('Choose an existing timeline clip');
      remember(v);
      if (args.op === 'remove') p.clips = p.clips.filter(c => c.id !== clip.id);
      else if (args.op === 'move' || args.op === 'trim') { clip.start = Math.max(0, number(args.start, clip.start)); if (args.op === 'trim') { clip.duration = Math.max(.05, number(args.duration, clip.duration)); clip.in = Math.max(0, number(args.in, clip.in)); } }
      else throw Error('Unknown timeline edit');
      duration(p); parseComposition(p, v.programme.segments.length); return true;
    }
    if (['asset', 'assetKind', 'assetTitle', 'checkpoint'].includes(field)) { (ui as unknown as Rec)[field] = text(value, field === 'asset' ? 80 : 120); return true; }
    if (['assetDuration', 'target'].includes(field)) { (ui as unknown as Rec)[field] = Math.max(.1, Math.min(14400, number(value, 10))); return true; }
    const v = selected(s), p = composition(v), clip = p.clips.find(c => c.id === ui.clip);
    if (!clip) throw Error('Select a timeline clip first');
    remember(v);
    if (['start', 'duration', 'in', 'volume', 'fadeIn', 'fadeOut', 'x', 'y'].includes(field)) (clip as unknown as Rec)[field] = number(value);
    else if (['loop', 'muted', 'solo', 'fit'].includes(field)) (clip as unknown as Rec)[field] = value;
    else throw Error('Unknown clip field');
    duration(p); v.programme.composition = parseComposition(p, v.programme.segments.length); return true;
  }
  if (!action) return false;
  if (action === 'propose_edit') {
    if (c.appRevision === undefined) throw Error('Read creator context for the current revision first');
    const v = s.videos?.find(v => v.id === args.videoId), index = Number(args.segment);
    if (!v || !Number.isInteger(index) || !v.programme.segments[index]) throw Error('Choose an existing project scene');
    v.proposal = { segment: index, heading: text(args.heading, 300) || v.programme.segments[index]!.heading, text: text(args.text, 4000) };
    s.selected = v.id; ui.panel = 'proposal'; s.notice = 'Scene proposal saved for review. The scene is unchanged.'; return true;
  }
  if (action === 'accept_edit' || action === 'discard_edit') {
    const v = selected(s), proposal = v.proposal; if (!proposal) throw Error('No scene proposal to review');
    if (action === 'accept_edit') { remember(v); const part = v.programme.segments[proposal.segment]; if (!part) throw Error('The proposed scene no longer exists'); part.heading = proposal.heading; part.text = proposal.text; editScene(s, v, proposal.segment); }
    delete v.proposal; ui.panel = 'scene'; return true;
  }
  if (action.startsWith('panel_')) { ui.panel = action.slice(6); return true; }
  if (action === 'new_project') {
    if ((s.videos?.length ?? 0) >= 100) throw Error('Remove an item before creating another');
    const v: Video = { id: randomUUID(), title: text(s.topic, 80) || 'Untitled production', source: 'Video Studio', savedAt: new Date().toISOString(), status: 'draft', format: s.format === 'short' ? 'short' : 'show', programme: { title: text(s.topic, 80) || 'Untitled production', segments: [{ text: '', heading: 'Opening', delivery: 'opening', kicker: '' }] } };
    s.videos ??= []; s.videos.unshift(v); composition(v); editScene(s, v); ui.panel = 'scene'; return true;
  }
  if (action.startsWith('append_source_')) {
    const source = sources.find(x => x.id === action.slice(14)); if (!source) throw Error('Choose a declared source');
    const v = selected(s); const raw = await c.callTool(source.tool, { ...source.args });
    let envelope: Rec = raw && typeof raw === 'object' ? raw as Rec : {};
    if (Array.isArray(envelope.content)) { const block = envelope.content.find((b: Rec) => typeof b.text === 'string'); if (block) envelope = JSON.parse(block.text); }
    const imported = validate(envelope.programme ?? envelope, source.name), p = composition(v), offset = v.programme.segments.length;
    if (offset + imported.segments.length > 80) throw Error('A project holds at most 80 scenes');
    remember(v); v.programme.segments.push(...imported.segments.map(x => ({ ...x, sourceApp: source.name, ...(typeof envelope.checkedAt === 'string' && Number.isFinite(Date.parse(envelope.checkedAt)) ? { checkedAt: envelope.checkedAt } : {}), source: x.source || source.name })));
    const temp = composition({ ...v, programme: imported });
    for (const clip of temp.clips) p.clips.push({ ...clip, start: clip.start + p.duration, segment: clip.segment === undefined ? undefined : clip.segment + offset });
    duration(p); editScene(s, v, offset); ui.panel = 'scene'; s.notice = `Added ${source.name} as retained source material. Existing edits and library version are unchanged.`; return true;
  }
  if (!['add_scene', 'duplicate_scene', 'delete_scene', 'scene_up', 'scene_down', 'undo_edit', 'redo_edit', 'save_checkpoint', 'restore_checkpoint', 'attach_clip', 'duplicate_clip', 'split_clip', 'delete_clip', 'close_gap', 'portrait', 'landscape', 'toggle_captions', 'toggle_loop', 'prepared_timings'].includes(action)) return false;
  const v = selected(s), p = composition(v), i = s.edit?.segment ?? 0, part = v.programme.segments[i]!, clip = p.clips.find(c => c.id === ui.clip);
  const h = v.history ??= { past: [], future: [], checkpoints: [] };
  if (action === 'undo_edit' || action === 'redo_edit') { const source = action === 'undo_edit' ? h.past : h.future, target = action === 'undo_edit' ? h.future : h.past, next = source.pop(); if (!next) return true; target.push(snapshot(v)); v.title = next.title; v.programme = structuredClone(next.programme); editScene(s, v, Math.min(i, v.programme.segments.length - 1)); return true; }
  if (action === 'save_checkpoint') { h.checkpoints.push(snapshot(v, ui.checkpoint || `Checkpoint ${h.checkpoints.length + 1}`)); h.checkpoints = h.checkpoints.slice(-8); s.notice = 'Checkpoint saved'; return true; }
  remember(v);
  if (action === 'restore_checkpoint') { const next = h.checkpoints[number(args.index, h.checkpoints.length - 1)]; if (!next) throw Error('Choose a checkpoint'); v.title = next.title; v.programme = structuredClone(next.programme); editScene(s, v); return true; }
  if (action === 'portrait' || action === 'landscape') p.portrait = action === 'portrait';
  else if (action === 'toggle_captions') p.captions = !p.captions;
  else if (action === 'toggle_loop') p.loop = p.loop ? undefined : { start: clip?.start ?? 0, end: clip ? clip.start + clip.duration : p.duration };
  else if (action === 'attach_clip') {
    if (!ui.asset || !['video', 'audio', 'image'].includes(ui.assetKind)) throw Error('Choose or attach an image, audio or video asset');
    const next = addClip(p, ui.assetKind as ClipKind, ui.assetTitle || ui.assetKind, ui.cursor, ui.assetDuration, { src: ui.asset }); ui.clip = next.id; ui.panel = 'clip';
  } else if (action === 'add_scene' || action === 'duplicate_scene') {
    if (v.programme.segments.length >= 80) throw Error('At most 80 scenes');
    const next: Segment = action === 'duplicate_scene' ? structuredClone(part) : { text: '', heading: 'New scene', kicker: '', delivery: 'story' }, index = v.programme.segments.length;
    v.programme.segments.push(next); const length = Math.max(3, next.text.split(/\s+/).filter(Boolean).length / 2.5), start = p.duration;
    addClip(p, next.image ? 'image' : 'title', next.heading, start, length, { segment: index, ...(next.image ? { src: next.image } : {}) });
    addClip(p, 'narration', next.heading, start, length, { segment: index }); addClip(p, 'caption', next.heading, start, length, { segment: index }); editScene(s, v, index);
  } else if (action === 'delete_scene') {
    if (v.programme.segments.length < 2) throw Error('Keep at least one scene');
    v.programme.segments.splice(i, 1); p.clips = p.clips.filter(c => c.segment !== i).map(c => ({ ...c, ...(c.segment !== undefined && c.segment > i ? { segment: c.segment - 1 } : {}) })); editScene(s, v, Math.min(i, v.programme.segments.length - 1));
  } else if (action === 'scene_up' || action === 'scene_down') {
    const j = i + (action === 'scene_up' ? -1 : 1); if (!v.programme.segments[j]) return true;
    const a = p.clips.filter(c => c.segment === i), b = p.clips.filter(c => c.segment === j), at = Math.min(...a.map(c => c.start)), bt = Math.min(...b.map(c => c.start));
    [v.programme.segments[i], v.programme.segments[j]] = [v.programme.segments[j]!, part];
    for (const c of a) { c.segment = j; c.start = Math.max(0, c.start + bt - at); } for (const c of b) { c.segment = i; c.start = Math.max(0, c.start + at - bt); } editScene(s, v, j);
  } else if (action === 'prepared_timings') {
    if (!Array.isArray(args.timings)) throw Error('No measured speech timing was returned');
    for (const row of args.timings as Rec[]) {
      const voice = p.clips.find(c => c.segment === row.segment && c.kind === 'narration'); if (!voice) continue;
      const measured = Math.max(.05, Math.min(14400, number(row.duration, voice.duration))), oldLength = voice.duration, oldEnd = voice.start + voice.duration, delta = measured - voice.duration;
      for (const c of p.clips) {
        if (c.segment === row.segment && !['video', 'audio'].includes(c.kind) && c.duration === oldLength) c.duration = measured;
        else if (c.segment !== row.segment && c.start >= oldEnd - .0001) c.start = Math.max(0, c.start + delta);
      }
      voice.duration = measured;
    }
    s.notice = 'Measured narration lengths applied. Review overlaps and visual holds before accepting.';
  } else {
    if (!clip) throw Error('Select a timeline clip');
    if (action === 'duplicate_clip') { const next = { ...clip, id: randomUUID(), start: clip.start + clip.duration }; p.clips.push(next); ui.clip = next.id; }
    if (action === 'delete_clip' || action === 'close_gap') { p.clips = p.clips.filter(c => c.id !== clip.id); if (action === 'close_gap') for (const c of p.clips) if (c.start >= clip.start + clip.duration) c.start -= clip.duration; }
    if (action === 'split_clip') { const at = ui.cursor - clip.start; if (at <= .05 || at >= clip.duration - .05) throw Error('Move the playhead inside the clip to split it'); p.clips.push({ ...clip, id: randomUUID(), start: ui.cursor, in: clip.in + at, duration: clip.duration - at }); clip.duration = at; }
  }
  duration(p); v.programme.composition = parseComposition(p, v.programme.segments.length); return true;
}

export function creatorView(s: State, sources: readonly Source[]): { nodes: Node[]; data: Rec } {
  const ui = s.creator ?? normalizeCreator(), v = s.videos?.find(v => v.id === s.selected);
  if (v?.status === 'library' && !v.accepted) v.accepted = snapshot(v);
  const p = v ? composition(v) : undefined, part = v?.programme.segments[s.edit?.segment ?? 0], clip = p?.clips.find(c => c.id === ui.clip);
  const nodes: Node[] = [], node = (id: string, type: string, props: Rec = {}, children?: Node['children']) => { nodes.push({ id, type, props, ...(children ? { children } : {}) }); return id; };
  const button = (id: string, label: string, action: string, glyph: string, payload: Rec = {}, extra: Rec = {}) => node(id, 'button', { label, action, glyph, iconOnly: true, style: 'link', payload, ...extra });
  const row = (id: string, children: string[], region?: string) => node(id, 'stack', { direction: 'horizontal', wrap: true, gap: 'sm', ...(region ? { region } : {}) }, children);
  const field = (id: string, label: string, bind: string, kind?: string) => node(id, kind === 'textarea' ? 'textarea' : 'input', { label, bind, ...(kind && kind !== 'textarea' ? { kind } : {}) });
  const toolbar = row('production-toolbar', [button('new', 'New project', 'new_project', 'plus'), button('projects', 'Projects', 'panel_projects', 'folder'), button('sources', 'Sources from apps', 'panel_sources', 'globe'), button('media', 'Media', 'panel_media', 'film'), button('scene', 'Scene properties', 'panel_scene', 'sliders'), button('history', 'History and checkpoints', 'panel_history', 'clock'), ...(s.unreadable?.length ? [button('unreadable', `${s.unreadable.length} unreadable saved items`, 'panel_unreadable', 'alert')] : []), button('assistant', 'Create with assistant', 'assistant.compose', 'bolt', { path: 'authorRequest', workflowPath: 'authorWorkflow' }), ...(v ? [button('undo', 'Undo', 'undo_edit', 'undo', {}, { disabled: !v.history?.past.length }), button('redo', 'Redo', 'redo_edit', 'redo', {}, { disabled: !v.history?.future.length }), button('accept', 'Review and add to library', 'add_to_library', 'check'), button('short', 'Create independent short', 'make_short', 'scissors', { index: s.edit?.segment ?? 0 })] : [])], 'toolbar');
  let sidebar: string[] = [];
  if (ui.panel === 'unreadable') sidebar = [node('unreadable-warning', 'alert', { title: 'Unreadable saved items', body: `${s.unreadable?.length ?? 0} items are retained unchanged. Removing them is permanent.`, tone: 'warning' }), ...(s.confirmUnreadable ? [button('unreadable-keep', 'Keep items', 'cancel_remove', 'close'), button('unreadable-remove', 'Confirm removal', 'remove_unreadable', 'trash')] : [button('unreadable-ask', 'Review removal', 'ask_remove_unreadable', 'trash')])];
  else if (ui.panel === 'projects' || !v && ui.panel !== 'sources') {
    sidebar = [field('brief', 'Production brief', '/topic'), node('new-format', 'select', { label: 'Format', bind: '/format', options: [{ label: 'Show', value: 'show' }, { label: 'Short', value: 'short' }], presentation: 'dropdown' }), button('create-project', 'Create project', 'new_project', 'plus'), node('project-list', 'grid', { columns: 1, pageSize: 8, searchable: true }, { each: '/projects', template: 'project-row' })];
    node('project-row', 'card', { title: '{title}', subtitle: '{status}' }, ['project-open']); button('project-open', 'Open project', 'open_video', 'film', { id: '{id}' });
  } else if (ui.panel === 'sources') sidebar = sources.map(source => button(`source-${source.id}`, `Add saved ${source.name} material`, v ? `append_source_${source.id}` : `import_${source.id}`, 'plus'));
  else if (ui.panel === 'media') sidebar = [button('import-asset', 'Import media', 'media.attach', 'plus', { into: 'creator/asset', kindInto: 'creator/assetKind', titleInto: 'creator/assetTitle', durationInto: 'creator/assetDuration', kinds: ['image', 'audio', 'video'] }), button('pick-asset', 'Choose saved Media', 'media.pick', 'folder', { into: 'creator/asset', kindInto: 'creator/assetKind', titleInto: 'creator/assetTitle', durationInto: 'creator/assetDuration' }), field('asset-title', 'Asset title', '/creator/assetTitle'), field('asset-duration', 'Duration in seconds', '/creator/assetDuration', 'number'), button('attach-clip', 'Add asset to timeline', 'attach_clip', 'plus')];
  else sidebar = [row('scene-tools', [button('add-scene', 'Add scene', 'add_scene', 'plus'), button('copy-scene', 'Duplicate scene', 'duplicate_scene', 'copy'), button('remove-scene', 'Delete scene', 'delete_scene', 'trash'), button('up-scene', 'Move scene earlier', 'scene_up', 'arrow'), button('down-scene', 'Move scene later', 'scene_down', 'arrow')]), node('scene-items', 'grid', { columns: 1, pageSize: 8, searchable: true }, { each: '/selected/programme/segments', template: 'scene-row' })];
  if (v && !['projects', 'sources', 'media', 'unreadable'].includes(ui.panel)) { node('scene-row', 'card', { title: '{heading}', subtitle: '{source}' }, ['scene-edit']); button('scene-edit', 'Edit scene', 'select_scene', 'film', { index: '{index}' }); }
  const side = node('production-sidebar', 'stack', { region: 'sidebar', gap: 'sm' }, sidebar);
  const preview = node('production-preview', 'stack', { region: 'preview', gap: 'sm' }, [node('programme-stage', 'stage', { value: v ? '{/selected/programme}' : { title: 'Create a project', segments: [] }, label: 'Programme preview' }), row('transport', [button('play', 'Play programme in place', 'voice.play', 'play', { programme: v ? '{/selected/programme}' : {}, time: '{/creator/cursor}' }, { disabled: !v }), button('watch-scene', 'Watch from this scene', 'voice.watch', 'eye', { queue: v ? '{/selected/programme}' : {}, from: s.edit?.segment ?? 0, portrait: p?.portrait === true }, { disabled: !v }), button('pause', 'Pause or continue', 'voice.pause', 'pause'), button('stop', 'Stop', 'voice.stop', 'stop'), button('measure', 'Prepare and measure narration', 'voice.prepare', 'clock', { programme: v ? '{/selected/programme}' : {}, result: 'prepared_timings' }, { disabled: !v }), button('landscape', 'Landscape', 'landscape', 'film', {}, { pressed: !p?.portrait }), button('portrait', 'Portrait', 'portrait', 'film', {}, { pressed: p?.portrait === true }), button('captions', 'Captions', 'toggle_captions', 'info', {}, { pressed: p?.captions === true }), button('loop', 'Loop selected clip or programme', 'toggle_loop', 'redo', {}, { pressed: !!p?.loop })])]);
  let inspector: string[] = [];
  if (v?.proposal && ui.panel === 'proposal') inspector = [node('proposed-heading', 'text', { content: v.proposal.heading, variant: 'subheading' }), node('proposed-text', 'text', { content: v.proposal.text }), row('proposal-actions', [button('proposal-accept', 'Accept scene proposal', 'accept_edit', 'check'), button('proposal-discard', 'Discard scene proposal', 'discard_edit', 'close')])];
  else if (v && ui.panel === 'history') inspector = [field('checkpoint-name', 'Checkpoint name', '/creator/checkpoint'), button('checkpoint-save', 'Save checkpoint', 'save_checkpoint', 'save'), ...v.history?.checkpoints.map((x, index) => button(`checkpoint-${index}`, `Restore ${x.name || x.at}`, 'restore_checkpoint', 'undo', { index })) ?? []];
  else if (clip && ui.panel === 'clip') inspector = [node('clip-label', 'text', { content: clip.label, variant: 'subheading' }), ...['start', 'duration', 'in', 'volume', 'fadeIn', 'fadeOut', 'x', 'y'].map(key => field(`clip-${key}`, ({ start: 'Timeline start (s)', duration: 'Duration (s)', in: 'Source in (s)', volume: 'Volume (0–1)', fadeIn: 'Fade in (s)', fadeOut: 'Fade out (s)', x: 'Focal X (%)', y: 'Focal Y (%)' } as Rec)[key] as string, `/creator/${key}`, 'number')), node('clip-fit', 'select', { label: 'Framing', bind: '/creator/fit', options: [{label:'Fit', value:'contain'}, {label:'Fill', value:'cover'}], presentation: 'dropdown' }), node('clip-muted', 'checkbox', { label: 'Mute clip', bind: '/creator/muted' }), node('clip-solo', 'checkbox', { label: 'Solo clip', bind: '/creator/solo' }), node('clip-loop', 'checkbox', { label: 'Loop source', bind: '/creator/loop' }), row('clip-tools', [button('split-clip', 'Split at playhead', 'split_clip', 'scissors'), button('copy-clip', 'Duplicate clip', 'duplicate_clip', 'copy'), button('delete-clip', 'Remove clip', 'delete_clip', 'trash'), button('gap-clip', 'Remove clip and close gap', 'close_gap', 'close')])];
  else if (v) inspector = [field('edit-title', 'Project title', '/edit/title'), field('edit-heading', 'Scene heading', '/edit/heading'), field('edit-text', 'Narration', '/edit/text', 'textarea'), node('scene-source', 'text', { content: [part?.sourceApp, part?.source, part?.at ? new Date(part.at).toLocaleString('en-GB') : '', part?.link ? `[Read source](${part.link})` : ''].filter(Boolean).join(' · '), variant: 'caption' })];
  if (!inspector.length) inspector.push(node('inspector-empty', 'text', { content: 'Select or create a project to edit it.', variant: 'caption' }));
  const inspect = node('production-inspector', 'stack', { region: 'inspector', gap: 'sm' }, inspector);
  const tracks = [{ id: 'visual', label: 'Video / images' }, { id: 'voice', label: 'Narration', kind: 'audio' }, { id: 'music', label: 'Music', kind: 'audio' }, { id: 'captions', label: 'Captions' }];
  const timeline = node('production-timeline', 'mediatrack', { region: 'timeline', label: 'Production timeline', duration: p?.duration ?? 1, clips: p?.clips ?? [], tracks, selected: ui.clip, cursor: ui.cursor, bind: '/creator/command' });
  const status = node('production-status', 'text', { region: 'status', content: s.notice || (v ? `${v.title} · autosaved · ${p?.duration.toFixed(1)} s timeline · narration estimates until measured${v.accepted ? ' · library keeps the reviewed version' : ''}` : 'Create a project or import source material'), variant: 'caption' });
  node('root', 'workspace', { label: 'Video Studio editor' }, [toolbar, side, preview, inspect, timeline, status]);
  const data: Rec = { creator: { ...ui, ...(clip ? { start: clip.start, duration: clip.duration, in: clip.in, volume: clip.volume, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, x: clip.x, y: clip.y, fit: clip.fit, muted: clip.muted, solo: clip.solo === true, loop: clip.loop } : {}) }, projects: s.videos?.map(v => ({ id: v.id, title: v.title, status: v.status })) ?? [] };
  return { nodes, data };
}

export function shortComposition(base: Video, index: number): Composition {
  const p = composition(base), scene = p.clips.filter(c => c.segment === index), start = Math.min(...scene.map(c => c.start)), end = Math.max(...scene.map(c => c.start + c.duration));
  const clips = p.clips.flatMap(c => { const a = Math.max(start, c.start), b = Math.min(end, c.start + c.duration); if (b <= a || c.segment !== undefined && c.segment !== index) return []; return [{ ...c, id: randomUUID(), start: a - start, duration: b - a, in: c.in + a - c.start, ...(c.segment !== undefined ? { segment: 0 } : {}) }]; });
  return { portrait: true, duration: end - start, clips, captions: p.captions };
}
