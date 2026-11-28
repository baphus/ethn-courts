import test from "node:test";
import assert from "node:assert/strict";
import { ethnDashboard } from "../src/lib/admin/ethn-booking-read";
import { cents, comparison, pesos } from "../src/app/admin/dashboard-overview-types";

const actor = "00000000-0000-4000-8000-000000000021";
test("dashboard dates and exact money comparisons", () => {
  assert.equal(pesos("123456789012345678.09"), "₱123,456,789,012,345,678.09");
  assert.equal(cents("-1.05"), -BigInt(105));
  assert.equal(comparison(BigInt(100), BigInt(0)), "No comparable baseline");
  assert.equal(comparison(BigInt(150), BigInt(100)), "+50.0% vs prior 15 days");
});
test("staff dashboard excludes finance and counts approved bookings on the operating date", async () => {
  const queries: { sql: string; args?: unknown[] }[] = [];
  const pool = { connect: async () => ({ release() {}, query: async (sql: string, args?: unknown[]) => {
    queries.push({ sql, args });
    if (sql.includes("SELECT role")) return { rows: [{ role: "staff" }] };
    if (sql.includes("anchor_minutes")) return { rows: [{ now: new Date("2026-03-01T00:00:00Z"), anchor_minutes: 420 }] };
    if (sql.includes("AS completed")) return { rows: [{ confirmed: 1, completed: 2 }] };
    if (sql.includes("LIMIT 8")) return { rows: [{ id: actor, guest_name: "Guest", status: "confirmed", operating_date: "2026-03-01", created_at: new Date("2026-02-28T00:00:00Z"), approved_at: new Date("2026-03-01T00:00:00Z"), total: "100.00", item_count: 1, slot_count: 4 }] };
    return { rows: [] };
  } }) };
  const data = await ethnDashboard(pool as never, async () => actor);
  assert.equal("finance" in data, false);
  assert.equal("pendingReview" in data, false);
  assert.ok(!queries.some(q => q.sql.includes('AS "pastStart"')));
  assert.equal(data.recentBookings[0].slotCount, 4);
  assert.deepEqual(data.counts, { confirmed: 1, completed: 2 });
  const counts = queries.find(q => q.sql.includes("AS completed"))!;
  assert.match(counts.sql, /operating_date = \$1::date/);
  assert.deepEqual(counts.args, ["2026-03-01"]);
});
