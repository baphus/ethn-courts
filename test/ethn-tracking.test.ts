import { test } from "node:test";
import assert from "node:assert/strict";
import { trackBooking } from "../src/lib/booking/ethn-tracking";

test("tracking validates before connect and projects only safe fields", async () => {
  let calls = 0;
  const pool = { connect: async () => { calls++; return { query: async (sql: string, values: unknown[]) => {
    if (sql.includes("FROM ethn.bookings")) { assert.deepEqual(values, ["ABCDE", "Guest@example.com"]); return { rows: [{ id: "private", operating_date: "2026-01-01", status: "pending", total: "100.00", tracking_hash: "secret" }] }; }
    if (sql.includes("booking_open_play")) return { rows: [] };
    if (sql.includes("booking_items")) return { rows: [{ court: "Court", starts_at: "start", ends_at: "end", amount: "100.00", duration_minutes: 60, interval_minutes: 30, hourly_rate: "100.00", is_extension: false, proof: "secret" }] };
    return { rows: [{ method: "gcash", status: "unverified", claimed_amount: "100.00", claimed_reference: "secret" }] };
  }, release() {} }; } };
  for (const input of [{ token: "bad" }, { code: "ABCDE" }, { token: "a".repeat(64), code: "ABCDE", email: "g@example.com" }]) await assert.rejects(trackBooking(pool as never, input), /INVALID_INPUT/);
  assert.equal(calls, 0);
  const result = await trackBooking(pool as never, { code: "abcde", email: " Guest@example.com " });
  assert.deepEqual(result, { operatingDate: "2026-01-01", status: "pending", total: "100.00", items: [{ court: "Court", startsAt: "start", endsAt: "end", amount: "100.00", durationMinutes: 60, intervalMinutes: 30, hourlyRate: "100.00", isExtension: false }], payments: [{ method: "gcash", status: "unverified", claimedAmount: "100.00" }] });
});
