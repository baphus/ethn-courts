import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDate, toIso } from "../src/app/admin/calendar/date-utils.ts";

test("calendar dates navigate across years and convert overnight Manila times", () => {
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2027-01-01", -1), "2026-12-31");
  assert.equal(toIso("2026-12-31", "23:00"), "2026-12-31T15:00:00.000Z");
  assert.equal(toIso("2027-01-01", "01:00"), "2026-12-31T17:00:00.000Z");
  assert.equal(toIso("", ""), null);
});
