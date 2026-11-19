import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collapse, lede, spoken, spokenPrice, type Move, type WeekFacts } from '../brief.ts';

const move = (o: Partial<Move>): Move => ({ key: 'lab/m', id: 'lab/m', name: 'M', provider: 'host', providerName: 'Host', from: 1, to: 0.5, pct: -0.5, day: '2026-11-19', firstParty: false, ...o });
const week = (o: Partial<WeekFacts>): WeekFacts => ({ day: '2026-11-19', labs: [], street: [], launches: [], sunsets: [], changes: 0, ...o });

test('one row per model: the middle move of every provider that made it', () => {
  const rows = collapse([move({ provider: 'a', pct: -0.1 }), move({ provider: 'b', pct: -0.5 }), move({ provider: 'c', pct: -0.3 }), move({ key: 'lab/n', id: 'lab/n', name: 'N', pct: 0.2 })]);
  assert.deepEqual(rows.map((r) => [r.name, r.pct, r.venues]), [['M', -0.3, 3], ['N', 0.2, 1]]);
});

test('the newest qualifying story leads; the rule order only breaks ties', () => {
  const cut = collapse([move({ firstParty: true, providerName: 'Lab', from: 4, to: 2, pct: -0.5, day: '2026-11-17' })]);
  const street = collapse([move({ key: 'lab/s', id: 'lab/s', name: 'S', from: 1, to: 2, pct: 1, day: '2026-11-18' })]);
  const later = lede(week({ labs: cut, street }));
  assert.equal(later.kind, 'street', 'a newer reseller move beats an older lab cut');
  assert.equal(later.headline, 'Host raised its S price by 100%');
  const same = lede(week({ labs: collapse([move({ firstParty: true, providerName: 'Lab', from: 4, to: 2, pct: -0.5, day: '2026-11-18' })]), street }));
  assert.equal(same.kind, 'cut', 'on the same day a lab cut leads');
  assert.equal(same.headline, 'M is 50% cheaper');
  assert.equal(same.body, 'Lab cut its own input price from $4 to $2 per million tokens. Every provider reselling it now prices against a lower floor.');
  assert.equal(lede(week({ labs: collapse([move({ firstParty: true, pct: -0.1 })]) })).kind, 'quiet', 'a 10% move is not material');
  assert.equal(lede(week({ sunsets: [{ name: 'A', day: '2026-11-19' }, { name: 'B', day: '2026-11-18' }, { name: 'C', day: '2026-11-18' }] })).headline, '3 listings were retired this week');
  assert.equal(lede(week({ launches: [{ id: 'lab/x', name: 'X 1', lab: 'lab', lab_name: 'Lab', release_date: '2026-11-19', context: 128000, providers: 1 }] })).body, 'Lab released it on 2026-11-19 with a 128K-token context, and 1 provider already lists it.');
  assert.equal(lede(week({ changes: 4 })).body, 'The desk logged 4 changes this week, none of them a lab repricing its own model by 15% or more.');
});

test('the brief for the ear says prices and days in words', () => {
  assert.deepEqual([spokenPrice(2), spokenPrice(0.15), spokenPrice(0.0042)], ['2 dollars', '15 cents', 'a fraction of a cent']);
  const facts = week({ labs: collapse([move({ firstParty: true, providerName: 'Lab', from: 4, to: 2, pct: -0.5 })]) });
  const index = Array.from({ length: 14 }, (_, i) => ({ day: `2026-11-${String(i + 6).padStart(2, '0')}`, median: i ? 1.5 : 2, models: 40 }));
  assert.equal(spoken(facts, lede(facts), index), 'The model market for the week to Thursday 19 November. M is 50 percent cheaper. Lab cut its own input price from 4 dollars to 2 dollars per million tokens, so every provider reselling it now prices against a lower floor. This week labs changed 1 of their own prices, and resellers changed none. The lab price index fell 25 percent over 14 days, to a median of 1.5 dollars per million tokens.');
});
