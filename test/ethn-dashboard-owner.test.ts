import test from "node:test";
import assert from "node:assert/strict";
import { ethnDashboard } from "../src/lib/admin/ethn-booking-read";

const id = "00000000-0000-4000-8000-000000000021";

test("dashboard overview returns approved bookings in approval order without cash-ledger reads", async () => {
  const approved = new Date("2026-03-01T00:00:00Z");
  const pool = { connect: async () => ({ release() {}, query: async (sql: string) => {
    if (sql.includes("SELECT role")) return { rows: [{ role: "owner" }] };
    if (sql.includes("anchor_minutes")) return { rows: [{ now: approved, anchor_minutes: 420 }] };
    if (sql.includes("AS completed")) {
      assert.match(sql, /status IN \('confirmed','completed'\)/);
      return { rows: [{ confirmed: 1, completed: 0 }] };
    }
    if (sql.includes("LIMIT 8")) {
      assert.match(sql, /b\.status IN \('confirmed','completed'\)/);
      assert.match(sql, /p\.extension_id IS NULL AND p\.status = 'accepted'/);
      assert.match(sql, /ORDER BY approval\.approved_at DESC, b\.id DESC/);
      return { rows: [{ id, status: "confirmed", guest_name: null, operating_date: "2026-03-01", created_at: new Date("2026-02-28T00:00:00Z"), approved_at: approved, total: "100.00", item_count: 1, slot_count: 2 }] };
    }
    assert.match(sql, /^(BEGIN |COMMIT$)/);
    return { rows: [] };
  } }) };
  const result = await ethnDashboard(pool as never, async () => id);
  assert.deepEqual(result.counts, { confirmed: 1, completed: 0 });
  assert.equal(result.recentBookings[0].approvedAt, approved.toISOString());
});
