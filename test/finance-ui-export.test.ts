import { strict as assert } from "node:assert";
import { test } from "node:test";
import { financeExportRows } from "../src/app/admin/finance/finance-export.ts";

test("finance export retains exact aggregate strings and scope", () => {
  const amounts = { cash: "9007199254740993.01", gcash: "0.02", other:'0.00', collected: "9007199254740993.03", refunds:'0.00', expenses: "1.00", net: "9007199254740992.03" };
  const rows = financeExportRows({ from: "2026-01-01", to: "2026-01-31", scope: "Includes verified collections and paid sales with dated corrections", totals: amounts, daily: [{ date: "2026-01-01", ...amounts }] });
  assert.equal(rows[1][1], "Includes verified collections and paid sales with dated corrections");
  assert.deepEqual(rows.slice(2, 4), [["From", "January 1, 2026"], ["To", "January 31, 2026"]]);
  assert.deepEqual(rows[5], ["January 1, 2026", ...Object.values(amounts)]);
  assert.deepEqual(rows[6], ["Total", ...Object.values(amounts)]);
});
