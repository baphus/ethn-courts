import test from "node:test";
import assert from "node:assert/strict";
import { ethnDashboard } from "../src/lib/admin/ethn-booking-read";
const id = "00000000-0000-4000-8000-000000000021";
function mock(fail = false) {
  const ranges: unknown[][] = [];
  const pool = { connect: async () => ({ release() {}, query: async (sql: string, args?: unknown[]) => {
    if (sql.includes("SELECT role")) return { rows: [{ role: "owner" }] };
    if (sql.includes("SELECT 1 FROM ethn.staff_access")) return { rows: [{}] };
    if (sql.includes("anchor_minutes")) return { rows: [{ now: new Date("2026-03-01T00:00:00Z"), anchor_minutes: 420 }] };
    if (sql.includes("transaction_timestamp")) return { rows: [{ now: new Date("2026-03-01T00:00:00Z") }] };
    if (sql.includes("AS held")) return { rows: [{}] };
    if (sql.includes("AS current")) return { rows: [{ current: 0, prior: 0, today: 0 }] };
    if (sql.includes("LIMIT 8")) return { rows: [] };
    if (sql.includes("WITH days")) {
      if (fail) throw new Error("finance unavailable");
      ranges.push(args!);
      return { rows: [{ bookingcash: "0.10", bookinggcash: "0.20", salescash: "0.03", salesgcash: "0.00", cash: "0.13", gcash: "0.20", other:'0.00', refunds:'0.00', collected: "0.33", expenses: "0.01", date: "2026-03-01" }] };
    }
    return { rows: [] };
  } }) };
  return { pool, ranges };
}
test("owner dashboard uses finance ledger and exact totals", async () => {
  const { pool, ranges } = mock();
  const data = await ethnDashboard(pool as never, async () => id);
  assert.ok("finance" in data);
  assert.deepEqual(data.finance, { current: "0.30", prior: "0.30", month: { cash: "0.13", gcash: "0.20", other:'0.00', refunds:'0.00', collected: "0.33", expenses: "0.01", net: "0.32" } });
  assert.deepEqual(ranges, [["2026-02-15", "2026-03-01"], ["2026-01-31", "2026-02-14"], ["2026-03-01", "2026-03-01"]]);
});
test("owner finance failure is not reported as zero", async () => {
  await assert.rejects(ethnDashboard(mock(true).pool as never, async () => id), /finance unavailable/);
});
