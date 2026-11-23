import test from "node:test";
import assert from "node:assert/strict";
import { dashboardDateOffset, ethnDashboard } from "../src/lib/admin/ethn-booking-read";
import { cents, comparison, pesos } from "../src/app/admin/dashboard-overview-types";

const actor = "00000000-0000-4000-8000-000000000021";
test("dashboard dates and exact money comparisons", () => {
  assert.equal(dashboardDateOffset("2026-03-01", -14), "2026-02-15");
  assert.equal(dashboardDateOffset("2026-01-01", -29), "2025-12-03");
  assert.equal(pesos("123456789012345678.09"), "₱123,456,789,012,345,678.09");
  assert.equal(cents("-1.05"), -BigInt(105));
  assert.equal(comparison(BigInt(100), BigInt(0)), "No comparable baseline");
  assert.equal(comparison(BigInt(150), BigInt(100)), "+50.0% vs prior 15 days");
});
test("staff dashboard excludes finance and bounds non-held booking periods", async () => {
  const queries: { sql: string; args?: unknown[] }[] = [];
  const pool = { connect: async () => ({ release() {}, query: async (sql: string, args?: unknown[]) => {
    queries.push({ sql, args });
    if (sql.includes("SELECT role")) return { rows: [{ role: "staff" }] };
    if (sql.includes("anchor_minutes")) return { rows: [{ now: new Date("2026-03-01T00:00:00Z"), anchor_minutes: 420 }] };
    if (sql.includes("AS held")) return { rows: [{ pending: 1 }] };
    if (sql.includes("AS current")) return { rows: [{ current: 3, prior: 2, today: 1 }] };
    if (sql.includes("LIMIT 8")) return { rows: [] };
    return { rows: [] };
  } }) };
  const data = await ethnDashboard(pool as never, async () => actor);
  assert.equal("finance" in data, false);
  const periods = queries.find(q => q.sql.includes("AS current"))!;
  assert.match(periods.sql, /status <> 'held'/);
  assert.deepEqual(periods.args, ["2026-03-01", "2026-02-15", "2026-01-31"]);
  assert.match(queries.find(q => q.sql.includes("LIMIT 8"))!.sql, /status <> 'held'/);
});
