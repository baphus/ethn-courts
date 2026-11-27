import { createHash } from "node:crypto";
import type { Pool } from "pg";

export async function findTrackingProof(pool: Pick<Pool, "query">, token: string) {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  const hash = createHash("sha256").update(token.toLowerCase()).digest("hex");
  const { rows } = await pool.query<{ object_path: string; mime_type: string }>(`SELECT r.object_path, r.mime_type
    FROM ethn.bookings b JOIN ethn.payments p ON p.booking_id = b.id
    JOIN ethn.proof_reservations r ON r.id = p.proof_id AND r.booking_id = b.id AND r.owner_hash = b.owner_hash
    WHERE b.tracking_hash = $1 AND b.status IN ('pending','confirmed','completed','rejected','cancelled','refunded')
      AND p.extension_id IS NULL AND r.state = 'attached'
    ORDER BY p.id LIMIT 1`, [hash]);
  return rows[0] ?? null;
}
