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
  await handleAction('', {}, c, 'save_scene');
  assert.equal(c.state.videos?.[0]?.programme.segments[0]?.text, 'Reviewed words.');
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
