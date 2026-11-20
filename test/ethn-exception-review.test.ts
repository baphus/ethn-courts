import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCheckout } from "../src/lib/booking/checkout";
import { reserveProof } from "../src/lib/booking/proof-reservation";
import { submitBooking } from "../src/lib/booking/submission";
import { exceptionDetail, exceptionQueue, reviewException } from "../src/lib/admin/ethn-exceptions";

const url = process.env.ETHN_EXCEPTION_TEST_DATABASE_URL;
const adminUrl = process.env.ETHN_EXCEPTION_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000011", staff = "00000000-0000-4000-8000-000000000012", disabled = "00000000-0000-4000-8000-000000000013";

test("late exception review on fresh restricted local database", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  const snapshot = async (bookingId: string) => (await admin.query(`SELECT b.status, b.total::text,
      (SELECT json_agg(a.state ORDER BY a.id) FROM ethn.court_allocations a JOIN ethn.booking_items i ON i.id = a.item_id WHERE i.booking_id = b.id) AS allocations,
      (SELECT json_build_object('status', p.status, 'accepted_reference', p.accepted_reference, 'collected_amount', p.collected_amount::text,
        'received_at', p.received_at, 'verified_at', p.verified_at, 'verified_by', p.verified_by)
        FROM ethn.payments p WHERE p.booking_id = b.id) AS payment,
      (SELECT count(*)::int FROM ethn.email_outbox o WHERE o.booking_id = b.id) AS outbox,
      (SELECT count(*)::int FROM ethn.booking_items i WHERE i.booking_id = b.id) AS items
    FROM ethn.bookings b WHERE b.id = $1`, [bookingId])).rows[0];
  try {
    await admin.query("UPDATE ethn.settings SET merchant='merchant'");
    await admin.query("UPDATE ethn.court_hours SET hourly_rate=200");
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true),($2,'staff',true),($3,'staff',false)", [owner, staff, disabled]);
    let slot = 0;
    async function submitted(reference: string, late = false) {
      const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      const start = new Date(`${day}T00:00:00.000Z`); start.setUTCMinutes(slot++ * 30);
      const end = new Date(start.getTime() + 1800000), ownerToken = randomUUID();
      const checkout = await createCheckout(pool, { ownerToken, idempotencyKey: randomUUID(), date: day, ranges: [{ courtId: "1", start: start.toISOString(), end: end.toISOString() }], displayedTotal: "100.00", displayedVersion: "1" });
      const proof = await reserveProof(pool, { ownerToken, checkoutId: checkout.checkoutId, idempotencyKey: randomUUID(), mimeType: "image/png", byteSize: 10 });
      if (late) await admin.query("UPDATE ethn.bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [checkout.checkoutId]);
      await submitBooking(pool, { inspect: async () => ({ bytes: 10, mimeType: "image/png" }) }, { ownerToken, checkoutId: checkout.checkoutId, reservationId: proof.reservationId, idempotencyKey: randomUUID(), customer: { name: "Late Guest", email: "late@example.test", phone: "123" }, reference, claimedAmount: "100.00" });
      return checkout.checkoutId;
    }
    const paymentOf = async (bookingId: string) => (await admin.query("SELECT id FROM ethn.payments WHERE booking_id=$1", [bookingId])).rows[0].id as string;

    const late = await submitted("late-ref", true), latePayment = await paymentOf(late);
    const queue = await exceptionQueue(pool, async () => owner);
    assert.equal(queue[0].paymentId, latePayment);
    assert.equal(queue[0].bookingId, late);
    assert.equal(queue[0].proofAvailable, true);
    assert.equal(queue[0].claimedReference, "late-ref");
    const detail = await exceptionDetail(pool, async () => owner, latePayment);
    assert.equal(detail?.review, null);
    assert.equal(detail?.guestName, "Late Guest");
    await assert.rejects(exceptionQueue(pool, async () => disabled), /FORBIDDEN/);
    await assert.rejects(exceptionQueue(pool, async () => "00000000-0000-4000-8000-000000000099"), /FORBIDDEN/);
    await assert.rejects(reviewException(pool, async () => null, latePayment, "note"), /UNAUTHENTICATED/);
    await assert.rejects(reviewException(pool, async () => disabled, latePayment, "note"), /FORBIDDEN/);
    await assert.rejects(reviewException(pool, async () => owner, latePayment, "   "), /INVALID_INPUT/);
    await assert.rejects(reviewException(pool, async () => owner, latePayment, "x".repeat(501)), /INVALID_INPUT/);

    const ordinary = await submitted("ordinary-ref"), ordinaryPayment = await paymentOf(ordinary);
    await assert.rejects(reviewException(pool, async () => staff, ordinaryPayment, "not eligible"), /REVIEW_NOT_ELIGIBLE/);
    await assert.rejects(reviewException(pool, async () => staff, randomUUID(), "not eligible"), /REVIEW_NOT_ELIGIBLE/);

    const before = await snapshot(late);
    const first = await reviewException(pool, async () => owner, latePayment, "  Needs manual match  ");
    assert.deepEqual(first, { paymentId: latePayment, bookingId: late, note: "Needs manual match", reviewedAt: first.reviewedAt, reviewedBy: owner });
    assert.deepEqual(await reviewException(pool, async () => owner, latePayment, "Needs manual match"), first);
    await admin.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1", [owner]);
    await assert.rejects(reviewException(pool, async () => owner, latePayment, "Needs manual match"), /FORBIDDEN/);
    await admin.query("UPDATE ethn.staff_access SET enabled=true WHERE user_id=$1", [owner]);
    await assert.rejects(reviewException(pool, async () => owner, latePayment, "Changed note"), /REVIEW_ALREADY_FINAL/);
    assert.deepEqual(await snapshot(late), before);
    assert.deepEqual((await exceptionDetail(pool, async () => owner, latePayment))?.review, { note: "Needs manual match", reviewedAt: first.reviewedAt, reviewedBy: owner });
    assert.equal((await exceptionQueue(pool, async () => owner)).some(item => item.paymentId === latePayment), false);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.audit WHERE booking_id=$1 AND action='exception.review'", [late])).rows[0].n, 1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.audit WHERE booking_id=$1 AND action='exception.review' AND detail::text ~ $2", [late, "Needs manual match"])).rows[0].n, 0);

    const rollback = await submitted("rollback-ref", true), rollbackPayment = await paymentOf(rollback);
    await admin.query("REVOKE INSERT ON ethn.audit FROM ethn_checkout");
    try { await assert.rejects(reviewException(pool, async () => owner, rollbackPayment, "must roll back"), /REVIEW_UNAVAILABLE/); }
    finally { await admin.query("GRANT INSERT ON ethn.audit TO ethn_checkout"); }
    const rolledBack = (await admin.query("SELECT reviewed_at, reviewed_by, review_reason FROM ethn.payments WHERE id=$1", [rollbackPayment])).rows[0];
    assert.deepEqual(rolledBack, { reviewed_at: null, reviewed_by: null, review_reason: null });

    const race = await submitted("race-ref", true), racePayment = await paymentOf(race);
    const outcome = await Promise.allSettled([
      reviewException(pool, async () => owner, racePayment, "First assessment"),
      reviewException(pool, async () => staff, racePayment, "Second assessment"),
    ]);
    assert.equal(outcome.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(outcome.filter(r => r.status === "rejected" && /REVIEW_ALREADY_FINAL/.test(String(r.reason))).length, 1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.audit WHERE booking_id=$1 AND action='exception.review'", [race])).rows[0].n, 1);
  } finally { await pool.end(); await admin.end(); }
});
