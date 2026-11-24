import test from "node:test";
import assert from "node:assert/strict";
import { cashChange, formatCashAmount } from "../src/lib/admin/finance-cash";

test("cash comparison uses percentages only for a positive baseline and a nonnegative current value", () => {
  assert.equal(cashChange("125.00", "100.00"), "+25.0%");
  assert.equal(cashChange("0.00", "10.00"), "−100.0%");
  assert.equal(cashChange("3.25", "0.00"), "+₱3.25");
  assert.equal(cashChange("-3.25", "10.00"), "−₱13.25");
  assert.equal(cashChange("-10.00", "-20.00"), "+₱10.00");
  assert.equal(cashChange("0.00", "0.00"), null);
  assert.equal(cashChange("125.00", "125.00"), null);
  assert.equal(formatCashAmount("-90071992547409.01"), "−₱90,071,992,547,409.01");
});
