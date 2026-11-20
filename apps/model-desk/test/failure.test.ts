import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readAll, readFailure, SOURCE_UPDATING } from '../source.ts';
import { keptBody } from '../views.ts';

test('a source that changes between pages is said plainly; other failures keep their own words', async () => {
  assert.equal(readFailure('the document changed since the previous page; start again without rows.after'), SOURCE_UPDATING);
  assert.equal(readFailure('HTTP 503 from https://catalog.example/a.json'), 'HTTP 503 from https://catalog.example/a.json');
  const first = `URL: https://catalog.example/a.json\n\n${JSON.stringify({ keys: 1, columns: ['/n'], total: 2, from: 0, rows: [['a', 1]], next: '1@0123456789abcdef' })}`;
  let n = 0;
  const call = async () => { if (n++) throw new Error('the document changed since the previous page; start again without rows.after'); return first; };
  await assert.rejects(readAll(call, 'Listings', 'https://catalog.example/a.json', '/*', ['/n'], (r) => r, 5), new Error(`Listings: ${SOURCE_UPDATING}`));
});

test('why a refresh kept the snapshot is said once', () => {
  assert.equal(keptBody(`Listings: ${SOURCE_UPDATING}`, `Listings: ${SOURCE_UPDATING}`), `Listings: ${SOURCE_UPDATING} See Pipeline for every check.`);
  assert.equal(keptBody('A quality check failed; the previous snapshot is kept', 'Listings fell from 10000 to 30, more than half'), 'A quality check failed; the previous snapshot is kept. Listings fell from 10000 to 30, more than half. See Pipeline for every check.');
  assert.equal(keptBody('', null), 'See Pipeline for every check.');
});
