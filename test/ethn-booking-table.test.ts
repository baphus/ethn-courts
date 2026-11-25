import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBookingSchedule } from "../src/lib/admin/ethn-booking-schedule";
import { formatPlayTime } from "../src/app/admin/bookings/booking-play-time";
import { POST } from "../src/app/api/ethn/admin/extensions/hold/route";

test("booking table combines contiguous court ranges, groups matching times and preserves gaps", () => {
  const start = "2026-11-26T14:30:00.000Z", midnight = "2026-11-26T16:00:00.000Z";
  const end = "2026-11-26T17:00:00.000Z", afterGap = "2026-11-26T17:30:00.000Z", late = "2026-11-26T18:00:00.000Z";
  const schedule = summarizeBookingSchedule([
    { courtName: "Court 1", startsAt: midnight, endsAt: end, durationMinutes: 60, intervalMinutes: 60 },
    { courtName: "Court 2", startsAt: start, endsAt: end, durationMinutes: 150, intervalMinutes: 30 },
    { courtName: "Court 1", startsAt: start, endsAt: midnight, durationMinutes: 90, intervalMinutes: 30 },
    { courtName: "Court 1", startsAt: afterGap, endsAt: late, durationMinutes: 30, intervalMinutes: 30 },
  ]);
  assert.deepEqual(schedule, {
    slotCount: 10,
    courtNames: ["Court 1", "Court 2"],
    playTimes: [
      { startsAt: start, endsAt: end, courts: ["Court 1", "Court 2"] },
      { startsAt: afterGap, endsAt: late, courts: ["Court 1"] },
    ],
  });
  assert.match(formatPlayTime(start, end, "2026-11-26"), /10:30\s*PM–1:00\s*AM \(\+1 day\)/i);
  assert.match(formatPlayTime(afterGap, late, "2026-11-26"), /1:30\s*AM–2:00\s*AM \(\+1 day\)/i);
});

test("the new extension hold endpoint is retired without reading request or DB", async () => {
  const response = POST();
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "RETIRED" });
});
