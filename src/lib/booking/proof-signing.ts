import { createHash } from "node:crypto";
import type { Pool } from "pg";

type Input = { ownerToken: string; checkoutId: string; reservationId: string };
type Storage = { sign(path: string): Promise<{ signedUrl: string; token: string; path: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function signReservedProof(pool: Pick<Pool, "connect">, input: Input, storage: Storage) {
  if (!input || ![input.ownerToken, input.checkoutId, input.reservationId].every(v => typeof v === "string" && uuid.test(v))) throw new Error("INVALID_INPUT");
  const ownerHash = createHash("sha256").update(input.ownerToken.toLowerCase()).digest("hex");
  const check = async () => {
    const client = await pool.connect();
    try {
      const row = (await client.query(`SELECT p.object_path, p.mime_type, p.byte_size, b.expires_at
        FROM ethn.proof_reservations p JOIN ethn.bookings b ON b.id = p.booking_id
        WHERE b.id = $1 AND b.owner_hash = $2 AND p.id = $3 AND p.owner_hash = $2
          AND b.status = 'held' AND b.expires_at > clock_timestamp()
          AND b.price_acknowledged AND p.state = 'reserved'`, [input.checkoutId.toLowerCase(), ownerHash, input.reservationId.toLowerCase()])).rows[0];
      const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
      if (!row || !Object.hasOwn(extensions, row.mime_type) || !Number.isSafeInteger(Number(row.byte_size)) || Number(row.byte_size) < 1 || Number(row.byte_size) > 5 * 1024 * 1024 || !new RegExp(`^incoming/[0-9a-f]{64}\\.${extensions[row.mime_type]}$`).test(row.object_path)) throw new Error("CHECKOUT_UNAVAILABLE");
      return { path: row.object_path as string, expiresAt: new Date(row.expires_at).toISOString() };
    } finally { client.release(); }
  };
  const before = await check();
  let signed: Awaited<ReturnType<Storage["sign"]>>;
  try { signed = await storage.sign(before.path); } catch { throw new Error("STORAGE_UNAVAILABLE"); }
  if (!signed || signed.path !== before.path || typeof signed.signedUrl !== "string" || !signed.signedUrl || typeof signed.token !== "string" || !signed.token) throw new Error("STORAGE_UNAVAILABLE");
  const after = await check();
  if (after.path !== before.path) throw new Error("CHECKOUT_UNAVAILABLE");
  return { signedUrl: signed.signedUrl, token: signed.token, path: signed.path, expiresAt: after.expiresAt };
}
