import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAction, handleQuery, views, type Context } from '../server.ts';
const asset = 'media:11111111-1111-1111-1111-111111111111';
function context(): Context { return { state: {}, appRevision: 4, async callTool(name) { return { checkedAt: '2026-11-09T10:00:00Z', programme: { title: name, segments: [{ text: 'The returned figure is 42.', heading: name, delivery: 'story', kicker: '', source: 'Original publisher', at: '2026-11-08T12:00:00Z', figures: [{ label: 'Value', value: '42' }] }] } }; } }; }
const act = (c: Context, action: string, value: unknown = {}) => handleAction('', value, c, action);
const field = (c: Context, name: string, value: unknown) => handleAction(name, value, c);

test('a saved project reopens with clips, source trims and independent short edits', async () => {
  const c = context(); await act(c, 'new_project');
  await field(c, '/creator/asset', asset); await field(c, '/creator/assetKind', 'video'); await field(c, '/creator/assetDuration', 12); await act(c, 'attach_clip');
  await field(c, '/creator/in', 3); await field(c, '/creator/duration', 7);
  const reopened: Context = { ...c, state: structuredClone(c.state) }; await act(reopened, 'refresh');
  const project = reopened.state.videos![0]!; const clip = project.programme.composition!.clips.find(c => c.kind === 'video')!;
  assert.equal(clip.src, asset); assert.equal(clip.in, 3); assert.equal(clip.duration, 7);
  await field(reopened, '/edit/text', Array(125).fill('word').join(' ')); await act(reopened, 'make_short', { index: 0 });
  const short = reopened.state.videos![0]!; assert.equal(short.parentId, project.id); assert.equal(short.source, project.source);
  await assert.rejects(act(reopened, 'add_to_library'), /120 words/);
  await field(reopened, '/edit/text', 'An independent short.'); await act(reopened, 'add_to_library');
  assert.equal(reopened.state.videos!.find(x => x.id === project.id)!.programme.segments[0]!.text.split(' ').length, 125);
});

test('timeline edits are atomic, undoable and recoverable from checkpoints', async () => {
  const c = context(); await act(c, 'new_project'); await act(c, 'add_scene');
  const v = c.state.videos![0]!, clip = v.programme.composition!.clips[0]!;
  await field(c, '/creator/command', { op: 'move', id: clip.id, start: 4 });
  assert.equal(c.state.videos![0]!.programme.composition!.clips[0]!.start, 4);
  await act(c, 'undo_edit'); assert.equal(c.state.videos![0]!.programme.composition!.clips[0]!.start, 0);
  await act(c, 'redo_edit'); assert.equal(c.state.videos![0]!.programme.composition!.clips[0]!.start, 4);
  await act(c, 'save_checkpoint'); await field(c, '/edit/text', 'Later edit.'); await act(c, 'restore_checkpoint');
  assert.equal(c.state.videos![0]!.programme.segments[1]!.text, '');
  const before = structuredClone(c.state); await assert.rejects(field(c, '/creator/command', { op: 'trim', id: clip.id, start: 14401, duration: 10 })); assert.deepEqual(c.state, before);
});

test('source app programmes combine exact figures and dates without changing the library snapshot', async () => {
  const c = context(); await act(c, 'new_project'); await act(c, 'append_source_news'); await act(c, 'append_source_markets');
  assert.equal(c.state.videos![0]!.programme.segments.length, 3);
  const sources = c.state.videos![0]!.programme.segments.slice(1); assert.deepEqual(sources.map(s => s.figures![0]!.value), ['42', '42']); assert.equal(sources[0]!.at, '2026-11-08T12:00:00Z');
  await act(c, 'add_to_library'); const reviewed = structuredClone(c.state.videos![0]!.accepted);
  await field(c, '/edit/text', 'Working edit.'); await act(c, 'append_source_weather');
  assert.deepEqual(c.state.videos![0]!.accepted, reviewed);
  const queue = views(c.state).find(u => u.surface === 'library')!.data[0]!.value.homeQueue as { programme: unknown }[];
  assert.deepEqual(queue[0]!.programme, reviewed!.programme);
});

test('scene proposals are saved without modifying working or reviewed content', async () => {
  const c = context(); await act(c, 'new_project'); await field(c, '/edit/text', 'Original.'); await act(c, 'add_to_library');
  const id = c.state.videos![0]!.id;
  await act(c, 'propose_edit', { videoId: id, segment: 0, text: 'Proposed.' });
  assert.equal(c.state.videos![0]!.programme.segments[0]!.text, 'Original.');
  await act(c, 'accept_edit'); assert.equal(c.state.videos![0]!.programme.segments[0]!.text, 'Proposed.'); assert.equal(c.state.videos![0]!.accepted!.programme.segments[0]!.text, 'Original.');
  const info = await handleQuery('get_creator_context', {}, c); assert.equal(info.expectedRevision, 4);
});

test('measured narration ripples linked title and caption clips without stretching source video', async () => {
  const c = context(); await act(c, 'new_project'); await act(c, 'add_scene');
  const p = c.state.videos![0]!.programme.composition!, second = p.clips.find(c => c.kind === 'narration' && c.segment === 1)!;
  await act(c, 'prepared_timings', { timings: [{ segment: 1, duration: 8 }] });
  const after = c.state.videos![0]!.programme.composition!.clips.filter(c => c.segment === 1);
  assert.ok(after.every(c => c.duration === 8)); assert.equal(second.start, 3);
});


test('empty project narration has a timed slot and unequal scene reorder preserves non-overlap', async () => {
  const c = context(); await act(c, 'new_project'); await field(c, '/edit/text', 'The opening now has narration.');
  assert.ok(c.state.videos![0]!.programme.composition!.clips.some(c => c.kind === 'narration' && c.segment === 0));
  await act(c, 'add_scene'); await act(c, 'prepared_timings', { timings: [{ segment: 1, duration: 8 }] });
  await act(c, 'scene_up');
  const clips = c.state.videos![0]!.programme.composition!.clips;
  assert.ok(clips.filter(c => c.segment === 0).every(c => c.start === 0 && c.duration === 8));
  assert.ok(clips.filter(c => c.segment === 1).every(c => c.start === 8 && c.duration === 3));
});

test('invalid accepted snapshots remain recoverable as unreadable records', async () => {
  const c = context(); await act(c, 'new_project'); await act(c, 'add_to_library');
  c.state.videos![0]!.accepted!.programme.segments = [];
  await act(c, 'refresh');
  assert.equal(c.state.unreadable!.length, 1); assert.equal(c.state.videos!.length, 0);
});


test('real host text envelopes and MCP content carry source programmes without executing prose', async () => {
  for (const wrap of [(r: unknown) => JSON.stringify(r), (r: unknown) => ({ text: JSON.stringify(r), isError: false }), (r: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(r) }] })]) {
    const c = context(), source = c.callTool; c.callTool = async (...args) => wrap(await source(...args));
    await act(c, 'new_project'); await act(c, 'append_source_news');
    assert.equal(c.state.videos![0]!.programme.segments[1]!.figures![0]!.value, '42');
  }
});


test('a timeline rendered from an older programme accepts its displayed clip id', async () => {
  const c = context();
  c.state.videos = [{ id: 'old', title: 'Saved show', source: 'News Desk', savedAt: '2026-11-08T12:00:00Z', status: 'library', format: 'show', programme: { title: 'Saved show', segments: [{ text: 'Retained narration.', heading: 'Opening', delivery: 'story', kicker: '' }] } }];
  const studio = views(c.state).find(view => view.surface === 'studio')!;
  const timeline = studio.nodes.find(node => node.type === 'mediatrack')!;
  const shown = (timeline.props!.clips as { id: string }[])[0]!;
  await field(c, '/creator/command', { op: 'select', id: shown.id });
  assert.equal(c.state.creator!.clip, shown.id);
  await field(c, '/creator/command', { op: 'move', id: shown.id, start: 1 });
  assert.equal(c.state.videos![0]!.programme.composition!.clips.find(clip => clip.id === shown.id)!.start, 1);
  assert.equal(c.state.videos![0]!.accepted!.programme.composition, undefined);
});
