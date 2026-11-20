import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSchedule } from '../src/lib/booking/schedule';
import { manilaWallClock } from '../src/lib/booking/slots';

const at = (date: string, hour: number, minute = 0) => new Date(manilaWallClock(date, hour, minute).getTime());
const row = (weekday: number, opens = '07:00:00', closes = '03:00:00', hourly_rate: string | null = '100.00') => ({ court_id: '1', weekday, opens, closes, hourly_rate });
const base = () => ({ date: '2026-11-21', now: at('2026-11-21', 7), anchorMinutes: 420, interval: 30, minimum: 30, horizonDays: 30, courts: [{ id: '1', active: true }], hours: [row(6), row(0)], requests: [{ courtId: '1', start: at('2026-11-22', 2, 30), end: at('2026-11-22', 3) }] });

test('overnight window and 60 minute alignment', () => {
  const input = base();
  const result = resolveSchedule(input);
  assert.ok('ranges' in result);
  assert.equal(result.ranges[0].rate, '100.00');
  assert.equal(result.ranges[0].minutes, 30);
  assert.deepEqual(resolveSchedule({ ...input, interval: 60, minimum: 60 }), { error: 'INVALID_INPUT' });
});

test('altered anchor and next-day Sunday opening use real weekday', () => {
  const input = base();
  input.anchorMinutes = 540;
  input.hours = [row(0, '02:00', '04:00')];
  input.requests[0] = { courtId: '1', start: at('2026-11-22', 2), end: at('2026-11-22', 3) };
  assert.ok('ranges' in resolveSchedule(input));
  input.hours = [row(6, '02:00', '04:00')];
  assert.deepEqual(resolveSchedule(input), { error: 'CLOSED' });
});

test('cross-boundary and overlapping schedule rejected', () => {
  const input = base();
  input.hours = [row(5, '23:00', '08:00')];
  assert.deepEqual(resolveSchedule(input), { error: 'INVALID_SCHEDULE' });
  input.hours = [row(6, '07:00', '12:00'), row(6, '11:00', '15:00')];
  assert.deepEqual(resolveSchedule(input), { error: 'INVALID_SCHEDULE' });
  input.hours = [row(6, '07:00:01', '12:00')];
  assert.deepEqual(resolveSchedule(input), { error: 'INVALID_SCHEDULE' });
});

test('adjacent windows work separately but cannot be stitched, even at same rate', () => {
  const input = base();
  input.hours = [row(6, '07:00', '12:00'), row(6, '12:00', '15:00')];
  input.requests[0] = { courtId: '1', start: at(input.date, 11, 30), end: at(input.date, 12) };
  assert.ok('ranges' in resolveSchedule(input));
  input.requests[0] = { courtId: '1', start: at(input.date, 12), end: at(input.date, 12, 30) };
  assert.ok('ranges' in resolveSchedule(input));
  input.requests[0] = { courtId: '1', start: at(input.date, 11, 30), end: at(input.date, 12, 30) };
  assert.deepEqual(resolveSchedule(input), { error: 'CLOSED' });
  input.hours[1].hourly_rate = '200.00';
  assert.deepEqual(resolveSchedule(input), { error: 'CLOSED' });
});

test('missing rate and inactive court rejected', () => {
  const input = base();
  input.hours[0].hourly_rate = null;
  assert.deepEqual(resolveSchedule(input), { error: 'INVALID_RATE' });
  input.courts[0].active = false;
  assert.deepEqual(resolveSchedule(input), { error: 'COURT_UNAVAILABLE' });
});

test('horizon and duplicate court validation', () => {
  const input = base();
  input.date = '2026-12-20';
  input.hours = [row(0, '07:00', '12:00')];
  input.requests = [{ courtId: '1', start: at(input.date, 8), end: at(input.date, 9) }];
  assert.ok('ranges' in resolveSchedule(input));
  input.date = '2026-12-21';
  input.hours = [row(1, '07:00', '12:00')];
  input.requests = [{ courtId: '1', start: at(input.date, 8), end: at(input.date, 9) }];
  assert.deepEqual(resolveSchedule(input), { error: 'INVALID_INPUT' });
  input.requests.push(input.requests[0]);
  assert.deepEqual(resolveSchedule(input), { error: 'INVALID_INPUT' });
  input.date = '2026-02-30';
  assert.deepEqual(resolveSchedule(input), { error: 'INVALID_INPUT' });
});
