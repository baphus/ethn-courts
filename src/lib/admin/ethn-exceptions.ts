import type { Pool } from "pg";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const item = (row: Record<string, unknown>) => ({
  paymentId: row.id as string,
  bookingId: row.booking_id as string,
  extensionId: (row.extension_id as string|null) ?? null,
  operatingDate: row.operating_date as string,
  guestName: row.guest_name as string | null,
  total: row.total as string,
  claimedReference: row.claimed_reference as string | null,
  claimedAmount: row.claimed_amount as string | null,
  createdAt: (row.created_at as Date).toISOString(),
  proofAvailable: row.proof_available as boolean,
});

const review = (row: Record<string, unknown>) => ({
  note: row.review_reason as string,
  reviewedAt: (row.reviewed_at as Date).toISOString(),
  reviewedBy: row.reviewed_by as string,
});

const queueColumns = `p.id, p.booking_id, p.extension_id, b.operating_date::text, b.guest_name, COALESCE((SELECT e.total FROM ethn.extensions e WHERE e.id=p.extension_id),b.total)::text AS total,
  p.claimed_reference, p.claimed_amount::text, p.created_at,
  EXISTS (SELECT 1 FROM ethn.proof_reservations r
    WHERE r.id = p.proof_id AND r.booking_id = b.id AND r.owner_hash = b.owner_hash AND r.state = 'attached') OR EXISTS(SELECT 1 FROM ethn.extension_proofs ep WHERE ep.id=p.extension_proof_id AND ep.extension_id=p.extension_id AND ep.state='attached') AS proof_available`;

export async function exceptionQueue(pool: Db, verify: StaffVerifier) {
  await getStaff(pool, verify);
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT ${queueColumns}
      FROM ethn.payments p JOIN ethn.bookings b ON b.id = p.booking_id
      WHERE p.status = 'exception' AND p.reviewed_at IS NULL AND (b.status = 'expired' OR p.extension_id IS NOT NULL)
      ORDER BY p.created_at, p.id LIMIT 50`);
    return rows.map(item);
  } finally { client.release(); }
}

export async function exceptionDetail(pool: Db, verify: StaffVerifier, paymentId: string) {
  await getStaff(pool, verify);
  if (typeof paymentId !== "string" || !uuid.test(paymentId)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  try {
    const row = (await client.query(`SELECT ${queueColumns}, p.review_reason, p.reviewed_at, p.reviewed_by
      FROM ethn.payments p JOIN ethn.bookings b ON b.id = p.booking_id
      WHERE p.id = $1 AND p.status = 'exception'`, [paymentId.toLowerCase()])).rows[0];
    return row ? { ...item(row), review: row.reviewed_at == null ? null : review(row) } : null;
  } finally { client.release(); }
}

export async function reviewException(pool: Db, verify: StaffVerifier, paymentId: string, rawNote: unknown) {
  if (typeof paymentId !== "string" || !uuid.test(paymentId) || typeof rawNote !== "string") throw new Error("INVALID_INPUT");
  const note = rawNote.trim();
  if (note.length < 1 || note.length > 500) throw new Error("INVALID_INPUT");
  const subject = await verify();
  if (!subject || !uuid.test(subject)) throw new Error("UNAUTHENTICATED");
  const actor = subject.toLowerCase(), id = paymentId.toLowerCase();
  let client;
  try { client = await pool.connect(); } catch { throw new Error("REVIEW_UNAVAILABLE"); }
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    const staff = (await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id = $1 AND enabled AND role IN ('owner','staff') FOR UPDATE", [actor])).rows[0];
    if (!staff) throw new Error("FORBIDDEN");
    const target = (await client.query("SELECT booking_id FROM ethn.payments WHERE id = $1", [id])).rows[0];
    if (!target) throw new Error("REVIEW_NOT_ELIGIBLE");
    // Review never locks courts or mutates inventory; staff -> booking -> payment matches the decision lock order.
    const booking = (await client.query("SELECT id, status, owner_hash FROM ethn.bookings WHERE id = $1 FOR UPDATE", [target.booking_id])).rows[0];
    const payment = (await client.query("SELECT id, booking_id, method, status, proof_id, extension_id, extension_proof_id, review_reason, reviewed_at, reviewed_by FROM ethn.payments WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!booking || !payment || payment.booking_id !== booking.id || payment.status !== "exception") throw new Error("REVIEW_NOT_ELIGIBLE");
    if (payment.reviewed_at != null) {
      if (payment.review_reason === note) { committing = true; await client.query("COMMIT"); return { paymentId: payment.id, bookingId: payment.booking_id, ...review(payment) }; }
      throw new Error("REVIEW_ALREADY_FINAL");
    }
    if ((!payment.extension_id && booking.status !== "expired") || payment.method !== "gcash") throw new Error("REVIEW_NOT_ELIGIBLE");
    const proof = payment.extension_id ? (await client.query("SELECT id FROM ethn.extension_proofs WHERE id=$1 AND extension_id=$2 AND state='attached'",[payment.extension_proof_id,payment.extension_id])).rows[0] : (await client.query("SELECT id FROM ethn.proof_reservations WHERE id = $1 AND booking_id = $2 AND owner_hash = $3 AND state = 'attached'", [payment.proof_id, booking.id, booking.owner_hash])).rows[0];
    if (!proof) throw new Error("REVIEW_NOT_ELIGIBLE");
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const reviewed = (await client.query(`UPDATE ethn.payments SET reviewed_at = $2, reviewed_by = $3, review_reason = $4
      WHERE id = $1 AND status = 'exception' AND reviewed_at IS NULL
      RETURNING id, booking_id, review_reason, reviewed_at, reviewed_by`, [id, now, actor, note])).rows[0];
    if (!reviewed) throw new Error("REVIEW_NOT_ELIGIBLE");
    await client.query("INSERT INTO ethn.audit (booking_id, actor, action, detail) VALUES ($1,$2,'exception.review',$3::jsonb)", [booking.id, actor, JSON.stringify({ paymentId: payment.id })]);
    const result = { paymentId: reviewed.id as string, bookingId: reviewed.booking_id as string, ...review(reviewed) };
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard = true;
    else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (error instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|REVIEW_ALREADY_FINAL|REVIEW_NOT_ELIGIBLE)$/.test(error.message)) throw error;
    throw new Error("REVIEW_UNAVAILABLE");
  } finally { client.release(discard); }
}
