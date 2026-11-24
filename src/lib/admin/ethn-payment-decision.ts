import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { gcashReference, parsePesos } from "../booking/core";
import type { StaffVerifier } from "./ethn-payments";

type Input = { bookingId: string; key: string } & ({ action: "approve"; paymentReceived?: true; acceptedReference?: string; collectedAmount?: string; receivedAt?: string } | { action: "reject"; reason: string });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function decidePayment(pool: Pick<Pool, "connect">, verify: StaffVerifier, input: Input) {
  if (!input || typeof input.bookingId !== "string" || !uuid.test(input.bookingId) || typeof input.key !== "string" || !/^[\x21-\x7e]{1,200}$/.test(input.key)) throw new Error("INVALID_INPUT");
  let decision: { action: "approve"; reference: string | null; amount: string | null; receivedAt: string | null } | { action: "reject"; reason: string };
  try {
    if (input.action === "approve" && input.paymentReceived === true && input.acceptedReference === undefined && input.collectedAmount === undefined && input.receivedAt === undefined) {
      decision = { action: 'approve', reference: null, amount: null, receivedAt: null };
    } else if (input.action === "approve" && typeof input.acceptedReference === "string" && typeof input.collectedAmount === "string" && typeof input.receivedAt === "string") {
      const cents = parsePesos(input.collectedAmount), date = new Date(input.receivedAt);
      const match = /^(\d{4}-\d\d-\d\d)T\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.exec(input.receivedAt);
      const day = match ? new Date(`${match[1]}T00:00:00.000Z`) : new Date(NaN);
      if (cents <= BigInt(0) || !Number.isFinite(date.getTime()) || !match || !Number.isFinite(day.getTime()) || day.toISOString() !== `${match[1]}T00:00:00.000Z`) throw new Error();
      decision = { action: "approve", reference: gcashReference(input.acceptedReference), amount: `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`, receivedAt: date.toISOString() };
    } else if (input.action === "reject" && typeof input.reason === "string" && input.reason.trim().length > 0 && input.reason.trim().length <= 500) decision = { action: "reject", reason: input.reason.trim() };
    else throw new Error();
  } catch { throw new Error("INVALID_INPUT"); }
  const subject = await verify();
  if (!subject || !uuid.test(subject)) throw new Error("UNAUTHENTICATED");
  const actor = subject.toLowerCase(), bookingId = input.bookingId.toLowerCase();
  const fingerprint = hash(JSON.stringify({ bookingId, ...decision }));
  let client;
  try { client = await pool.connect(); } catch { throw new Error("DECISION_UNAVAILABLE"); }
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    const inserted = await client.query("INSERT INTO ethn.idempotency (owner_hash, operation, key, fingerprint, result) VALUES ($1,'payment_decision',$2,$3,NULL) ON CONFLICT DO NOTHING RETURNING key", [actor, input.key, fingerprint]);
    const prior = (await client.query("SELECT fingerprint, result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='payment_decision' AND key=$2 FOR UPDATE", [actor, input.key])).rows[0];
    const staff = (await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows[0];
    if (!staff) throw new Error("FORBIDDEN");
    if (!prior || prior.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (!inserted.rows.length) {
      if (prior.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE");
      committing = true; await client.query("COMMIT"); return prior.result;
    }
    // shortcut: all-court lock serializes small venue inventory; revisit on measured contention.
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const booking = (await client.query("SELECT status, total::text, owner_hash, merchant_snapshot, guest_name, guest_email, tracking_code, tracking_hash FROM ethn.bookings WHERE id=$1 FOR UPDATE", [bookingId])).rows[0];
    const payments = (await client.query("SELECT id, method, status, claimed_reference, merchant_snapshot, proof_id FROM ethn.payments WHERE booking_id=$1 AND status='unverified' ORDER BY id FOR UPDATE", [bookingId])).rows;
    if (!booking || booking.status !== "pending" || payments.length !== 1) throw new Error("DECISION_ALREADY_FINAL");
    const payment = payments[0];
    const proof = (await client.query("SELECT id FROM ethn.proof_reservations WHERE id=$1 AND booking_id=$2 AND owner_hash=$3 AND state='attached'", [payment.proof_id, bookingId, booking.owner_hash])).rows[0];
    if (payment.method === "cash" || !proof || !payment.merchant_snapshot) throw new Error("DECISION_INCOMPATIBLE");
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (decision.action === "approve") {
      if (decision.reference !== null && decision.reference !== payment.claimed_reference?.trim()) throw new Error("REFERENCE_MISMATCH");
      if (decision.amount !== null && decision.amount !== booking.total) throw new Error("AMOUNT_MISMATCH");
      if (decision.receivedAt && new Date(decision.receivedAt) > now) throw new Error("INVALID_INPUT");
      await client.query("UPDATE ethn.payments SET status='accepted', accepted_reference=$2, collected_amount=$3, received_at=$4, verified_at=$5, verified_by=$6 WHERE id=$1", [payment.id, decision.reference, booking.total, decision.receivedAt, now, actor]);
    } else await client.query("UPDATE ethn.payments SET status='rejected', review_reason=$2, reviewed_at=$3, reviewed_by=$4 WHERE id=$1", [payment.id, decision.reason, now, actor]);
    const status = decision.action === "approve" ? "confirmed" : "rejected", paymentStatus = decision.action === "approve" ? "accepted" : "rejected";
    await client.query("UPDATE ethn.bookings SET status=$2 WHERE id=$1", [bookingId, status]);
    await client.query("UPDATE ethn.court_allocations SET state=$2 WHERE state='pending' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id=$1)", [bookingId, status]);
    const submission = (await client.query("SELECT payload FROM ethn.email_outbox WHERE booking_id=$1 AND kind='booking_submission' ORDER BY id LIMIT 1", [bookingId])).rows[0];
    const token = submission?.payload?.trackingToken;
    const payload = { email: booking.guest_email, name: booking.guest_name, code: booking.tracking_code, total: booking.total, ...(typeof token === "string" && /^[0-9a-f]{64}$/.test(token) && hash(token) === booking.tracking_hash ? { trackingToken: token } : {}), ...(decision.action === "reject" ? { reason: decision.reason } : {}) };
    await client.query("INSERT INTO ethn.email_outbox (id,booking_id,kind,payload) VALUES ($1,$2,$3,$4::jsonb)", [randomUUID(), bookingId, decision.action === "approve" ? "booking_approved" : "booking_rejected", JSON.stringify(payload)]);
    await client.query("INSERT INTO ethn.audit (booking_id,actor,action,detail) VALUES ($1,$2,$3,$4::jsonb)", [bookingId, actor, `payment.${decision.action}`, JSON.stringify({ paymentId: payment.id })]);
    const result = { bookingId, status, paymentStatus };
    await client.query("UPDATE ethn.idempotency SET result=$3::jsonb WHERE owner_hash=$1 AND operation='payment_decision' AND key=$2", [actor, input.key, JSON.stringify(result)]);
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard = true;
    else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (error && typeof error === "object" && "code" in error && error.code === "23505" && "constraint" in error && error.constraint === "payments_accepted_reference") throw new Error("REFERENCE_ALREADY_USED");
    if (error instanceof Error && /^(FORBIDDEN|IDEMPOTENCY_MISMATCH|IDEMPOTENCY_INCOMPLETE|DECISION_ALREADY_FINAL|DECISION_INCOMPATIBLE|REFERENCE_MISMATCH|AMOUNT_MISMATCH|INVALID_INPUT)$/.test(error.message)) throw error;
    throw new Error("DECISION_UNAVAILABLE");
  } finally { client.release(discard); }
}
