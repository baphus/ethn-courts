import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeIntervals, bookingCount, courtStatus, dashboardCourtSchedule, position, intervalLabel } from "../src/components/admin/court-timeline-utils";
import type { Interval, Calendar } from "../src/app/admin/calendar/calendar-range";
const base: Interval = { id: "1", kind: "booking", state: "confirmed", bookingId: "b", blockId: null, guestName: "Guest", reason: null, startsAt: "2026-11-22T00:00:00Z", endsAt: "2026-11-22T01:00:00Z" };
const next = { ...base, id: "2", startsAt: base.endsAt, endsAt: "2026-11-22T02:00:00Z" };
test("hourly geometry, identity-safe merging, unique counts and truthful labels", () => {
  const window = { startsAt: base.startsAt, endsAt: next.endsAt };
  assert.equal(position(window, base.startsAt, base.endsAt)?.height, 64);
  const merged = mergeIntervals([base, next]);
  assert.equal(merged.length, 1); assert.equal(position(window, merged[0].startsAt, merged[0].endsAt)?.height, 128);
  assert.equal(base.endsAt, next.startsAt);
  assert.equal(mergeIntervals([base, { ...next, bookingId: "other" }]).length, 2);
  assert.equal(mergeIntervals([{ ...base, bookingId: null }, { ...next, bookingId: null }]).length, 2);
  const block: Interval = { ...base, kind: "maintenance", bookingId: null, blockId: "x" };
  assert.equal(mergeIntervals([block, { ...block, ...next, kind: "maintenance", bookingId: null, blockId: "y" }]).length, 2);
  const court: Calendar["courts"][number] = { id: "c", name: "Court", active: true, intervals: [base, next, { ...next, id: "3", bookingId: "other" }] };
  assert.equal(bookingCount(court), 2);
  assert.equal(courtStatus(court, true, Date.parse(base.startsAt)).title, "Reserved now");
  assert.equal(courtStatus({ ...court, intervals: [] }, true, Date.parse(base.startsAt)).title, "No scheduled allocation");
  assert.equal(intervalLabel({ ...base, state: "held", reason: "secret" }), "Unavailable");
});

test("dashboard court view keeps live and future confirmed bookings and future blocks", () => {
  const now = Date.parse(base.startsAt) + 30 * 60_000;
  const block: Interval = { ...next, id: "block", kind: "maintenance", blockId: "x", bookingId: null };
  const excluded = [
    { ...base, id: "ended", endsAt: new Date(now).toISOString() },
    ...["pending", "held", "completed"].map(state => ({ ...next, id: state, state })),
  ];
  const day: Calendar = {
    date: "2026-11-22", serverNow: new Date(now).toISOString(), window: { startsAt: base.startsAt, endsAt: next.endsAt },
    courts: [{ id: "c", name: "Court", active: true, intervals: [base, next, block, ...excluded] }],
  };
  const [court] = dashboardCourtSchedule(day, now).courts;
  assert.deepEqual(court.intervals, [base, next, block]);
  assert.equal(courtStatus(court, true, now).current?.id, base.id);
  assert.equal(day.courts[0].intervals.length, 7);
});
