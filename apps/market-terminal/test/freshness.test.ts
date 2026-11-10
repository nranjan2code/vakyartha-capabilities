import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fresh, lastWeekdayAt, liveNow, DAILY_AT, LIVE_UNTIL } from '../server.ts';

// India time is UTC+05:30. In November 2026 the 9th is a Monday and the 14th a Saturday.
const ist = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour, minute) - 5.5 * 3600_000;
const mark = (at: number, day?: string) => ({ at: new Date(at).toISOString(), ...(day ? { day } : {}) });

test('the latest weekday instant steps back over the weekend and never forward', () => {
  assert.equal(lastWeekdayAt(ist(10, 11), DAILY_AT), ist(9, 18, 30), 'before today\'s publication: yesterday\'s');
  assert.equal(lastWeekdayAt(ist(10, 19), DAILY_AT), ist(10, 18, 30), 'after it: today\'s');
  assert.equal(lastWeekdayAt(ist(15, 10), LIVE_UNTIL), ist(13, 15, 35), 'Sunday: Friday\'s close');
  assert.equal(lastWeekdayAt(ist(16, 8), LIVE_UNTIL), ist(13, 15, 35), 'Monday before the open: Friday\'s close');
});

test('live values are current for a minute in the session and final once read after the close', () => {
  const session = ist(10, 11);
  assert.equal(liveNow(session), true);
  assert.equal(fresh(mark(session - 30_000), 'live', session), true);
  assert.equal(fresh(mark(session - 120_000), 'live', session), false);
  const evening = ist(10, 20);
  assert.equal(liveNow(evening), false);
  assert.equal(fresh(mark(ist(10, 15, 34)), 'live', evening), false, 'read before the close: one more read is due');
  assert.equal(fresh(mark(ist(10, 15, 36)), 'live', evening), true, 'read after the close: final');
  const saturday = ist(14, 12);
  assert.equal(liveNow(saturday), false);
  assert.equal(fresh(mark(ist(13, 15, 40)), 'live', saturday), true);
  assert.equal(fresh(mark(ist(13, 15, 0)), 'live', saturday), false);
  assert.equal(liveNow(ist(10, 9, 5)), true, 'the pre-open moves indices');
  assert.equal(liveNow(ist(10, 8, 59)), false);
});

test('end-of-day values are read once per publication and tried again when the source is a session behind', () => {
  const morning = ist(10, 11);
  assert.equal(fresh(mark(ist(9, 19), '2026-11-09'), 'daily', morning), true, 'last evening\'s read holds all day');
  assert.equal(fresh(mark(ist(9, 17), '2026-11-06'), 'daily', morning), false, 'a read before last evening\'s publication is old');
  assert.equal(fresh(mark(ist(10, 11), '2026-11-09'), 'daily', ist(10, 19)), false, 'this evening\'s publication replaces it');
  const early = mark(ist(10, 18, 45), '2026-11-09');
  assert.equal(fresh(early, 'daily', ist(10, 19)), true, 'not retried within half an hour');
  assert.equal(fresh(early, 'daily', ist(10, 19, 30)), false, 'then tried again: the source had not published yet');
  assert.equal(fresh(mark(ist(10, 18, 45), '2026-11-10'), 'daily', ist(11, 12)), true);
  assert.equal(fresh(mark(ist(10, 18, 45)), 'daily', ist(11, 12)), true, 'a source that names no day is trusted by time');
  assert.equal(fresh(mark(ist(13, 19), '2026-11-13'), 'daily', ist(15, 10)), true, 'Friday\'s publication holds through the weekend');
});

test('fixed lists hold for a week; missing, unreadable and future marks are never fresh', () => {
  const now = ist(10, 11);
  assert.equal(fresh(mark(now - 6 * 86400_000), 'fixed', now), true);
  assert.equal(fresh(mark(now - 8 * 86400_000), 'fixed', now), false);
  for (const tier of ['live', 'daily', 'fixed'] as const) {
    assert.equal(fresh(undefined, tier, now), false);
    assert.equal(fresh({ at: 'yesterday' }, tier, now), false);
    assert.equal(fresh(mark(now + 60_000), tier, now), false);
  }
});
