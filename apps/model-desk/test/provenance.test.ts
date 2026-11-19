import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provenance } from '../provenance.ts';
import { kindOf, valued } from '../views.ts';
import { CHAT, type ModelRow } from '../market.ts';

// The catalog says who is who: lab0 sells only its own models from lab0.example; relay.example
// sells three labs' models; nothing else is known about any host.
const sellers = [
  { id: 'lab0', doc: 'https://docs.lab0.example/models', api: null, labs: ['lab0'] },
  { id: 'relay', doc: 'https://relay.example/docs', api: 'https://api.relay.example/v1', labs: ['lab0', 'lab1', 'lab2'] },
];
const labs = ['lab0', 'lab1', 'lab2'];

test('who published each score is read from the catalog, never from a list of names', () => {
  const scores = [
    { model: 'lab0/a', source: 'https://lab0.example/blog/a' },
    { model: 'lab1/b', source: 'https://lab0.example/compare' },
    { model: 'lab0/a', source: 'https://evals.example/board' }, { model: 'lab1/b', source: 'https://evals.example/board' }, { model: 'lab2/c', source: 'https://evals.example/board' },
    { model: 'lab0/a', source: 'https://hub.example/org-zero/a' }, { model: 'lab1/b', source: 'https://hub.example/org-one/b' }, { model: 'lab2/c', source: 'https://hub.example/org-two/c' },
    { model: 'lab0/a', source: 'https://relay.example/lab0/a' },
    { model: 'lab0/a', source: 'https://news.example/story' },
    { model: 'lab2/c', source: 'https://www.lab2.example/post' },
    { model: 'lab1/b', source: null }, { model: 'lab1/b', source: 'not a link' },
  ];
  assert.deepEqual(provenance(scores, sellers, labs).map((p) => `${p.provenance} ${p.publisher}`), [
    'vendor lab0.example', 'rival lab0.example',
    'independent evals.example', 'independent evals.example', 'independent evals.example',
    'vendor hub.example/org-zero', 'vendor hub.example/org-one', 'vendor hub.example/org-two',
    'aggregator relay.example',
    'unclassified news.example',
    'vendor lab2.example',
    'unknown null', 'unknown null',
  ]);
});

test('an evaluator needs three labs, and a lab scoring others is never one', () => {
  const two = provenance([{ model: 'lab0/a', source: 'https://evals.example/x' }, { model: 'lab1/b', source: 'https://evals.example/x' }], sellers, labs);
  assert.deepEqual(two.map((p) => p.provenance), ['unclassified', 'unclassified']);
  const rival = provenance(['lab0/a', 'lab1/b', 'lab2/c'].map((model) => ({ model, source: 'https://lab0.example/table' })), sellers, labs);
  assert.deepEqual(rival.map((p) => p.provenance), ['vendor', 'rival', 'rival']);
});

test('only independent scores get points per dollar, priced at the best full-context offer', () => {
  const models = [{ id: 'lab0/a', comparable: true, pick_rate: 2 }, { id: 'lab1/b', comparable: true, pick_rate: 1 }] as ModelRow[];
  const entries = [
    { model: 'lab0/a', model_name: 'A', score: 60, provenance: 'independent', publisher: 'evals.example', source: null, date: null },
    { model: 'lab1/b', model_name: 'B', score: 90, provenance: 'vendor', publisher: 'lab1.example', source: null, date: null },
    { model: 'lab2/c', model_name: 'C', score: 70, provenance: 'independent', publisher: 'evals.example', source: null, date: null },
  ];
  // A chat request is 2,000 billable tokens: $2 a million is $0.004 a request.
  assert.deepEqual(valued(entries, models, CHAT).map((r) => [r.entry.model, r.perRun, r.perDollar]), [['lab0/a', 0.004, 15000], ['lab1/b', 0.002, null], ['lab2/c', null, null]]);
  assert.equal(kindOf('vendor', 'lab1.example'), 'Self-reported: lab1.example');
  assert.equal(kindOf('unknown', null), 'Unsourced');
});
