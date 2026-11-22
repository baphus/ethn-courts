import test from "node:test";
import assert from "node:assert/strict";
import { formatDisplayDate } from "../src/lib/display-date.ts";

test("display dates read as long month names", () => {
  assert.equal(formatDisplayDate("2026-10-19"), "October 19, 2026");
  assert.equal(formatDisplayDate("2026-11-01"), "November 1, 2026");
});

test("non-calendar values pass through untouched", () => {
  assert.equal(formatDisplayDate("2026-10-19T08:30:00Z"), "2026-10-19T08:30:00Z");
  assert.equal(formatDisplayDate("October 19, 2026"), "October 19, 2026");
  assert.equal(formatDisplayDate(""), "");
});
