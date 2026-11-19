import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, identifier, named } from '../licence.ts';
import { floor, memoryGb } from '../selfhost.ts';
import { repoOf, weights, weightsUrl } from '../source.ts';
import { many } from '../views.ts';

test('licences: standard identifiers are open, a licence saying non-commercial is that, everything else is the lab\'s own', () => {
  const cases: [string | null, string][] = [
    ['Apache 2.0', 'permissive'], ['apache-2.0', 'permissive'], ['MIT License', 'permissive'], ['BSD-3-Clause', 'permissive'],
    ['CC-BY-NC-4.0', 'non-commercial'], ['Example Research License', 'non-commercial'], ['Example AI Non-Production License', 'non-commercial'], ['Example Non-Commercial License', 'non-commercial'],
    ['Example Community License', 'own'], ['Modified MIT', 'own'], ['other', 'own'], ['OpenMDW-1.1', 'own'],
    [null, 'none'], ['  ', 'none'],
  ];
  for (const [licence, kind] of cases) assert.equal(classify(licence), kind, String(licence));
  assert.equal(identifier('The MIT License'), 'mit');
  assert.equal(named('other'), null, 'the host\'s word for a custom licence is not a name');
  assert.equal(named('Example Community License'), 'Example Community License');
});

test('a model\'s weights are its first link on the weights host, as organisation and model', () => {
  assert.equal(repoOf([{ label: 'Paper', url: 'https://papers.example/1' }, { label: 'Weights', url: 'https://huggingface.co/Org-One/Model_2.5-8B?x=1' }]), 'Org-One/Model_2.5-8B');
  assert.equal(repoOf([{ url: 'https://huggingface.co/only-org' }]), null);
  assert.equal(repoOf([{ url: 'https://huggingface.co/org/../../etc' }]), null);
  assert.equal(repoOf('not a list'), null);
  assert.match(weightsUrl('Org-One'), /^https:\/\/huggingface\.co\/api\/models\?author=Org-One&limit=1000&/);
  assert.throws(() => weightsUrl('org&evil=1'), /not an organisation name/);
});

test('the weights host\'s facts are read as access, size and licence, or the row is left out', () => {
  assert.deepEqual(weights(['0', 'org/m', false, 8_050_000_000, 'apache-2.0']), { repo: 'org/m', gated: 'open', parameters: 8_050_000_000, license: 'apache-2.0' });
  assert.deepEqual(weights(['1', 'org/m', 'manual', null, ['mit', 'other']]), { repo: 'org/m', gated: 'gated', parameters: null, license: 'mit, other' });
  assert.equal(weights(['2', 'org/m', 'sometimes', null, null]), undefined);
  assert.equal(weights(['3', 'no-slash', false, null, null]), undefined);
  assert.equal(weights(['4', 'org/m', false, -5, null]), undefined);
});

test('the self-host floor: memory, the fewest GPUs, monthly rent and the tokens that cost the same', () => {
  assert.equal(memoryGb(8_000_000_000), 20);
  const gpu = { memoryGb: 80, usdPerHour: 2.5 };
  // 8B parameters: 20 GB, one GPU, 730 hours at $2.50; at $0.125 a million tokens that rent buys 14.6B tokens.
  assert.deepEqual(floor(8_000_000_000, 'permissive', 0.125, gpu), { verdict: 'break-even', memory: 20, gpus: 1, rent: 1825, tokens: 14_600_000_000 });
  assert.equal(floor(70_000_000_000, 'own', 1, gpu).gpus, 3, '175 GB needs three 80 GB GPUs');
  assert.equal(floor(753_000_000_000, 'own', 1, gpu).verdict, 'cluster');
  assert.equal(floor(8_000_000_000, 'non-commercial', 1, gpu).verdict, 'api-only');
  assert.equal(floor(null, 'permissive', 1, gpu).verdict, 'missing');
  assert.equal(floor(8_000_000_000, 'permissive', 1, null).verdict, 'set-gpu');
  assert.deepEqual([many(14_600_000_000), many(450_000_000), many(12_000), many(null)], ['14.6B', '450M', '12K', '—']);
});
