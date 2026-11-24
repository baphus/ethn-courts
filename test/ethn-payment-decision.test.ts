import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCheckout } from "../src/lib/booking/checkout";
import { reserveProof } from "../src/lib/booking/proof-reservation";
import { submitBooking } from "../src/lib/booking/submission";
import { decidePayment } from "../src/lib/admin/ethn-payment-decision";

const url = process.env.ETHN_DECISION_TEST_DATABASE_URL;
const adminUrl = process.env.ETHN_DECISION_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000001", staff = "00000000-0000-4000-8000-000000000002", disabled = "00000000-0000-4000-8000-000000000003";
test("payment decisions on fresh restricted local database", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query("UPDATE ethn.settings SET merchant='merchant'");
    await admin.query("UPDATE ethn.court_hours SET hourly_rate=200");
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true),($2,'owner',true),($3,'staff',false)", [owner, staff, disabled]);
    let slot = 0;
    async function submitted(reference: string, late = false) {
      const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      const start = new Date(`${day}T00:00:00.000Z`); start.setUTCMinutes(slot++ * 30);
      const end = new Date(start.getTime() + 1800000), ownerToken = randomUUID();
      const checkout = await createCheckout(pool, { ownerToken, idempotencyKey: randomUUID(), date: day, ranges: [{ courtId: "1", start: start.toISOString(), end: end.toISOString() }], displayedTotal: "100.00", displayedVersion: "1" });
      const proof = await reserveProof(pool, { ownerToken, checkoutId: checkout.checkoutId, idempotencyKey: randomUUID(), mimeType: "image/png", byteSize: 10 });
      if (late) await admin.query("UPDATE ethn.bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [checkout.checkoutId]);
      await submitBooking(pool, { inspect: async () => ({ bytes: 10, mimeType: "image/png" }) }, { ownerToken, checkoutId: checkout.checkoutId, reservationId: proof.reservationId, idempotencyKey: randomUUID(), customer: { name: "Guest", email: "guest@example.test", phone: "123" }, paymentMethodId: 'gcash', reference, claimedAmount: "100.00" });
      return checkout.checkoutId;
    }
    const first = await submitted("ref-one");
    const approve = { action: "approve" as const, bookingId: first, key: "first", acceptedReference: "ref-one", collectedAmount: "100.00", receivedAt: new Date(Date.now() - 10000).toISOString() };
    await assert.rejects(decidePayment(pool, async () => disabled, approve), /FORBIDDEN/);
    await assert.rejects(decidePayment(pool, async () => owner, { ...approve, acceptedReference: "wrong" }), /REFERENCE_MISMATCH/);
    await assert.rejects(decidePayment(pool, async () => owner, { ...approve, collectedAmount: "99.99" }), /AMOUNT_MISMATCH/);
    const result = await decidePayment(pool, async () => owner, approve);
    assert.deepEqual(result, { bookingId: first, status: "confirmed", paymentStatus: "accepted" });
    assert.deepEqual(await decidePayment(pool, async () => owner, approve), result);
    await assert.rejects(decidePayment(pool, async () => owner, { ...approve, key: "new" }), /DECISION_ALREADY_FINAL/);
    await admin.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1", [owner]);
    await assert.rejects(decidePayment(pool, async () => owner, approve), /FORBIDDEN/);
    await admin.query("UPDATE ethn.staff_access SET enabled=true WHERE user_id=$1", [owner]);
    const dup = await submitted("ref-one");
    await assert.rejects(decidePayment(pool, async () => staff, { ...approve, bookingId: dup, key: "duplicate" }), /REFERENCE_ALREADY_USED/);
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1", [dup])).rows[0].status, "pending");
    const race = await submitted("race");
    const outcome = await Promise.allSettled([decidePayment(pool, async () => owner, { ...approve, bookingId: race, key: "race-a", acceptedReference: "race" }), decidePayment(pool, async () => staff, { action: "reject", bookingId: race, key: "race-b", reason: "Mismatch" })]);
    assert.equal(outcome.filter(r => r.status === "fulfilled").length, 1);
    const rejected = await submitted("reject");
    await decidePayment(pool, async () => staff, { action: "reject", bookingId: rejected, key: "reject", reason: " Please resubmit " });
    const rejectedRow = (await admin.query("SELECT p.review_reason,a.state FROM ethn.payments p JOIN ethn.booking_items i ON i.booking_id=p.booking_id JOIN ethn.court_allocations a ON a.item_id=i.id WHERE p.booking_id=$1", [rejected])).rows[0];
    assert.deepEqual(rejectedRow, { review_reason: "Please resubmit", state: "rejected" });
    const late = await submitted("late", true);
    await assert.rejects(decidePayment(pool, async () => staff, { ...approve, bookingId: late, key: "late", acceptedReference: "late" }), /DECISION_ALREADY_FINAL/);
    const rollback = await submitted("rollback");
    await admin.query("REVOKE INSERT ON ethn.email_outbox FROM ethn_checkout");
    try { await assert.rejects(decidePayment(pool, async () => staff, { ...approve, bookingId: rollback, key: "rollback", acceptedReference: "rollback" }), /DECISION_UNAVAILABLE/); }
    finally { await admin.query("GRANT INSERT ON ethn.email_outbox TO ethn_checkout"); }
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1", [rollback])).rows[0].status, "pending");
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.email_outbox WHERE booking_id=$1 AND kind='booking_approved'", [first])).rows[0].n, 1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.audit WHERE booking_id=$1 AND action='payment.approve'", [first])).rows[0].n, 1);
  } finally { await pool.end(); await admin.end(); }
});
