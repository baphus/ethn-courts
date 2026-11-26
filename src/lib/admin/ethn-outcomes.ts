import type { Pool, PoolClient } from "pg";
import type { StaffVerifier } from "./ethn-payments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code: string): never => { throw new Error(code); };
async function actorId(verify: StaffVerifier): Promise<string> {
  const actor: unknown = await verify();
  if (typeof actor !== "string" || !uuid.test(actor)) throw new Error("UNAUTHENTICATED");
  return actor.toLowerCase();
}
async function lockStaff(client: PoolClient, actor: string) {
  const result = await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor]);
  if (!result.rowCount) fail("FORBIDDEN");
}
function dbError(error: unknown): never {
  if (error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT", "NOT_COMPLETED", "NOT_READY_TO_COMPLETE", "STALE_OUTCOME"].includes(error.message)) throw error;
  throw new Error("OUTCOMES_UNAVAILABLE");
}

export async function completeBooking(pool: Pick<Pool, "connect">, verify: StaffVerifier, bookingId: string) {
  if (!uuid.test(bookingId)) fail("INVALID_INPUT");
  const actor = await actorId(verify), client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await lockStaff(client, actor);
    const locks = await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    if (!locks.rowCount) fail("OUTCOMES_UNAVAILABLE");
    const booking = (await client.query("SELECT status FROM ethn.bookings WHERE id=$1 FOR UPDATE", [bookingId])).rows[0];
    if (booking?.status === "completed") {
      try { await client.query("COMMIT"); } catch (error) { discard = true; throw error; }
      return { bookingId, changed: false };
    }
    const changed = await client.query(`UPDATE ethn.bookings b SET status='completed'
      WHERE b.id=$1 AND b.status='confirmed'
        AND NOT EXISTS (SELECT 1 FROM ethn.extensions e WHERE e.booking_id=b.id AND e.status IN ('held','pending'))
        AND (SELECT max(ends_at) FROM (
          SELECT i.ends_at FROM ethn.booking_items i WHERE i.booking_id=b.id
          UNION ALL SELECT ei.ends_at FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id
          WHERE e.booking_id=b.id AND e.status='confirmed'
        ) AS reserved) <= clock_timestamp() RETURNING id`, [bookingId]);
    if (!changed.rowCount) fail("NOT_READY_TO_COMPLETE");
    const allocations = await client.query(`UPDATE ethn.court_allocations SET state='completed' WHERE state='confirmed'
      AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id=$1)`, [bookingId]);
    if (!allocations.rowCount) fail("OUTCOMES_UNAVAILABLE");
    await client.query(`UPDATE ethn.court_allocations SET state='completed' WHERE state='confirmed'
      AND extension_item_id IN (SELECT ei.id FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id
        WHERE e.booking_id=$1 AND e.status='confirmed')`, [bookingId]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'booking_completed',$3)", [bookingId, actor, { source: "staff" }]);
    try { await client.query("COMMIT"); } catch (error) { discard = true; throw error; }
    return { bookingId, changed: true };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    dbError(error);
  } finally { client.release(discard ? new Error("discard failed transaction") : undefined); }
}

export async function setNoShow(
  pool: Pick<Pool, "connect">, verify: StaffVerifier, bookingId: string,
  input: { noShow: boolean; expectedNoShow: boolean; reason: string },
) {
  if (!uuid.test(bookingId) || !input || typeof input.noShow !== "boolean" || typeof input.expectedNoShow !== "boolean" || typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 500) fail("INVALID_INPUT");
  const actor = await actorId(verify), client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await lockStaff(client, actor);
    const row = (await client.query("SELECT status,no_show FROM ethn.bookings WHERE id=$1 FOR UPDATE", [bookingId])).rows[0];
    if (!row || row.status !== "completed") fail("NOT_COMPLETED");
    if (row.no_show !== input.expectedNoShow) fail("STALE_OUTCOME");
    if (row.no_show === input.noShow) { await client.query("COMMIT"); return { bookingId, noShow: row.no_show, changed: false }; }
    await client.query("UPDATE ethn.bookings SET no_show=$2 WHERE id=$1", [bookingId, input.noShow]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'booking_no_show_changed',$3)", [bookingId, actor, { from: row.no_show, to: input.noShow, reason: input.reason.trim() }]);
    try { await client.query("COMMIT"); } catch (error) { discard = true; throw error; }
    return { bookingId, noShow: input.noShow, changed: true };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    dbError(error);
  } finally { client.release(discard ? new Error("discard failed transaction") : undefined); }
}
