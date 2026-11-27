import { test } from "node:test";
import assert from "node:assert/strict";
import { formatScheduleRange, formatScheduleTime, formatWeeklyHours } from "../src/lib/booking/schedule-label";

const date = "2026-12-31";
const at = (time: string, day = date) => `${day}T${time}:00+08:00`;

test("Manila schedule labels omit zero minutes and repeated AM/PM", () => {
  assert.equal(formatScheduleTime("2026-12-30T23:00:00Z"), "7AM");
  assert.equal(formatScheduleRange(at("07:00"), at("08:00"), date), "7–8AM");
  assert.equal(formatScheduleRange(at("10:00"), at("12:00"), date), "10AM–12PM");
  assert.equal(formatScheduleRange(at("10:30"), at("11:15"), date), "10:30–11:15AM");
});

test("schedule ranges retain next-day and multi-day context across New Year", () => {
  const midnight = at("00:00", "2027-01-01");
  assert.equal(formatScheduleRange(at("22:00"), midnight, date), "10PM–12AM (+1 day)");
  assert.equal(formatScheduleRange(midnight, at("01:00", "2027-01-01"), date), "12–1AM (+1 day)");
  assert.equal(formatScheduleRange(at("22:00"), midnight), "Dec 31, 2026 · 10PM–12AM (+1 day)");
  assert.equal(formatScheduleRange(at("22:00"), at("08:30", "2027-01-02")), "Dec 31, 2026 · 10PM–Jan 2, 2027 · 8:30AM");
  assert.equal(formatScheduleRange(at("22:00"), at("08:30", "2027-01-02"), date), "10PM–Jan 2, 2027 · 8:30AM");
});

test("weekly hours preserve overnight and 24-hour windows", () => {
  assert.equal(formatWeeklyHours("07:00:00", "10:00:00"), "7–10AM");
  assert.equal(formatWeeklyHours("22:30", "00:00"), "10:30PM–12AM (+1 day)");
  assert.equal(formatWeeklyHours("07:00", "07:00"), "All day (24 hours)");
});
