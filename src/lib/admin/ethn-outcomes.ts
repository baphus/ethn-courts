import type { Pool, PoolClient } from "pg";
import type { StaffVerifier } from "./ethn-payments";
import { recordBookingAlerts } from "../booking/ethn-booking-alerts";

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
  if (error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT", "NOT_COMPLETED", "STALE_OUTCOME"].includes(error.message)) throw error;
  throw new Error("OUTCOMES_UNAVAILABLE");
}

export async function completeDueBookings(pool: Pick<Pool, "connect">, verify: StaffVerifier) {
  return completeDue(pool, await actorId(verify), "staff");
}

export async function completeDueBookingsFromCron(pool: Pick<Pool, "connect">) {
  return completeDue(pool, "system:completion", "cron");
}

// Caller locks alert recipients before taking ordered court locks.
export async function cancelPastPendingBookings(client: PoolClient, owners: string[]) {
  const result = await client.query(`WITH due AS (
    SELECT b.id FROM ethn.bookings b
    WHERE b.status='pending'
      AND (SELECT max(i.ends_at) FROM ethn.booking_items i WHERE i.booking_id=b.id) <= statement_timestamp()
    ORDER BY b.id LIMIT 50 FOR UPDATE OF b
  ), cancelled AS (
    UPDATE ethn.bookings b SET status='cancelled' FROM due
    WHERE b.id=due.id AND b.status='pending' RETURNING b.id
  ), allocations AS (
    UPDATE ethn.court_allocations a SET state='cancelled'
    FROM ethn.booking_items i, cancelled b
    WHERE a.item_id=i.id AND i.booking_id=b.id AND a.state='pending'
  )
  INSERT INTO ethn.audit(booking_id,actor,action,detail)
  SELECT id,'system:cancellation','booking.cancel','{"reason":"scheduled court time ended before approval"}'::jsonb
  FROM cancelled RETURNING booking_id`);
  await recordBookingAlerts(client, result.rows.map(row => row.booking_id), "booking_cancelled", owners);
  return result.rowCount ?? 0;
}

async function completeDue(pool: Pick<Pool, "connect">, actor: string, source: "staff" | "cron") {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    if (source === "staff") await lockStaff(client, actor);
    const locks = await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    if (!locks.rowCount) fail("OUTCOMES_UNAVAILABLE");
    const result = await client.query(`WITH due AS (
      SELECT b.id FROM ethn.bookings b
      WHERE b.status='confirmed' AND NOT EXISTS(SELECT 1 FROM ethn.extensions pending_extension WHERE pending_extension.booking_id=b.id AND pending_extension.status='pending')
        AND (SELECT max(ends_at) FROM (SELECT i.ends_at FROM ethn.booking_items i WHERE i.booking_id=b.id UNION ALL SELECT ei.ends_at FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id WHERE e.booking_id=b.id AND e.status='confirmed') effective_items) <= clock_timestamp()
      ORDER BY b.id LIMIT 50 FOR UPDATE OF b
    ), changed AS (
      UPDATE ethn.bookings b SET status='completed'
      FROM due WHERE b.id=due.id AND b.status='confirmed' AND NOT EXISTS(SELECT 1 FROM ethn.extensions pending_extension WHERE pending_extension.booking_id=b.id AND pending_extension.status='pending')
        AND (SELECT max(ends_at) FROM (SELECT i.ends_at FROM ethn.booking_items i WHERE i.booking_id=b.id UNION ALL SELECT ei.ends_at FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id WHERE e.booking_id=b.id AND e.status='confirmed') effective_items) <= clock_timestamp()
      RETURNING b.id
    ), allocations AS (
      UPDATE ethn.court_allocations a SET state='completed'
      FROM ethn.booking_items i, changed c
      WHERE a.item_id=i.id AND i.booking_id=c.id AND a.state='confirmed'
      RETURNING i.booking_id
    ), audited AS (
      INSERT INTO ethn.audit(booking_id,actor,action,detail)
      SELECT id,$1,'booking_completed',jsonb_build_object('source',$2::text) FROM changed
      RETURNING booking_id
    ) SELECT c.id FROM changed c JOIN (SELECT booking_id,count(*) FROM allocations GROUP BY booking_id) a ON a.booking_id=c.id
      JOIN audited u ON u.booking_id=c.id ORDER BY c.id`, [actor, source]);
    await client.query("UPDATE ethn.court_allocations SET state='completed' WHERE state='confirmed' AND extension_item_id IN (SELECT ei.id FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id WHERE e.booking_id=ANY($1::uuid[]) AND e.status='confirmed')",[result.rows.map(row=>row.id)]);
    try { await client.query("COMMIT"); } catch (error) { discard = true; throw error; }
    return { completed: result.rows.map(row => row.id as string) };
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
