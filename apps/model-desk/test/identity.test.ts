import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidates, cleanName, identity, reduce } from '../identity.ts';

const models = [
  { id: 'alpha/sol-5', name: 'Sol 5' },
  { id: 'alpha/sol-5-pro', name: 'Sol 5 Pro' },
  { id: 'beta/wave-2-20260101', name: 'Wave 2' },
  { id: 'beta/wave-2', name: 'Wave 2' },
  { id: 'gamma/mist', name: 'Mist' },
  { id: 'delta/mist', name: 'Mist' },
];
const who = identity(models, ['relay', 'cloudhost']);

test('the catalog\'s own canonical id wins when it names a known model', () => {
  assert.equal(who.resolve('Anything at all', 'relay/x', 'alpha/sol-5-pro'), 'alpha/sol-5-pro');
  assert.equal(who.resolve('Sol 5', 'relay/sol-5', 'zeta/unknown'), 'alpha/sol-5', 'an unknown upstream id falls back to matching');
});

test('spellings providers add are matched exactly, and a variant stays apart', () => {
  for (const [name, id] of [['Sol 5 (EU)', 'relay/sol-5@eu'], ['Relay: Sol 5', 'relay/a'], ['Relay Sol 5 Turbo', 'x/y'], ['sol 5', 'cloudhost.sol-5'], ['Other', 'relay/alpha.sol-5']] as const) {
    assert.equal(who.resolve(name, id, null), name.includes('Turbo') ? null : 'alpha/sol-5', `${name} ${id}`);
  }
  assert.equal(who.resolve('Sol 5 Pro', 'relay/sol-5-pro', null), 'alpha/sol-5-pro');
});

test('a stable alias keeps a spelling its dated pin shares; two different models sharing one match neither', () => {
  assert.equal(who.resolve('Wave 2', 'relay/wave-2', null), 'beta/wave-2');
  assert.equal(who.resolve('Mist', 'relay/mist', null), null);
});

test('router aliases and placeholders name no model', () => {
  assert.equal(who.resolve('Auto', 'relay/auto', null), null);
  assert.equal(who.resolve('Default', 'relay/whatever', null), null);
});

test('seller words come from the catalog, and a short name keeps its first word', () => {
  const sellers = new Set(['relay']);
  assert.equal(cleanName('Relay Sol 5 Turbo', sellers), 'Sol 5 Turbo');
  assert.equal(cleanName('Relay Sol', sellers), 'Relay Sol');
  assert.equal(cleanName('Sol 5 (50% off) [beta]', sellers), 'Sol 5');
  assert.equal(reduce('Модель-5 Ünï'), 'модель5ünï', 'letters and digits of any script are kept');
  assert.deepEqual(candidates('Sol 5', 'relay/sol-5@eu', sellers), ['sol5', 'relaysol5'], 'the name, the id without its region, then the whole id');
});
