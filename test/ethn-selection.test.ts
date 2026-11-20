import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, selectRange, slots } from "../src/components/booking/ethn-selection.ts";

test("selection stays within one window and never crosses occupied slots", () => {
  const window = { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T03:00:00.000Z", hourlyRate: "100.00" };
  const grid = slots(window, [{ startsAt: "2026-01-01T01:00:00.000Z", endsAt: "2026-01-01T01:30:00.000Z", state: "pending" }], 30, Date.parse(window.opensAt));
  const first = selectRange("1", 0, window, grid, 0);
  assert.equal(selectRange("1", 0, window, grid, 1, first)?.end, "2026-01-01T01:00:00.000Z");
  assert.equal(selectRange("1", 0, window, grid, 3, first)?.start, "2026-01-01T01:30:00.000Z");
  assert.equal(selectRange("1", 1, window, grid, 1, first)?.start, "2026-01-01T00:30:00.000Z");
  assert.equal(slots(window, [], 30, Date.parse("2026-01-01T00:00:01Z"))[0].available, false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
