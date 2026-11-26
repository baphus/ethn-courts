import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { submitBooking } from "../src/lib/booking/submission";

const input = { ownerToken: "123e4567-e89b-42d3-a456-426614174000", checkoutId: "123e4567-e89b-42d3-a456-426614174001", reservationId: "123e4567-e89b-42d3-a456-426614174002", idempotencyKey: "key", paymentMethodId: 'gcash', customer: { name: "Guest", email: "guest@example.com", phone: "123" }, reference: " reference ", claimedAmount: "100.00" };

test("submission rejects malformed input before acquiring connection", async () => {
  const pool = { connect: async () => { throw new Error("unexpected connection"); } } as unknown as Pick<Pool, "connect">;
  await assert.rejects(submitBooking(pool, { inspect: async () => ({ bytes: 1, mimeType: "image/png" }) }, { ...input, customer: { ...input.customer, phone: " " } }), /INVALID_INPUT/);
  await assert.rejects(submitBooking(pool, { inspect: async () => ({ bytes: 1, mimeType: "image/png" }) }, { ...input, claimedAmount: "0.00" }), /INVALID_INPUT/);
  for (const value of [{ ...input, customer: { ...input.customer, email: "invalid" } }, { ...input, customer: { ...input.customer, name: "x".repeat(201) } }, { ...input, reference: "x".repeat(201) }]) await assert.rejects(submitBooking(pool, { inspect: async () => ({ bytes: 1, mimeType: "image/png" }) }, value), /INVALID_INPUT/);
});

test("submission decides timeliness under the booking lock before checking proof storage", async () => {
  for (const scenario of ["on-time", "open-play", "ineligible-open-play", "expired", "bad-proof"] as const) {
    const openPlay = scenario === "open-play" || scenario === "ineligible-open-play" ? { title: "Evening Open Play", description: "", eventUrl: "https://reclub.co/m/ABC123" } : undefined;
    const calls: string[] = [];
    let fingerprint: string;
    let now = scenario === "expired" ? 3000 : 2000;
    const pool = { connect: async () => ({ release() {}, async query(sql: string, params: string[] = []) {
      calls.push(sql);
      if (sql.includes("FOR SHARE")) return { rows: [{ user_id: input.ownerToken }] };
      if (sql.includes("INSERT INTO ethn.notifications")) assert.equal(params[4], scenario === "expired" ? "late_payment_recorded" : scenario === "open-play" ? "open_play_submitted" : "proof_submitted");
      if (sql.startsWith("INSERT INTO ethn.idempotency")) fingerprint = params[2];
      const rows = sql.startsWith("INSERT INTO ethn.idempotency") ? [{ key: input.idempotencyKey }]
        : sql.startsWith("SELECT fingerprint") ? [{ fingerprint }]
        : sql.includes("FROM ethn.bookings") ? [{ status: "held", expires_at: new Date(3000), total: "100.00", price_acknowledged: true, payment_methods_snapshot: [{ id: "gcash" }] }]
        : sql.includes("FROM ethn.proof_reservations") ? [{ state: "reserved", object_path: `incoming/${"a".repeat(64)}.png`, mime_type: "image/png", byte_size: "123" }]
        : sql.startsWith("INSERT INTO ethn.booking_open_plays") ? (assert.deepEqual(params, [input.checkoutId, openPlay?.title, openPlay?.description, openPlay?.eventUrl]), scenario === "open-play" ? [{ booking_id: input.checkoutId }] : [])
        : sql.includes("clock_timestamp") ? [{ now: new Date(now) }] : [];
      return { rows };
    } }) } as unknown as Pick<Pool, "connect">;
    const submission = submitBooking(pool, { inspect: async () => {
      calls.push("inspect");
      now = 4000;
      return { bytes: scenario === "bad-proof" ? 124 : 123, mimeType: "image/png" };
    } }, { ...input, openPlay });
    if (scenario === "bad-proof") {
      await assert.rejects(submission, /PROOF_METADATA_MISMATCH/);
      assert.equal(calls.at(-1), "ROLLBACK");
      assert(!calls.some(sql => sql.startsWith("UPDATE ethn.court_allocations")));
    } else {
      const result = await submission as { booked: boolean; openPlaySaved?: boolean };
      assert.equal(result.booked, scenario !== "expired");
      assert.equal(result.openPlaySaved, openPlay ? scenario === "open-play" : undefined);
      assert.equal(calls.some(sql => sql.startsWith("INSERT INTO ethn.booking_open_plays")), Boolean(openPlay));
      assert(calls.some(sql => sql.includes("INSERT INTO ethn.notifications")));
       assert.equal(calls.at(-1), "COMMIT");
    }
    const locked = calls.findIndex(sql => sql.includes("FROM ethn.bookings") && sql.includes("FOR UPDATE"));
    assert(locked > 0 && locked < calls.indexOf("inspect"));
  }
});
