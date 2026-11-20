import assert from 'node:assert/strict';
import { test } from 'node:test';
import { benchmark, listing, LISTING_COLUMNS, model, page, provider, readAll, tiers } from '../source.ts';
import { summary, when } from '../views.ts';

const reply = (p: object) => `URL: https://catalog.example/a.json\n\n${JSON.stringify(p)}`;

test('a page is read from the tool\'s reply, and anything else is refused with its own words', () => {
  assert.equal(page(reply({ keys: 1, columns: ['/a'], total: 1, from: 0, rows: [['k', 1]] })).rows.length, 1);
  assert.throws(() => page({ isError: true, text: 'refused: blocked' }), /refused: blocked/);
  assert.throws(() => page('HTTP 503 from https://catalog.example/'), /HTTP 503/);
  assert.throws(() => page('URL: x\n\n<html>'), /not the table/);
});

test('every page is read in order, and a short or reordered read fails rather than storing part', async () => {
  const pages = [{ keys: 1, columns: ['/n'], total: 3, from: 0, rows: [['a', 1], ['b', 2]], next: '2@0123456789abcdef' }, { keys: 1, columns: ['/n'], total: 3, from: 2, rows: [['c', 'x']] }];
  const asked: unknown[] = [];
  const call = async (_: string, args: Record<string, unknown>) => { asked.push(args.rows); return reply(pages[asked.length - 1]!); };
  const read = await readAll(call, 'T', 'https://catalog.example/a.json', '/*', ['/n'], (r) => (typeof r[1] === 'number' ? r : undefined), 5);
  assert.deepEqual(read.rows, [['a', 1], ['b', 2]]);
  assert.equal(read.dropped, 1);
  assert.equal(read.receipt.status, 'Read, 1 malformed rows left out');
  assert.deepEqual((asked[1] as { after: string }).after, '2@0123456789abcdef');
  await assert.rejects(readAll(async () => reply(pages[0]!), 'T', 'u', '/*', ['/n'], (r) => r, 1), /more than 1 reads/);
  await assert.rejects(readAll(async () => reply({ ...pages[1]!, from: 0, total: 2 }), 'T', 'u', '/*', ['/n'], (r) => r, 3), /received 1 of 2/);
});

test('values are the type they should be or the row is left out', () => {
  const row = ['p', 'm', 'Name', 'fam', 'lab/m', 'deprecated', '2026-01-02', '2026-02', null, true, false, true, null, null, 128000, null, 8000, 1.25, 10, 0.125, null, null, null, { input: 2.5, output: 15 }, ['text', 'image'], ['text'], null];
  assert.equal(row.length, 2 + LISTING_COLUMNS.length);
  const stored = listing(row)!;
  assert.equal(stored.length, row.length - 1, 'the two tier forms are one column');
  assert.deepEqual(stored.slice(-4), ['[{"size":200000,"input":2.5,"output":15,"cache_read":null,"cache_write":null,"reasoning":null}]', 'text,image', 'text', null]);
  assert.equal(listing(row.map((v, i) => (i === 23 ? { input: 'cheap' } : v))), undefined, 'a tier price that is not a price');
  assert.equal(listing(row.map((v, i) => (i === 17 ? -1 : v))), undefined, 'a negative price');
  assert.equal(listing(row.map((v, i) => (i === 5 ? 'gone' : v))), undefined, 'an unknown status');
  assert.equal(listing(row.map((v, i) => (i === 6 ? 'soon' : v))), undefined, 'a date that is not one');
  assert.equal(provider(['p', 'P', null, 'https://p.example/v1'])!.api, 'https://p.example/v1');
  assert.equal(model(['nolab', 'X', null, null, null, null, null, null, null, null]), undefined, 'a model id names its lab');
  assert.deepEqual(benchmark(['lab/m', '2', 'Bench', 71.5, 'accuracy', 'https://b.example', '2026-03-01']), { model: 'lab/m', position: 2, name: 'Bench', score: 71.5, metric: 'accuracy', source: 'https://b.example', date: '2026-03-01' });
  assert.equal(benchmark(['lab/m', '0', 'Bench', 'high', null, null, null]), undefined);
});

test('a change reads as words, and times read in UTC', () => {
  assert.equal(summary('[{"field":"cost.input","old":0.15,"new":0.3},{"field":"limit.context","old":128000,"new":null}]'), 'input price $0.15 to $0.3; context 128K to none');
  assert.equal(summary('[{"field":"a","old":1,"new":2},{"field":"b","old":1,"new":2},{"field":"c","old":1,"new":2},{"field":"d","old":1,"new":2}]'), 'a 1 to 2; b 1 to 2; c 1 to 2; and 1 more');
  assert.equal(summary('[]'), '');
  assert.equal(when('2026-11-19T14:05:09.000Z'), '19 Nov 2026, 14:05 UTC');
  assert.equal(when('nonsense'), '—');
});

test('context price tiers become one list, smallest first; the list wins over the older 200k card', () => {
  const list = [{ input: 5, output: 22.5, cache_read: 0.5, tier: { type: 'context', size: 272000 } }, { input: 3, tier: { type: 'context', size: 128000 } }, { input: 9, tier: { type: 'requests', size: 10 } }, { input: 1 }];
  assert.deepEqual(JSON.parse(tiers(list, { input: 4 })!).map((t: { size: number; input: number }) => [t.size, t.input]), [[128000, 3], [272000, 5]], 'other kinds of tier and tiers without a size are left out');
  assert.deepEqual(JSON.parse(tiers(null, { input: 4, output: 8 })!), [{ size: 200000, input: 4, output: 8, cache_read: null, cache_write: null, reasoning: null }]);
  assert.equal(tiers(null, null), null);
  assert.equal(tiers([{ input: -1, tier: { type: 'context', size: 1000 } }], null), undefined);
});
