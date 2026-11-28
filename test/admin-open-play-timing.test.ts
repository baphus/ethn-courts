import test from "node:test";
import assert from "node:assert/strict";
import { openPlayTimes, savedManilaTime, timeOptions } from "../src/app/admin/open-plays/timing";

test("Open Play timing respects the selected Manila date and rolls overnight across year-end", () => {
  assert.deepEqual(openPlayTimes("2026-12-31", "18:00", "20:00"), { startsAt: "2026-12-31T10:00:00.000Z", endsAt: "2026-12-31T12:00:00.000Z" });
  assert.deepEqual(openPlayTimes("2026-12-31", "18:00", "09:00"), { startsAt: "2026-12-31T10:00:00.000Z", endsAt: "2027-01-01T01:00:00.000Z" });
  assert.equal(openPlayTimes("2026-12-31", "18:00", "18:00"), null);
  assert.equal(openPlayTimes("", "18:00", "20:00"), null);
});

test("dropdowns offer hourly options and keep exact saved off-hour times", () => {
  assert.equal(timeOptions("").length, 24);
  assert.equal(timeOptions("").find(option => option.value === "18:00")?.label, "6PM");
  const instant = "2026-12-31T16:15:21.123Z";
  const [date, time] = savedManilaTime(instant);
  assert.deepEqual([date, time], ["2027-01-01", "00:15:21.123"]);
  assert.equal(openPlayTimes(date, time, "01:00")?.startsAt, instant);
  assert.ok(timeOptions(time, "23:00").some(option => option.value === time && option.label.includes("next day")));
  assert.ok(!timeOptions("", "23:00").some(option => option.value === "23:00"));
});
