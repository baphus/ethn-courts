import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEthnHours } from '../src/lib/admin/ethn-hours-validation';
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

test('live allocations survive proposed hours and inactive courts', () => {
  const input = base();
  input.allocations = [allocation('held')];
  input.courts[0].hours = [row(0, '10:00', '03:00')];
  assert.deepEqual(validateEthnHours(input), conflict);
  input.allocations[0].expiresAt = input.now;
  assert.deepEqual(validateEthnHours(input), ok);
  input.allocations = [allocation()];
  assert.deepEqual(validateEthnHours(input), conflict);
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
  assert.deepEqual(validateEthnHours(input), conflict);
  input.allocations[0] = { ...allocation(), operatingDate: '2026-02-30' };
  assert.deepEqual(validateEthnHours(input), conflict);
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
