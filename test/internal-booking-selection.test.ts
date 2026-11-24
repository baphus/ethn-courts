import test from 'node:test';
import assert from 'node:assert/strict';
import { cellWindow, hourLabel, rows, summarize, toggleHour, type Availability } from '../src/app/admin/bookings/new/selection';

const date = '2026-12-01';
const now = Date.parse(`${date}T00:00:00Z`);
const hour = 3_600_000;
const court = { id: '1', name: 'Court 1', windows: [{ opensAt: `${date}T00:30:00Z`, closesAt: `${date}T18:00:00Z`, hourlyRate: '200.00' }], occupied: [] };
const data: Availability = { date, operatingDate: date, serverNow: new Date(now).toISOString(), settings: { version: '1', intervalMinutes: 30, minimumMinutes: 120, anchorMinutes: 420, horizonDays: 30 }, courts: [court, { ...court, id: '2' }] };

test('grid aligns to clock hours, excludes partial conflicts, and labels overnight hours', () => {
  assert.equal(rows(data)[0], now + hour);
  const blocked = { ...court, occupied: [{ startsAt: `${date}T01:30:00Z`, endsAt: `${date}T02:00:00Z`, state: 'held' }] };
  assert.equal(cellWindow(blocked, now + hour, now, 30), undefined);
  assert.ok(cellWindow(blocked, now + 2 * hour, now, 30));
  assert.equal(cellWindow(court, now + hour, now + hour + 1, 30), undefined);
  assert.match(hourLabel(now + 16 * hour, date), /2026-12-02/);
});

test('selection extends adjacent hours only, removes ends, and prices courts independently', () => {
  const start = now + hour;
  let selection = toggleHour({}, '1', start).selection;
  assert.equal(summarize(data, date, selection, now)[0].eligible, false);
  assert.ok(toggleHour(selection, '1', start + 2 * hour).error);
  selection = toggleHour(selection, '1', start + hour).selection;
  selection = toggleHour(selection, '1', start + 2 * hour).selection;
  assert.ok(toggleHour(selection, '1', start + hour).error);
  selection = toggleHour(selection, '1', start + 2 * hour).selection;
  selection = toggleHour(selection, '2', start + hour).selection;
  selection = toggleHour(selection, '2', start + 2 * hour).selection;
  const summary = summarize(data, date, selection, now);
  assert.deepEqual(summary.map(s => [s.courtId, s.start, s.end, s.available, s.eligible, String(s.cents)]), [
    ['1', start, start + 2 * hour, true, true, '40000'],
    ['2', start + hour, start + 3 * hour, true, true, '40000'],
  ]);
});
