import test from "node:test";
import assert from "node:assert/strict";
import { financeFilters, validFinancePeriod } from "../src/lib/admin/finance-filters";

const today = "2026-11-24";
test("Finance restores URL filters and defaults invalid dates to the last 30 Manila days", () => {
  assert.deepEqual(financeFilters(new URLSearchParams(), today), { from: "2026-10-26", to: today, category: "", q: "" });
  assert.deepEqual(financeFilters(new URLSearchParams({ from: "2026-11-01", to: today, category: "Supplies", q: " A%_ " }), today), { from: "2026-11-01", to: today, category: "Supplies", q: "A%_" });
  for (const from of ["2026-02-30", "2026-11-25", "2025-11-23"]) assert.equal(validFinancePeriod(from, today, today), false);
  assert.equal(validFinancePeriod("2025-11-24", today, today), true);
});
