import test from 'node:test';
import assert from 'node:assert/strict';
import { closingOptions, keepClosingTime, openingOptions } from '../src/app/admin/courts/hour-options';
import { planQuickSchedule } from '../src/app/admin/courts/quick-schedule';

test('hour selectors preserve saved minutes and label valid next-day closes', () => {
  assert.equal(openingOptions().length, 24);
  assert.ok(openingOptions('08:30:00').some(option => option.value === '08:30'));
  const closes = closingOptions('17:00', 420, '17:30');
  assert.equal(closes[0].value, '17:30');
  assert.deepEqual(closes.find(option => option.value === '00:00'), { value: '00:00', label: '12:00 AM (+1 day)' });
  assert.equal(closes.at(-1)?.value, '07:00');
  assert.equal(closingOptions('07:00', 420).at(-1)?.label, 'Open 24 hours');
  assert.equal(closingOptions('05:00', 420).at(-1)?.value, '07:00');
  assert.equal(keepClosingTime('07:00', '07:00', 420), '');
  assert.equal(keepClosingTime('05:00', '08:00', 420), '');
  assert.equal(keepClosingTime('17:00', '00:00', 420), '00:00');
});

test('requested evening rates are adjacent to daytime blocks and do not replace them', () => {
  const days = Array.from({ length: 7 }, (_, weekday) => weekday);
  const day = days.map(weekday => ({ id: '', weekday, opens: '09:00', closes: '17:00', hourlyRate: '150' }));
  const evening = days.map(weekday => ({ id: '', weekday, opens: '17:00', closes: weekday < 5 ? '00:00' : '02:00', hourlyRate: weekday < 5 ? '250' : '300' }));
  const first = planQuickSchedule(day, evening.slice(0, 5), 420);
  const second = planQuickSchedule(first.hours, evening.slice(5), 420);
  assert.deepEqual([first.issues, first.replaced, second.issues, second.replaced], [[], [], [], []]);
  assert.equal(second.hours.length, 14);
});
