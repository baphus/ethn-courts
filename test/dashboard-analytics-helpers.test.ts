import { strict as assert } from "node:assert";
import { test } from "node:test";
import { analyticsAverage, analyticsCents, analyticsMoney, analyticsMonth, analyticsParams } from "../src/lib/admin/dashboard-analytics-helpers";

test("analytics money stays exact and rounds signed averages away from zero", () => {
  assert.equal(analyticsCents("9007199254740993.99"), BigInt("900719925474099399"));
  assert.equal(analyticsMoney(analyticsCents("-123.4")), "-123.40");
  assert.equal(analyticsAverage(BigInt("1"), 2), "0.01");
  assert.equal(analyticsAverage(-BigInt("1"), 2), "-0.01");
  assert.equal(analyticsAverage(-BigInt("5"), 3), "-0.02");
  assert.throws(() => analyticsCents("1.001"));
  assert.throws(() => analyticsAverage(BigInt("1"), 0));
});

test("analytics parameters reject unknown or duplicate keys and months outside 24 months", () => {
  analyticsParams(new URLSearchParams("section=chart&month=2025-01"), ["section", "month"]);
  assert.throws(() => analyticsParams(new URLSearchParams("section=chart&section=hero"), ["section"]));
  assert.throws(() => analyticsParams(new URLSearchParams("section=chart&extra=1"), ["section"]));
  assert.equal(analyticsMonth("2025-01", "2026-12"), "2025-01");
  assert.throws(() => analyticsMonth("2024-12", "2026-12"));
  assert.throws(() => analyticsMonth("2027-01", "2026-12"));
  assert.throws(() => analyticsMonth("0000-01", "2026-12"));
});
