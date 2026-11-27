import type { Pool } from "pg";

export async function cleanDeletedBookingProofs(
  db: Pick<Pool, "query">,
  remove: (path: string) => Promise<void>,
  bookingId?: string,
) {
  const { rows } = await db.query<{ object_path: string; final: boolean }>(`
    WITH ready AS (
      SELECT object_path FROM ethn.deleted_booking_proofs
      WHERE next_attempt <= statement_timestamp() AND ($1::uuid IS NULL OR booking_id = $1)
      ORDER BY next_attempt, object_path LIMIT 25 FOR UPDATE SKIP LOCKED
    )
    UPDATE ethn.deleted_booking_proofs p SET next_attempt = statement_timestamp() + interval '15 minutes'
    FROM ready WHERE p.object_path = ready.object_path
    RETURNING p.object_path, p.final_after <= statement_timestamp() AS final`, [bookingId ?? null]);
  let failed = 0;
  await Promise.all(rows.map(async row => {
    try {
      await remove(row.object_path);
      if (row.final) await db.query("DELETE FROM ethn.deleted_booking_proofs WHERE object_path = $1", [row.object_path]);
      else await db.query("UPDATE ethn.deleted_booking_proofs SET next_attempt = final_after WHERE object_path = $1", [row.object_path]);
    } catch { failed++; }
  }));
  return { attempted: rows.length, failed };
}
