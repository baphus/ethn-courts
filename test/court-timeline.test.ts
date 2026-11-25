import { test } from "node:test";
import assert from "node:assert/strict";
import { attention, bookingTarget, currentPosition, HOUR_PX, intervalLabel, position } from "../src/components/admin/court-timeline-utils";
import type { Calendar, Interval } from "../src/app/admin/calendar/calendar-range";

const window = { startsAt: "2026-11-22T15:00:00Z", endsAt: "2026-11-23T03:00:00Z" };
const item: Interval = { id: "1", startsAt: "2026-11-22T14:00:00Z", endsAt: "2026-11-22T16:00:00Z", state: "held", kind: "booking", bookingId: "secret", guestName: "Secret", blockId: null, reason: null };
test("timeline clips overnight intervals and current line", () => {
  assert.deepEqual(position(window, item.startsAt, item.endsAt), { top: 0, height: HOUR_PX });
  assert.deepEqual(position(window, "2026-11-23T02:00:00Z", "2026-11-23T04:00:00Z"), { top: 11 * HOUR_PX, height: HOUR_PX });
  assert.equal(position(window, "2026-11-23T03:00:00Z", "2026-11-23T04:00:00Z"), null);
  assert.equal(currentPosition(window, Date.parse(window.endsAt)), null);
  assert.equal(currentPosition(window, Date.parse(window.startsAt)), 0);
});
test("held label hides identity and attention deduplicates past pending bookings", () => {
  assert.equal(intervalLabel(item), "Unavailable");
  assert.equal(bookingTarget(item), null);
  const pending = { ...item, state: "pending", bookingId: "b" };
  assert.equal(bookingTarget(pending), "b");
  assert.match(intervalLabel(pending), /pending/);
  const day: Calendar = { date: "2026-11-22", serverNow: window.startsAt, window, courts: [{ id: "c", name: "Court", active: true, intervals: [item, pending, { ...pending, id: "2" }, { ...pending, id: "3", bookingId: "future", startsAt: window.endsAt }] }] };
  assert.equal(attention(day, Date.parse(window.startsAt)).length, 1);
  assert.deepEqual(attention({ ...day, courts: [] }, Date.now()), []);
});
