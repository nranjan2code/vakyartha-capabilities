import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAction, handleQuery, programme, renderApp, surfaceFile, views, type Context, type Programme, type Segment, type State } from '../server.ts';

const scene: Segment = { text: 'A source-backed sentence.', delivery: 'story', heading: 'The story', kicker: 'News', source: 'Publisher', at: '2026-11-04T10:00:00.000Z' };
const sample: Programme = { title: 'A source show', segments: [scene] };
function context(state: State = {}, source: unknown = { programme: sample }, appRevision = 3): Context {
  return { state, appRevision, async callTool(name) { assert.equal(name, 'app-news-desk__get_bulletin'); return source; } };
}

test('validates actual source programme and rejects missing scenes', () => {
  assert.equal(programme(sample, 'Fallback').segments.length, 1);
  assert.throws(() => programme({ title: 'Empty', segments: [] }, 'Fallback'), /no saved programme/);
  assert.throws(() => programme({ segments: Array.from({ length: 81 }, () => scene) }, 'Fallback'), /more than 80 scenes/);
});

test('imports one selected source as a local review draft and keeps its freshness time', async () => {
  const checkedAt = '2026-11-04T09:30:00.000Z';
  const c = context({ source: 'news' }, { checkedAt, programme: sample });
  await handleAction('', {}, c, 'import_news');
  assert.equal(c.state.videos?.[0]?.status, 'draft');
  assert.equal(c.state.videos?.[0]?.source, 'News Desk');
  assert.equal(c.state.videos?.[0]?.sourceCheckedAt, checkedAt);
  assert.equal(c.state.videos?.[0]?.programme.segments[0]?.source, 'Publisher');
  assert.equal((await renderApp(c)).updates.length, 4);
});

test('edits a scene, makes a separate short, and adds it only by explicit action', async () => {
  const c = context({ videos: [{ id: 'source-1', title: 'Show', format: 'show', source: 'News Desk', savedAt: '2026-11-04T10:00:00.000Z', status: 'draft', programme: sample }], selected: 'source-1' });
  await handleAction('', { id: 'source-1' }, c, 'open_video');
  await handleAction('/edit/text', 'Reviewed words.', c);
  await handleAction('', { index: 0 }, c, 'make_short');
  assert.equal(c.state.videos?.[0]?.format, 'short');
  assert.equal(c.state.videos?.[0]?.programme.segments[0]?.text, 'Reviewed words.');
  assert.equal(c.state.videos?.[1]?.programme.segments[0]?.text, 'Reviewed words.');
  assert.equal(c.state.videos?.[0]?.programme.segments.length, 1);
  await handleAction('', { id: c.state.videos?.[0]?.id }, c, 'add_to_library');
  assert.equal(c.state.videos?.[0]?.status, 'library');
});

test('assistant proposals rely on the host-validated revision and stay drafts', async () => {
  const c = context({}, undefined, 7);
  await handleAction('', { title: 'Show', source: 'News Desk', format: 'show', programme: sample }, c, 'propose_video');
  assert.equal(c.state.videos?.[0]?.status, 'draft');
  await assert.rejects(handleAction('', { title: 'Unsupported', source: 'Other app', format: 'show', programme: sample }, c, 'propose_video'), /declared source app/);
  assert.equal((await handleQuery('get_creator_context', {}, c)).expectedRevision, 7);
});

test('removal requires an explicit review step', async () => {
  const c = context({ videos: [{ id: 'source-1', title: 'Show', format: 'show', source: 'News Desk', savedAt: '2026-11-04T10:00:00.000Z', status: 'library', programme: sample }], selected: 'source-1' });
  await handleAction('', { id: 'source-1' }, c, 'open_video');
  await assert.rejects(handleAction('', {}, c, 'remove_video'), /Review the removal/);
  await handleAction('', {}, c, 'ask_remove');
  await handleAction('', {}, c, 'remove_video');
  assert.equal(c.state.videos?.length, 0);
});

test('initial surface and retained state render every view', () => {
  assert.deepEqual(views({}).map(x => x.surface), ['library', 'shorts', 'playlists', 'studio']);
  assert.equal(views({ videos: [] }).flatMap(x => x.nodes).some(x => x.id === 'library-create'), true);
  const saved = JSON.parse(readFileSync(resolve(import.meta.dirname, '../surface.json'), 'utf8'));
  assert.deepEqual(saved, surfaceFile());
  const all = views({ videos: [{ id: 'source-1', title: 'Show', format: 'show', source: 'News Desk', savedAt: '2026-11-04T10:00:00.000Z', status: 'library', programme: sample }] });
  const studio = all.find(x => x.surface === 'studio')!;
  const library = all.find(x => x.surface === 'library')!.data[0]!.value.homeRows as Record<string, unknown>[];
  assert.equal('programme' in library[0]!, false);
  assert.equal(studio.nodes.some(x => x.id === 'root' && x.type === 'workspace'), true);
  assert.equal(studio.nodes.some(x => x.id === 'scene-items' && x.type === 'grid'), true);
});

const two: Programme = { title: 'Two scenes', segments: [{ ...scene, heading: 'First' }, { ...scene, heading: 'Second', text: 'Second words.' }] };
const saved = (status: 'draft' | 'library' = 'draft', extra: Record<string, unknown> = {}) => ({ id: 'v1', title: 'Show', format: 'show' as const, source: 'News Desk', savedAt: '2026-11-04T10:00:00.000Z', status, programme: structuredClone(two), ...extra });

test('a person\'s own words survive reloads, while imported text loses only tags and links', async () => {
  const c = context({ videos: [saved()], selected: 'v1' });
  await handleAction('', { id: 'v1' }, c, 'open_video');
  await handleAction('/edit/text', 'C# tips: #1 pick > the rest, *really*', c);
  await handleAction('/edit/title', 'Top_5 #picks', c);
  const again = context(structuredClone(c.state));
  await renderApp(again); await handleAction('', {}, again, 'refresh');
  assert.equal(again.state.videos?.[0]?.programme.segments[0]?.text, 'C# tips: #1 pick > the rest, *really*');
  assert.equal(again.state.videos?.[0]?.title, 'Top_5 #picks');
  const imported = programme({ title: '<b>C# news</b>', segments: [{ text: 'Read <i>more</i> at https://example.com/x today #1', heading: 'H', delivery: 'story' }] }, 'Fallback');
  assert.equal(imported.title, 'C# news');
  assert.equal(imported.segments[0]?.text, 'Read more at today #1');
});

test('switching scenes never loses narration because edits save as they change', async () => {
  const c = context({ videos: [saved()], selected: 'v1' });
  await handleAction('', { id: 'v1' }, c, 'open_video');
  await handleAction('/edit/text', 'Unsaved before switching.', c);
  await handleAction('/edit/segment', '1', c);
  await handleAction('', { index: 0 }, c, 'select_scene');
  assert.equal(c.state.edit?.text, 'Unsaved before switching.');
  assert.equal(c.state.videos?.[0]?.programme.segments[0]?.text, 'Unsaved before switching.');
  await handleAction('/edit/heading', '', c);
  assert.equal(c.state.videos?.[0]?.programme.segments[0]?.heading, 'Untitled scene');
  await handleAction('/edit/title', '', c);
  assert.equal(c.state.videos?.[0]?.title, 'Show');
});

test('unreadable records are kept and reported, and removed only after confirmation', async () => {
  const broken = { id: 'bad', title: 'Broken', status: 'library', programme: { segments: [] } };
  const c = context({ videos: [saved('library'), broken as never], selected: 'v1' });
  const update = await handleAction('', {}, c, 'refresh');
  assert.equal(c.state.videos?.length, 1);
  assert.deepEqual(c.state.unreadable, [broken]);
  const studio = update.updates.find(u => u.surface === 'studio')!;
  assert.equal(studio.nodes.some(x => x.id === 'unreadable'), true);
  await assert.rejects(handleAction('', {}, c, 'remove_unreadable'), /Review the removal/);
  await handleAction('', {}, c, 'ask_remove_unreadable');
  await handleAction('', {}, c, 'remove_unreadable');
  assert.equal(c.state.unreadable, undefined);
});

test('a short keeps the show\'s source timing; library items can move back to drafts', async () => {
  const c = context({ videos: [saved('library', { sourceCheckedAt: '2026-11-04T09:30:00.000Z' })], selected: 'v1' });
  await handleAction('', { index: 1 }, c, 'make_short');
  assert.equal(c.state.videos?.[0]?.sourceCheckedAt, '2026-11-04T09:30:00.000Z');
  assert.equal(c.state.videos?.[0]?.programme.segments[0]?.cue, undefined);
  await handleAction('', { id: 'v1' }, c, 'move_to_drafts');
  assert.equal(c.state.videos?.find(v => v.id === 'v1')?.status, 'draft');
});

test('Home shows video cards that play when chosen, a shorts shelf and source chips; each view carries only its own data', async () => {
  const withImage = saved('library'); withImage.programme.segments[1]!.image = 'https://example.com/a.jpg';
  const plain = { ...saved('library'), id: 'v2', title: 'No pictures', source: 'Weather Desk' };
  const short = { ...saved('library'), id: 's1', title: 'A short', format: 'short' as const };
  const c = context({ videos: [withImage, plain, short] });
  const { updates } = await handleAction('', {}, c, 'refresh');
  const data = (id: string) => updates.find(u => u.surface === id)!.data[0]!.value as Record<string, any>;
  const node = (surface: string, id: string) => updates.find(u => u.surface === surface)!.nodes.find(x => x.id === id)!;
  const [row, drawn] = data('library').homeRows;
  assert.equal(row.image, 'https://example.com/a.jpg');
  // A programme without pictures gets a title card drawn from its own title and source.
  assert.match(drawn.image, /^data:image\/svg\+xml,/);
  assert.match(decodeURIComponent(drawn.image), /No pictures[\s\S]*Weather Desk/);
  assert.match(row.meta, /News Desk · 4 Nov 2026/);
  assert.match(row.length, /^~\d+:\d\d$/);
  // Each card starts its queue at that card: its row carries its place in the queue.
  assert.deepEqual(data('library').homeRows.map((x: { id: string; index: number }) => [x.id, x.index]), [['v1', 0], ['v2', 1]]);
  assert.deepEqual(data('library').homeQueue.map((x: { id: string }) => x.id), ['v1', 'v2']);
  assert.deepEqual(data('library').shelfQueue.map((x: { id: string }) => x.id), ['s1']);
  assert.deepEqual(node('library', 'library-row').props, { title: '{title}', subtitle: '{meta}', image: '{image}', imageLabel: '{length}', titleLines: 2, action: 'voice.watch', payload: { queue: '{/homeQueue}', index: '{index}', progress: 'watch_progress' }, actionLabel: 'Watch' });
  assert.equal(node('library', 'shelf-row').props!.imageAspect, 'tall');
  assert.equal((node('library', 'shelf-row').props!.payload as { portrait: boolean }).portrait, true);
  assert.deepEqual(data('library').channelOptions.map((x: { value: string }) => x.value), ['all', 'News Desk', 'Weather Desk']);
  assert.equal('selected' in data('library'), false);
  assert.equal('libraryQueue' in data('studio'), false);
  assert.deepEqual(data('shorts').shortsQueue.map((x: { id: string }) => x.id), ['s1']);
  assert.equal((node('shorts', 'shorts-play').props!.payload as { portrait: boolean }).portrait, true);
  // A chip narrows Home to one source app.
  const narrowed = (await handleAction('/channel', 'Weather Desk', c)).updates.find(u => u.surface === 'library')!.data[0]!.value as Record<string, any>;
  assert.deepEqual(narrowed.homeRows.map((x: { id: string }) => x.id), ['v2']);
  assert.equal(narrowed.shelfRows.length, 0);
  await handleAction('/channel', 'all', c);
  assert.equal(c.state.channel, '');
});

test('Watch later saves library videos for later and plays them as a queue', async () => {
  const c = context({ videos: [saved('library'), { ...saved('draft'), id: 'd1' }] });
  let { updates } = await handleAction('', { id: 'v1' }, c, 'toggle_later');
  const you = () => updates.find(u => u.surface === 'playlists')!.data[0]!.value as Record<string, any>;
  assert.deepEqual(you().laterQueue.map((x: { id: string }) => x.id), ['v1']);
  assert.equal((updates.find(u => u.surface === 'library')!.data[0]!.value as Record<string, any>).homeRows[0].laterLabel, 'Remove from Watch later');
  await assert.rejects(handleAction('', { id: 'd1' }, c, 'toggle_later'), /library first/);
  ({ updates } = await handleAction('', { id: 'v1' }, c, 'toggle_later'));
  assert.equal(you().laterRows.length, 0);
});

test('watch progress drives Continue watching and history, and finishing clears the resume point', async () => {
  const c = context({ videos: [saved('library')] });
  let { updates } = await handleAction('', { index: 0, id: 'v1', part: 1, done: false }, c, 'watch_progress');
  const lib = () => updates.find(u => u.surface === 'library')!.data[0]!.value as Record<string, any>;
  const you = () => updates.find(u => u.surface === 'playlists')!.data[0]!.value as Record<string, any>;
  assert.equal(lib().continueRows[0].part, 1);
  assert.equal(lib().continueRows[0].progress, 0.5);
  assert.match(lib().continueRows[0].meta, /Scene 2 of 2/);
  assert.equal(you().historyRows[0].id, 'v1');
  ({ updates } = await handleAction('', { index: 0, id: 'v1', part: 1, done: true }, c, 'watch_progress'));
  assert.equal(lib().continueRows.length, 0);
  assert.equal(you().historyRows[0].progress, 1);
  await handleAction('', { id: 'gone', part: 0, done: true }, c, 'watch_progress');
  assert.equal(c.state.history?.length, 1);
  await handleAction('', {}, c, 'clear_history');
  assert.deepEqual(c.state.history, []);
});

test('playlists collect library videos, keep their order and are deleted only after review', async () => {
  const c = context({ videos: [saved('library'), { ...saved('library'), id: 'v2', title: 'Second' }, { ...saved('draft'), id: 'd1' }] });
  await assert.rejects(handleAction('', { id: 'v1' }, c, 'add_to_playlist'), /Create a playlist/);
  await handleAction('/playlistName', 'Morning', c);
  await handleAction('', {}, c, 'create_playlist');
  await assert.rejects(handleAction('/playlistName', 'morning', c).then(() => handleAction('', {}, c, 'create_playlist')), /already exists/);
  await handleAction('', { id: 'v1' }, c, 'add_to_playlist');
  await handleAction('', { id: 'v2' }, c, 'add_to_playlist');
  await assert.rejects(handleAction('', { id: 'd1' }, c, 'add_to_playlist'), /library first/);
  let { updates } = await handleAction('', { id: 'v2', by: -1 }, c, 'move_in_playlist');
  const lists = () => updates.find(u => u.surface === 'playlists')!.data[0]!.value as Record<string, any>;
  assert.deepEqual(lists().playlistQueue.map((x: { id: string }) => x.id), ['v2', 'v1']);
  ({ updates } = await handleAction('', { id: 'v2' }, c, 'remove_from_playlist'));
  assert.deepEqual(lists().listItems.map((x: { id: string }) => x.id), ['v1']);
  await assert.rejects(handleAction('', {}, c, 'delete_playlist'), /Review the removal/);
  await handleAction('', {}, c, 'ask_delete_playlist');
  await handleAction('', {}, c, 'delete_playlist');
  assert.deepEqual(c.state.playlists, []);
});

test('removing a video drops it from progress, history and playlists', async () => {
  const c = context({ videos: [saved('library')], progress: { v1: { part: 1, done: false, at: '2026-11-04T10:00:00.000Z' } }, history: [{ id: 'v1', at: '2026-11-04T10:00:00.000Z' }], playlists: [{ id: 'p', name: 'P', items: ['v1'] }], selected: 'v1' });
  await handleAction('', {}, c, 'ask_remove');
  await handleAction('', {}, c, 'remove_video');
  await handleAction('', {}, c, 'refresh');
  assert.deepEqual(c.state.progress, {});
  assert.deepEqual(c.state.history, []);
  assert.deepEqual(c.state.playlists?.[0]?.items, []);
});

test('an unavailable source fails with a clear message', async () => {
  const c: Context = { state: { source: 'markets' }, appRevision: 1, async callTool() { throw new Error('Unknown tool'); } };
  await assert.rejects(handleAction('', {}, c, 'import_markets'), /Market Terminal could not be read.*installed, turned on and allowed in Access/);
});

test('row templates travel only with the lists that use them', () => {
  const at = '2026-11-04T10:00:00.000Z', show = { id: 'v1', title: 'Show 1', format: 'show', source: 'News Desk', savedAt: at, status: 'library', programme: sample } as const;
  const states: State[] = [{}, { videos: [show] }, { videos: [show], playlists: [{ id: 'p1', name: 'Morning', items: [] }], playlist: 'p1' }, { videos: [show], playlists: [{ id: 'p1', name: 'Morning', items: ['v1'] }], playlist: 'p1', progress: { v1: { part: 0, done: false, at } }, history: [{ id: 'v1', at }] }];
  for (const state of states) for (const u of views(state)) {
    // A node is a row template when it, or a node it contains, reads a row field ({field}, not {/path}).
    const byId = new Map(u.nodes.map(x => [x.id, x]));
    const own = (x: (typeof u.nodes)[number]) => /\{[a-zA-Z]/.test(JSON.stringify(x.props ?? {}));
    const used = new Set(u.nodes.flatMap(x => x.children && !Array.isArray(x.children) ? [(x.children as { template: string }).template] : []));
    const inside = (id: string, seen = new Set<string>()): boolean => { if (used.has(id)) return true; if (seen.has(id)) return false; seen.add(id); return u.nodes.some(p => Array.isArray(p.children) && p.children.includes(id) && inside(p.id, seen)); };
    for (const x of u.nodes) if (own(x)) assert.ok(inside(x.id), `${u.surface}: ${x.id} reads row fields outside a list (${JSON.stringify(state).slice(0, 80)})`);
    assert.ok(byId.size === u.nodes.length);
  }
});

test('a cover length counts the theme cues and pauses, not only the words', () => {
  const show: Programme = { title: 'Cued', segments: [{ ...scene, delivery: 'opening', cue: 'intro' }, { ...scene, delivery: 'closing', cue: 'outro', break: 'section' }] };
  const rows = views({ videos: [{ id: 'cued', title: 'Cued', format: 'show', source: 'News Desk', savedAt: '2026-11-04T10:00:00.000Z', status: 'library', programme: show }] }).find(x => x.surface === 'library')!.data[0]!.value.homeRows as Record<string, unknown>[];
  // 6 words (2.4 s) + intro 5 s + section pause 0.9 s + outro 5.8 s.
  assert.equal(JSON.stringify(rows).includes('"~0:14"'), true);
});
