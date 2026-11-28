import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingWindowCell } from '../src/components/admin/dashboard/booking-window-cell';

const time = (clock: string) => `2026-11-28T${clock}:00+08:00`;
const window = (opens: string, closes: string) => ({ opensAt: time(opens), closesAt: time(closes) });
const allocation = (starts: string, ends: string) => ({ startsAt: time(starts), endsAt: time(ends), state: 'held' });

test('booking window marks only a full, clear hour as open', () => {
  const status = (windows: ReturnType<typeof window>[], occupied: ReturnType<typeof allocation>[] = []) =>
    bookingWindowCell({ id: '1', name: 'Court 1', windows, occupied }, Date.parse(time('10:00')));
  const full = [window('10:00', '11:00')];
  const late = [window('10:30', '12:00')];
  assert.deepEqual(status(full, [allocation('09:30', '10:00'), allocation('11:00', '12:00')]), { status: 'Open', detail: 'Full hour clear' });
  assert.deepEqual(status([window('11:00', '12:00')]), { status: 'Closed', detail: 'Outside opening hours' });
  assert.deepEqual(status(late), { status: 'Unavailable', detail: '30 min outside opening hours' });
  assert.deepEqual(status(full, [allocation('09:30', '10:30')]), { status: 'Unavailable', detail: '30 min booked, held, or blocked' });
  assert.deepEqual(status(late, [allocation('10:15', '10:45')]), { status: 'Unavailable', detail: '30 min outside opening hours; 15 min booked, held, or blocked' });
  assert.deepEqual(status(full, [allocation('10:00', '11:00')]), { status: 'Unavailable', detail: '60 min booked, held, or blocked' });
});
