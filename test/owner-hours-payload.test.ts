import { test } from "node:test";
import assert from "node:assert/strict";
import { schedulePayload } from "../src/app/admin/courts/schedule-payload";

test("schedule payload includes inactive courts and only writable fields, preserving decimal strings", () => {
  assert.deepEqual(schedulePayload({ version: "9", merchant: "private", intervalMinutes: 30, minimumMinutes: 60, anchorMinutes: 420, horizonDays: 30, holdMinutes: 10, courts: [
    { id: "1", name: "A", active: true, hours: [{ id: "11", weekday: 2, opens: "07:00:00", closes: "03:00:00", hourlyRate: " 9999999999.99 " }, { id: "12", weekday: 3, opens: "08:00", closes: "09:00", hourlyRate: " " }] },
    { id: "2", name: "B", active: false, hours: [{ id: "13", weekday: 0, opens: "00:00:00", closes: "00:00:00", hourlyRate: null }] },
  ] }), { version: "9", courts: [
    { id: "1", active: true, hours: [{ weekday: 2, opens: "07:00", closes: "03:00", hourly_rate: "9999999999.99" }, { weekday: 3, opens: "08:00", closes: "09:00", hourly_rate: null }] },
    { id: "2", active: false, hours: [{ weekday: 0, opens: "00:00", closes: "00:00", hourly_rate: null }] },
  ] });
});
