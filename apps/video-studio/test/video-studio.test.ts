import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAction, handleQuery, programme, renderApp, surfaceFile, views, type Context, type State } from '../server.ts';

const sample = { title: 'A source show', segments: [{ text: 'A source-backed sentence.', delivery: 'story', heading: 'The story', kicker: 'News', source: 'Publisher', at: '2026-11-04T10:00:00.000Z' }] };
function context(state: State = {}, source: unknown = { programme: sample }, appRevision = 3): Context {
  return { state, appRevision, async callTool(name) { assert.equal(name, 'app-news-desk__get_bulletin'); return source; } };
}

test('validates actual source programme and rejects missing scenes', () => {
  assert.equal(programme(sample, 'Fallback').segments.length, 1);
  assert.throws(() => programme({ title: 'Empty', segments: [] }, 'Fallback'), /no saved programme/);
  assert.throws(() => programme({ segments: Array.from({ length: 81 }, () => sample.segments[0]) }, 'Fallback'), /more than 80 scenes/);
});

test('imports one selected source as a local review draft and keeps its freshness time', async () => {
  const checkedAt = '2026-11-04T09:30:00.000Z';
  const c = context({ source: 'news' }, { checkedAt, programme: sample });
  await handleAction('', {}, c, 'import_source');
  assert.equal(c.state.videos?.[0]?.status, 'draft');
  assert.equal(c.state.videos?.[0]?.source, 'News Desk');
  assert.equal(c.state.videos?.[0]?.sourceCheckedAt, checkedAt);
  assert.equal(c.state.videos?.[0]?.programme.segments[0]?.source, 'Publisher');
  assert.equal((await renderApp(c)).updates.length, 2);
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

test('initial surface and retained state render both views', () => {
  assert.equal(views({}).length, 2);
  assert.equal(views({ videos: [] }).flatMap(x => x.nodes).some(x => x.id === 'library-empty'), true);
  const saved = JSON.parse(readFileSync(resolve(import.meta.dirname, '../surface.json'), 'utf8'));
  assert.deepEqual(saved, surfaceFile());
  const studio = views({ videos: [{ id: 'source-1', title: 'Show', format: 'show', source: 'News Desk', savedAt: '2026-11-04T10:00:00.000Z', status: 'library', programme: sample }] })[1]!;
  const library = studio.data[0]!.value.library as Record<string, unknown>[];
  assert.equal('programme' in library[0]!, false);
  assert.equal(studio.nodes.some(x => x.id === 'production-workspace' && x.type === 'split'), true);
  assert.equal(studio.nodes.some(x => x.id === 'scene-items' && x.type === 'grid'), true);
});

const two = { title: 'Two scenes', segments: [{ ...sample.segments[0], heading: 'First' }, { ...sample.segments[0], heading: 'Second', text: 'Second words.' }] };
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

test('the library shows pictures, readable dates and a Watch choice for the header player', async () => {
  const withImage = saved('library'); withImage.programme.segments[1]!.image = 'https://example.com/a.jpg';
  const c = context({ videos: [withImage] });
  const update = await handleAction('', { id: 'v1' }, c, 'choose_video');
  assert.equal(c.state.selected, 'v1');
  assert.equal(update.focusSurface, undefined);
  const library = update.updates.find(u => u.surface === 'library')!;
  const row = (library.data[0]!.value.library as Record<string, string>[])[0]!;
  assert.equal(row.image, 'https://example.com/a.jpg');
  assert.match(row.savedLabel!, /4 Nov 2026/);
  assert.equal(library.nodes.some(x => x.id === 'library-ready'), true);
  assert.equal((library.data[0]!.value.selected as { programme: { segments: unknown[] } }).programme.segments.length, 2);
});

test('an unavailable source fails with a clear message', async () => {
  const c: Context = { state: { source: 'markets' }, appRevision: 1, async callTool() { throw new Error('Unknown tool'); } };
  await assert.rejects(handleAction('', {}, c, 'import_source'), /Market Terminal could not be read.*installed, turned on and allowed in Access/);
});
