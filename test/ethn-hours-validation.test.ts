import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEthnHoursIssues, validateEthnHours } from '../src/lib/admin/ethn-hours-validation';
import { scheduleWindows } from '../src/lib/booking/schedule';
import { manilaWallClock } from '../src/lib/booking/slots';

const at = (date: string, hour: number, minute = 0) => new Date(manilaWallClock(date, hour, minute).getTime());
const row = (weekday: number, opens = '07:00', closes = '03:00', hourly_rate: string | null = '100.00') => ({ weekday, opens, closes, hourly_rate });
const base = () => ({ settings: { anchorMinutes: 420, interval: 30, minimum: 30 }, courts: [{ id: '1', active: true, hours: [row(0)] }], allocations: [] as { courtId: string; operatingDate: string; start: Date; end: Date; state: string; expiresAt: Date | null }[], oldHours: [] as ({ weekday: number; opens: string; closes: string; hourly_rate: string | null; court_id: string })[], now: at('2026-11-01', 10) });
const allocation = (state = 'pending') => ({ courtId: '1', operatingDate: '2026-11-01', start: at('2026-11-01', 9), end: at('2026-11-01', 11), state, expiresAt: at('2026-11-01', 11) });
const ok = { ok: true };
const invalid = { error: 'INVALID_SCHEDULE' };
const conflict = { error: 'HOURS_CONFLICT' };

test('weekly windows validate overnight overlap, anchor and rates', () => {
  const input = base();
  assert.deepEqual(validateEthnHours(input), ok);
  input.courts[0].hours.push(row(1, '02:00', '04:00'));
  assert.deepEqual(validateEthnHours(input), invalid);
  input.courts[0].hours = [row(0, '23:00', '08:00')];
  assert.deepEqual(validateEthnHours(input), invalid);
  input.courts[0].hours = [row(0, '07:00', '03:00', null)];
  assert.deepEqual(validateEthnHours(input), ok);
  input.courts[0].hours[0].hourly_rate = '1e2';
  assert.deepEqual(validateEthnHours(input), invalid);
});

test('diagnostics identify exact overlapping windows and operating-day boundaries', () => {
  const hours = [row(0, '09:00', '17:00', '150'), row(0, '05:00', '00:00', '250')];
  assert.deepEqual(findEthnHoursIssues(hours, 420), [
    { kind: 'boundary', rows: [1] }, { kind: 'overlap', rows: [0, 1] },
  ]);
  hours[1].opens = '17:00';
  assert.deepEqual(findEthnHoursIssues(hours, 420), []);
  assert.deepEqual(findEthnHoursIssues([row(6, '17:00', '03:00'), row(0, '02:00', '04:00')], 420), [
    { kind: 'overlap', rows: [0, 1] },
  ]);
  assert.deepEqual(findEthnHoursIssues([row(1, '25:00', '03:00', '1e2')], 420), [
    { kind: 'invalid_time', rows: [0] }, { kind: 'invalid_rate', rows: [0] },
  ]);
});

test('weekly diagnostics agree with booking windows at week wrap and anchor edges', () => {
  const schedules = [
    [row(6, '07:00', '03:00'), row(0, '03:00', '05:00')],
    [row(6, '07:00', '03:00'), row(0, '02:59', '05:00')],
    [row(0, '07:00', '07:00')],
    [row(0, '07:00', '00:00'), row(1, '00:00', '07:00')],
  ];
  for (const schedule of schedules) {
    for (const anchor of [0, 180, 420, 421, 1439]) {
      const hours = schedule.map(window => ({ ...window, court_id: '1' }));
      const rejected = Array.from({ length: 7 }, (_, day) => scheduleWindows(`2026-11-0${day + 1}`, anchor, '1', hours)).some(result => 'error' in result);
      assert.equal(findEthnHoursIssues(schedule, anchor).length > 0, rejected, JSON.stringify({ schedule, anchor }));
    }
  }
});

test('changed weekly hours do not block live holds or bookings, but deactivation does', () => {
  const input = base();
  input.allocations = [allocation('held')];
  input.courts[0].hours = [row(0, '10:00', '03:00')];
  assert.deepEqual(validateEthnHours(input), ok);
  input.courts[0].active = false;
  assert.deepEqual(validateEthnHours(input), conflict);
  input.allocations[0].expiresAt = input.now;
  assert.deepEqual(validateEthnHours(input), ok);
  input.courts[0].active = true;
  for (const state of ['pending', 'confirmed']) {
    input.allocations = [allocation(state)];
    assert.deepEqual(validateEthnHours(input), ok);
  }
  input.courts[0].hours = [row(0, '07:00', '03:00', '999.99')];
  assert.deepEqual(validateEthnHours(input), ok);
  input.courts[0].hours[0].hourly_rate = null;
  assert.deepEqual(validateEthnHours(input), ok);
  input.courts[0].active = false;
  assert.deepEqual(validateEthnHours(input), conflict);
  input.courts[0].active = true;
  input.courts[0].hours = [row(0, '08:00', '04:00')];
  assert.deepEqual(validateEthnHours(input), ok);
  input.allocations[0].start = at('2026-11-01', 9, 15);
  assert.deepEqual(validateEthnHours(input), ok);
  input.allocations[0] = { ...allocation(), courtId: 'missing' };
  assert.deepEqual(validateEthnHours(input), conflict);
});

test('block hours edits retain only overlap with old opening window', () => {
  const input = base(); input.now = at('2026-11-01', 7); input.oldHours = [{ ...row(0), court_id: '1' }];
  input.allocations = [{ courtId:'1', operatingDate:'2026-11-01', start:at('2026-11-01',5), end:at('2026-11-01',9), state:'block', expiresAt:null }];
  input.courts[0].hours = [row(0,'09:00','03:00')];
  assert.deepEqual(validateEthnHours(input), conflict);
  input.courts[0].hours = [row(0,'07:00','03:00')];
  assert.deepEqual(validateEthnHours(input), ok);
});

test('completed and past allocations ignored', () => {
  const input = base();
  input.courts[0].active = false;
  input.allocations = [allocation('completed'), { ...allocation('confirmed'), end: input.now }];
  assert.deepEqual(validateEthnHours(input), ok);
});
