import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyNote, spansCsv } from '../views.ts';

test('the history says what it covers and how the cheapest price moved', () => {
  assert.equal(historyNote([]), 'No price history yet: it starts with the first refresh.');
  assert.equal(historyNote([{ day: '2026-11-19', best: 1, own: null }]), 'Prices for a chat request at each day\'s last refresh, over one day, 2026-11-19. A chart appears from the second day. The export holds every price span with its dates.');
  assert.equal(historyNote([{ day: '2026-11-17', best: 2.325, own: null }, { day: '2026-11-20', best: 1.2875, own: null }]), 'Prices for a chat request at each day\'s last refresh, over 2 days, 2026-11-17 to 2026-11-20. The cheapest confirmed price went from $2.33 to $1.29, down 45%. The export holds every price span with its dates.');
  assert.match(historyNote([{ day: 'a', best: 1, own: null }, { day: 'b', best: 1, own: null }]), /from \$1 to \$1, unchanged\./);
});

test('the export is a spreadsheet of spans that never runs a formula', () => {
  const csv = spansCsv([
    { provider: 'p1', model: 'm', valid_from: '2026-11-17T09:00:00Z', valid_to: '2026-11-20T09:00:00Z', input: 1, output: 2, cache_read: null, cache_write: null, reasoning_price: null, tiers: null },
    { provider: '=HYPERLINK("x")', model: 'a,b', valid_from: '2026-11-20T09:00:00Z', valid_to: null, input: 0.5, output: -1, cache_read: 0.05, cache_write: null, reasoning_price: null, tiers: '[{"size":200000,"input":1}]' },
  ]);
  assert.equal(csv, [
    'provider,model,from,to,input,output,cache_read,cache_write,reasoning,context_tiers',
    'p1,m,2026-11-17T09:00:00Z,2026-11-20T09:00:00Z,1,2,,,,',
    '"\'=HYPERLINK(""x"")","a,b",2026-11-20T09:00:00Z,,0.5,-1,0.05,,,"[{""size"":200000,""input"":1}]"',
    '',
  ].join('\n'));
});
