import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDates, rangeDates, stepPeriod, uniqueScheduleDays, type Calendar } from "../src/app/admin/calendar/calendar-range.ts";

const day = (date: string): Calendar => ({ date, serverNow: "2026-12-31T16:00:00Z", window: { startsAt: `${date}T00:00:00Z`, endsAt: "2027-01-01T00:00:00Z" }, courts: [{ id: "1", name: "Court", active: true, intervals: [{ id: "a", startsAt: "2026-12-31T15:00:00Z", endsAt: "2027-01-01T17:00:00Z", state: "confirmed", kind: "private", bookingId: null, guestName: null, blockId: "a", reason: "" }] }] });

test("ranges cross years and monthly grid stays bounded", () => {
  assert.deepEqual(rangeDates("2027-01-01", "weekly"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  for (const [date, count] of [["2027-01-31", 31], ["2026-11-16", 30], ["2027-02-14", 28], ["2028-02-14", 29]] as const) {
    const dates = rangeDates(date, "monthly");
    assert.equal(dates.length, count);
    assert.equal(dates[0], `${date.slice(0, 7)}-01`);
    assert.equal(dates.at(-1), `${date.slice(0, 7)}-${count}`);
    assert.ok(dates.every(day => day.slice(0, 7) === date.slice(0, 7)));
    assert.equal(new Set(dates).size, count);
  }
  assert.equal(stepPeriod("2027-01-31", "monthly", 1), "2027-02-01");
});

test("schedule deduplicates intervals crossing operating windows", () => {
  const dates = ["2026-12-31", "2027-01-01"];
  const result = uniqueScheduleDays(dates, { [dates[0]]: day(dates[0]), [dates[1]]: day(dates[1]) });
  assert.equal(result[dates[0]]!.courts[0].intervals.length, 1);
  assert.equal(result[dates[1]]!.courts[0].intervals.length, 0);
});

test("loading bounds concurrency, records failures, and stops after abort", async () => {
  const dates = rangeDates("2027-01-01", "weekly"); let active = 0, max = 0;
  const result = await loadDates(dates, new AbortController().signal, async date => { active++; max = Math.max(max, active); await Promise.resolve(); active--; if (date === dates[2]) throw Error("failed"); return day(date); });
  assert.equal(max, 4); assert.equal(result[dates[2]], null); assert.equal(Object.keys(result).length, 7);
  const controller = new AbortController(); let calls = 0;
  await loadDates(dates, controller.signal, async date => { calls++; controller.abort(); return day(date); });
  assert.equal(calls, 1);
});
