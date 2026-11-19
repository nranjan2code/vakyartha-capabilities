import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT, rateSql, spread, workload, WORKLOADS, type ModelDetail } from '../market.ts';
import { money, sentence, tokens, widest } from '../views.ts';

const base: ModelDetail = {
  id: 'lab/m', name: 'M 1', lab: 'lab', providers: 4, priced: 4, comparable: true, kind: null,
  own_provider: 'Lab', own_rate: 4, pick_provider: 'Host A', pick_rate: 1, pick_tier: null, credible_rate: 1, low_rate: 1, high_rate: 4,
  own_input: 3, own_output: 6, pick_input: 0.8, pick_output: 1.6, low_provider: 'Host A', low_context: 128000, low_fits: true, low_status: null, full_context: 128000, outliers: 0,
};

test('the summary names what to buy, how it compares with the lab, and the catch', () => {
  assert.equal(sentence(base), '4 providers list M 1. The cheapest full-context offer is Host A at $0.8 in and $1.6 out per million tokens, 75% below Lab\'s own price. Prices span 4.0x for the same model.');
  assert.match(sentence({ ...base, low_provider: 'Host B', low_rate: 0.5, low_status: 'beta' }), /Host B lists lower on a beta offer\.$/);
  assert.match(sentence({ ...base, low_provider: 'Host B', low_rate: 0.5 }), /Host B lists lower, but no other provider comes within 1\.5x of that price\.$/);
  assert.match(sentence({ ...base, own_provider: null, own_rate: null }), /tokens\. Prices span/);
  assert.match(sentence({ ...base, outliers: 2 }), /2 prices more than 20x from the middle are set aside as likely errors\.$/);
  assert.equal(sentence({ ...base, priced: 0 }), '4 providers list M 1; none publishes a price.');
  assert.match(sentence({ ...base, comparable: false }), /other units than text tokens/);
  assert.equal(sentence({ ...base, comparable: false, kind: 'embedding' }), 'M 1 is an embedding model, so its prices are listed but not compared with language models.');
});

test('prices and contexts read the way the original wrote them', () => {
  assert.deepEqual([money(0.0042), money(0.3247), money(1.2875), money(12), money(0), money(null)], ['$0.0042', '$0.325', '$1.29', '$12', '$0', '—']);
  assert.deepEqual([tokens(8000), tokens(128000), tokens(1048576), tokens('1000000'), tokens(null)], ['8K', '128K', '1.05M', '1M', '—']);
});

test('the spread floor is the cheapest confirmed price, and the widest list keeps the original\'s bar', () => {
  assert.equal(spread({ ...base, credible_rate: 2, low_rate: 0.5, high_rate: 8 }), 4);
  assert.equal(spread({ ...base, credible_rate: null, low_rate: 0.5, high_rate: 8 }), 16);
  const many = [{ ...base, id: 'a', priced: 6, high_rate: 3 }, { ...base, id: 'b', priced: 5, high_rate: 9 }, { ...base, id: 'c', priced: 8, high_rate: 1.2 }, { ...base, id: 'd', priced: 9, high_rate: 6, comparable: false }];
  assert.deepEqual(widest(many).map((m) => m.id), ['a'], 'six providers, a 1.5x gap, text tokens');
});

test('a chat request is priced per million billable tokens, unpublished cache rates at the full input rate', () => {
  const sql = rateSql(CHAT);
  assert.match(sql, /^CASE WHEN l\.input IS NULL OR l\.output IS NULL OR \(l\.input = 0 AND l\.output = 0\) THEN NULL/);
  assert.ok(sql.includes('lambda tier_: tier_.size <= 8000'), 'the tier for the request\'s context');
  assert.ok(sql.includes("'cache_read'), l.cache_read, coalesce(struct_extract("), 'an unpublished cache rate falls back to the input rate in force');
  assert.ok(sql.startsWith('CASE WHEN l.input IS NULL OR l.output IS NULL OR (l.input = 0 AND l.output = 0) THEN NULL ELSE (1200 * '), 'four fifths of 1,500 input tokens at the input rate');
  assert.ok(sql.endsWith(' + 500 * coalesce(struct_extract(list_last(list_filter(from_json(l.tiers, \'[{"size":"BIGINT","input":"DOUBLE","output":"DOUBLE","cache_read":"DOUBLE","cache_write":"DOUBLE","reasoning":"DOUBLE"}]\'), lambda tier_: tier_.size <= 8000)), \'output\'), l.output)) / 2000 END'), 'per million of 2,000 billable tokens');
  assert.equal(WORKLOADS.map((w) => w.id).join(), 'chat,rag,agentic,reasoning,long-context');
  assert.equal(workload('nonsense'), CHAT);
  assert.throws(() => rateSql({ ...CHAT, inputTokens: 0, outputTokens: 0 }), /needs some tokens/);
});
