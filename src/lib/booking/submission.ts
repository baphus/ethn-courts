import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { gcashReference, parsePesos, validateGuest } from "./core";

type Input = { ownerToken: string; checkoutId: string; idempotencyKey: string; customer: { name: string; email: string; phone: string }; reservationId: string; reference: string; claimedAmount: string; acknowledgedTotal?: string };
type Inspector = { inspect(path: string): Promise<{ bytes: number; mimeType: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const money = (value: string) => { const n = parsePesos(value); return `${n / BigInt(100)}.${(n % BigInt(100)).toString().padStart(2, "0")}`; };

export async function submitBooking(pool: Pick<Pool, "connect">, storage: Inspector, input: Input) {
  if (!input || typeof input.ownerToken !== "string" || !uuid.test(input.ownerToken) || typeof input.checkoutId !== "string" || !uuid.test(input.checkoutId) || typeof input.reservationId !== "string" || !uuid.test(input.reservationId) || typeof input.idempotencyKey !== "string" || !/^[\x21-\x7e]{1,200}$/.test(input.idempotencyKey) || !input.customer || [input.customer.name, input.customer.email, input.customer.phone, input.reference].some(v => typeof v !== "string") || typeof input.claimedAmount !== "string" || (input.acknowledgedTotal !== undefined && typeof input.acknowledgedTotal !== "string")) throw new Error("INVALID_INPUT");
  if (!validateGuest({ kind: "online", ...input.customer })) throw new Error("INVALID_INPUT");
  let claimedAmount: string, acknowledgedTotal: string | null, reference: string;
  try { reference = gcashReference(input.reference); claimedAmount = money(input.claimedAmount); if (parsePesos(claimedAmount) <= BigInt(0)) throw new Error(); acknowledgedTotal = input.acknowledgedTotal === undefined ? null : money(input.acknowledgedTotal); } catch { throw new Error("INVALID_INPUT"); }
  const owner = hash(input.ownerToken.toLowerCase()), checkout = input.checkoutId.toLowerCase(), reservation = input.reservationId.toLowerCase();
  const customer = { name: input.customer.name.trim(), email: input.customer.email.trim(), phone: input.customer.phone.trim() };
  const fingerprint = hash(JSON.stringify({ checkout, reservation, customer, reference, claimedAmount, acknowledgedTotal }));
  let client;
  try { client = await pool.connect(); } catch { throw new Error("SUBMISSION_UNAVAILABLE"); }
  let transaction = false, committing = false, discard = false;
  try {
    const prior = (await client.query("SELECT fingerprint, result FROM ethn.idempotency WHERE owner_hash = $1 AND operation = 'submission' AND key = $2", [owner, input.idempotencyKey])).rows[0];
    if (prior) { if (prior.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH"); if (prior.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE"); return prior.result; }
    const proof = (await client.query("SELECT object_path, mime_type, byte_size, state FROM ethn.proof_reservations WHERE id = $1 AND booking_id = $2 AND owner_hash = $3", [reservation, checkout, owner])).rows[0];
    if (!proof) throw new Error("CHECKOUT_UNAVAILABLE");
    if (proof.state !== "reserved") {
      const completed = (await client.query("SELECT fingerprint, result FROM ethn.idempotency WHERE owner_hash = $1 AND operation = 'submission' AND key = $2", [owner, input.idempotencyKey])).rows[0];
      if (completed) { if (completed.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH"); if (completed.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE"); return completed.result; }
      throw new Error("ALREADY_SUBMITTED");
    }
    const extension: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (!Object.hasOwn(extension, proof.mime_type) || !new RegExp(`^incoming/[0-9a-f]{64}\\.${extension[proof.mime_type]}$`).test(proof.object_path) || !Number.isSafeInteger(Number(proof.byte_size)) || Number(proof.byte_size) < 1 || Number(proof.byte_size) > 5 * 1024 * 1024) throw new Error("PROOF_METADATA_MISMATCH");
    let observed: { bytes: number; mimeType: string };
    try { observed = await storage.inspect(proof.object_path); } catch {
      const completed = (await client.query("SELECT fingerprint, result FROM ethn.idempotency WHERE owner_hash = $1 AND operation = 'submission' AND key = $2", [owner, input.idempotencyKey])).rows[0];
      if (completed) { if (completed.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH"); if (completed.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE"); return completed.result; }
      throw new Error("STORAGE_UNAVAILABLE");
    }
    if (!observed || !Number.isSafeInteger(observed.bytes) || observed.bytes < 1 || observed.bytes > 5 * 1024 * 1024 || observed.bytes !== Number(proof.byte_size) || observed.mimeType !== proof.mime_type) throw new Error("PROOF_METADATA_MISMATCH");
    await client.query("BEGIN"); transaction = true;
    const inserted = await client.query("INSERT INTO ethn.idempotency (owner_hash, operation, key, fingerprint, result) VALUES ($1, 'submission', $2, $3, NULL) ON CONFLICT DO NOTHING RETURNING key", [owner, input.idempotencyKey, fingerprint]);
    const row = (await client.query("SELECT fingerprint, result FROM ethn.idempotency WHERE owner_hash = $1 AND operation = 'submission' AND key = $2 FOR UPDATE", [owner, input.idempotencyKey])).rows[0];
    if (!row || row.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (!inserted.rows.length) { if (row.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE"); committing = true; await client.query("COMMIT"); return row.result; }
    // shortcut: all-court lock serializes small venue inventory; revisit on measured contention.
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const booking = (await client.query("SELECT status, expires_at, total::text, price_acknowledged, merchant_snapshot FROM ethn.bookings WHERE id = $1 AND owner_hash = $2 FOR UPDATE", [checkout, owner])).rows[0];
    const locked = (await client.query("SELECT state, object_path, mime_type, byte_size FROM ethn.proof_reservations WHERE id = $1 AND booking_id = $2 AND owner_hash = $3 FOR UPDATE", [reservation, checkout, owner])).rows[0];
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (!booking || !locked) throw new Error("CHECKOUT_UNAVAILABLE");
    if (locked.state !== "reserved" || !["held", "expired"].includes(booking.status)) throw new Error("ALREADY_SUBMITTED");
    if (locked.object_path !== proof.object_path || locked.mime_type !== observed.mimeType || Number(locked.byte_size) !== observed.bytes) throw new Error("PROOF_METADATA_MISMATCH");
    if (!booking.price_acknowledged && acknowledgedTotal !== booking.total) throw new Error("ACKNOWLEDGEMENT_REQUIRED");
    const timely = booking.status === "held" && now.getTime() < new Date(booking.expires_at).getTime();
    if (timely && claimedAmount !== booking.total) throw new Error("AMOUNT_MISMATCH");
    await client.query("UPDATE ethn.proof_reservations SET state = 'attached' WHERE id = $1", [reservation]);
    let result: object;
    if (timely) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
      const token = randomBytes(32).toString("hex");
      await client.query("UPDATE ethn.bookings SET status = 'pending', guest_name = $2, guest_email = $3, guest_phone = $4, tracking_code = $5, tracking_hash = $6, price_acknowledged = true WHERE id = $1", [checkout, customer.name, customer.email, customer.phone, code, hash(token)]);
      await client.query("UPDATE ethn.court_allocations SET state = 'pending' WHERE state = 'held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id = $1)", [checkout]);
      result = { booked: true, status: "pending", trackingToken: token, code, total: booking.total, checkoutExpiresAt: new Date(booking.expires_at).toISOString() };
      await client.query("INSERT INTO ethn.email_outbox (id, booking_id, kind, payload) VALUES ($1,$2,'booking_submission',$3::jsonb)", [randomUUID(), checkout, JSON.stringify({ email: customer.email, name: customer.name, code, trackingToken: token, total: booking.total })]);
    } else {
      if (booking.status === "held") await client.query("UPDATE ethn.bookings SET status = 'expired' WHERE id = $1", [checkout]);
      await client.query("UPDATE ethn.bookings SET guest_name = $2, guest_email = $3, guest_phone = $4, price_acknowledged = true WHERE id = $1", [checkout, customer.name, customer.email, customer.phone]);
      await client.query("UPDATE ethn.court_allocations SET state = 'expired' WHERE state = 'held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id = $1)", [checkout]);
      result = { booked: false, status: "payment_exception", requiresStaffReview: true, message: "Not booked. Staff review required." };
    }
    await client.query("INSERT INTO ethn.payments (id, booking_id, method, merchant_snapshot, status, claimed_reference, claimed_amount, proof_id) VALUES ($1,$2,'gcash',$3,$4,$5,$6,$7)", [randomUUID(), checkout, booking.merchant_snapshot, timely ? "unverified" : "exception", reference, claimedAmount, reservation]);
    await client.query("INSERT INTO ethn.audit (booking_id, actor, action, detail) VALUES ($1,$2,'booking.submit',$3::jsonb)", [checkout, owner, JSON.stringify({ outcome: timely ? "pending" : "payment_exception", reservationId: reservation })]);
    await client.query("UPDATE ethn.idempotency SET result = $4::jsonb WHERE owner_hash = $1 AND operation = 'submission' AND key = $2 AND fingerprint = $3", [owner, input.idempotencyKey, fingerprint, JSON.stringify(result)]);
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard = true;
    else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (error instanceof Error && /^(INVALID_INPUT|IDEMPOTENCY_MISMATCH|IDEMPOTENCY_INCOMPLETE|CHECKOUT_UNAVAILABLE|ALREADY_SUBMITTED|STORAGE_UNAVAILABLE|PROOF_METADATA_MISMATCH|ACKNOWLEDGEMENT_REQUIRED|AMOUNT_MISMATCH)$/.test(error.message)) throw error;
    throw new Error("SUBMISSION_UNAVAILABLE");
  } finally { client.release(discard); }
}
