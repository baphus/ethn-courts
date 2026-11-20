import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { parsePesos } from "./core";

type ProofInput = { checkoutId: string; ownerToken: string; idempotencyKey: string; mimeType: string; byteSize: number; acknowledgedTotal?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function reserveProof(pool: Pick<Pool, "connect">, input: ProofInput) {
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (!input || typeof input.checkoutId !== "string" || !uuid.test(input.checkoutId) || typeof input.ownerToken !== "string" || !uuid.test(input.ownerToken) || typeof input.idempotencyKey !== "string" || !/^[\x21-\x7e]{1,200}$/.test(input.idempotencyKey) || !Object.hasOwn(extensions, input.mimeType) || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 5 * 1024 * 1024 || (input.acknowledgedTotal !== undefined && typeof input.acknowledgedTotal !== "string")) throw new Error("INVALID_INPUT");
  let acknowledgedTotal: string | null = null;
  if (input.acknowledgedTotal !== undefined) {
    try { const n = parsePesos(input.acknowledgedTotal); acknowledgedTotal = `${n / BigInt(100)}.${(n % BigInt(100)).toString().padStart(2, "0")}`; } catch { throw new Error("INVALID_INPUT"); }
  }
  const ownerHash = hash(input.ownerToken.toLowerCase());
  const checkoutId = input.checkoutId.toLowerCase();
  const fingerprint = hash(JSON.stringify({ checkoutId, mimeType: input.mimeType, byteSize: input.byteSize, acknowledgedTotal }));
  const client = await pool.connect();
  let committing = false, discard = false;
  try {
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO ethn.idempotency (owner_hash, operation, key, fingerprint, result) VALUES ($1, 'proof-reservation', $2, $3, NULL) ON CONFLICT DO NOTHING RETURNING key", [ownerHash, input.idempotencyKey, fingerprint]);
    const row = (await client.query("SELECT fingerprint, result FROM ethn.idempotency WHERE owner_hash = $1 AND operation = 'proof-reservation' AND key = $2 FOR UPDATE", [ownerHash, input.idempotencyKey])).rows[0];
    if (!row || row.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (!inserted.rows.length) {
      if (row.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE");
      committing = true; await client.query("COMMIT"); return row.result;
    }
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const booking = (await client.query("SELECT status, expires_at, total::text, price_acknowledged FROM ethn.bookings WHERE id = $1 AND owner_hash = $2 FOR UPDATE", [checkoutId, ownerHash])).rows[0];
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (!booking || booking.status !== "held" || new Date(booking.expires_at).getTime() <= now.getTime()) throw new Error("CHECKOUT_UNAVAILABLE");
    if (!booking.price_acknowledged) {
      if (acknowledgedTotal !== booking.total) throw new Error("ACKNOWLEDGEMENT_REQUIRED");
      await client.query("UPDATE ethn.bookings SET price_acknowledged = true WHERE id = $1", [checkoutId]);
    }
    const result = { reservationId: randomUUID(), objectPath: `incoming/${randomBytes(32).toString("hex")}.${extensions[input.mimeType]}`, state: "reserved", expiresAt: new Date(booking.expires_at).toISOString() };
    await client.query("INSERT INTO ethn.proof_reservations (id, booking_id, owner_hash, object_path, mime_type, byte_size, state) VALUES ($1,$2,$3,$4,$5,$6,'reserved')", [result.reservationId, checkoutId, ownerHash, result.objectPath, input.mimeType, input.byteSize]);
    await client.query("INSERT INTO ethn.audit (booking_id, actor, action, detail) VALUES ($1,$2,'proof.reserve', $3::jsonb)", [checkoutId, ownerHash, JSON.stringify({ reservationId: result.reservationId })]);
    await client.query("UPDATE ethn.idempotency SET result = $4::jsonb WHERE owner_hash = $1 AND operation = 'proof-reservation' AND key = $2 AND fingerprint = $3", [ownerHash, input.idempotencyKey, fingerprint, JSON.stringify(result)]);
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard = true;
    else { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    throw error;
  } finally { client.release(discard); }
}
