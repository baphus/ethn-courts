import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planQuickSchedule } from '../src/app/admin/courts/quick-schedule';

const window = (weekday: number, opens: string, closes: string) => ({ id: '', weekday, opens, closes, hourlyRate: '150.00' });

test('Quick Setup replaces only overlapping selected hours; touching windows stay', () => {
  const daytime = window(0, '09:00', '17:00');
  const evening = window(0, '17:00', '22:00');
  const monday = window(1, '17:00', '22:00');
  const proposed = window(0, '17:00', '00:00');
  const result = planQuickSchedule([daytime, evening, monday], [proposed], 420);
  assert.deepEqual(result.replaced, [evening]);
  assert.deepEqual(result.hours, [daytime, proposed, monday]);
  assert.deepEqual(result.issues, []);
});

test('Quick Setup detects overnight spill across Saturday and never replaces unselected Sunday', () => {
  const sunday = window(0, '02:00', '04:00');
  const saturday = window(6, '17:00', '03:00');
  const result = planQuickSchedule([sunday], [saturday], 420);
  assert.deepEqual(result.replaced, []);
  assert.deepEqual(result.unselectedSpill, [sunday]);
  assert.deepEqual(result.hours, [sunday, saturday]);
  assert.equal(result.issues[0].kind, 'overlap');
});

test('Quick Setup does not preview replacement for a range that crosses the operating day', () => {
  const existing = window(0, '09:00', '17:00');
  const result = planQuickSchedule([existing], [window(0, '05:00', '00:00')], 420);
  assert.deepEqual(result.replaced, []);
  assert.equal(result.proposedIssues[0].kind, 'boundary');
});
