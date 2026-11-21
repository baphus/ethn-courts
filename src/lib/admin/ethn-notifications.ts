import type { Pool } from "pg";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limit = 50;

export async function reconcileInbox(pool: Db, verify: StaffVerifier) {
  const { userId } = await getStaff(pool, verify);
  return reconcileInboxForRecipient(pool, userId);
}

export async function reconcileInboxForRecipient(pool: Db, userId: string) {
  if (!uuid.test(userId)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  let discarded = false, committing = false;
  try {
    await client.query("BEGIN");
    const staff = await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role IN ('owner','staff') FOR UPDATE", [userId]);
    if (!staff.rows[0]) throw new Error("FORBIDDEN");
    let created = 0;
    const pending = await client.query(`SELECT b.id, bool_or(i.starts_at <= clock_timestamp()) AS overdue,
        bool_or(i.starts_at > clock_timestamp() AND i.starts_at <= clock_timestamp() + interval '30 minutes') AS due_soon
      FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id
      WHERE b.status='pending' AND EXISTS (SELECT 1 FROM ethn.payments p WHERE p.booking_id=b.id AND p.status='unverified')
      GROUP BY b.id ORDER BY b.id LIMIT 100`);
    for (const row of pending.rows) {
      const eventKey = row.overdue ? `overdue:${row.id}` : `payment:${row.id}`;
      const title = row.overdue ? 'Overdue pending booking' : 'Pending payment';
      const body = row.overdue ? 'A pending booking has reached its scheduled time.' : 'A booking needs payment review.';
      const inserted = await client.query(`INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link)
        VALUES(gen_random_uuid(),$1,$2,$3,$4,$5) ON CONFLICT(recipient,event_key) DO NOTHING`,
      [userId, eventKey, title, body, `/admin/bookings/${row.id}`]);
      created += inserted.rowCount ?? 0;
      if (!row.overdue && row.due_soon) {
        const urgent = await client.query(`INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link)
          VALUES(gen_random_uuid(),$1,$2,'Booking starting soon','A pending booking starts within 30 minutes.',$3)
          ON CONFLICT(recipient,event_key) DO NOTHING`, [userId, `urgent:${row.id}`, `/admin/bookings/${row.id}`]);
        created += urgent.rowCount ?? 0;
      }
    }
    const exceptions = await client.query(`SELECT p.id FROM ethn.payments p JOIN ethn.bookings b ON b.id=p.booking_id
      WHERE p.status='exception' AND p.reviewed_at IS NULL AND (b.status='expired' OR p.extension_id IS NOT NULL)
      ORDER BY p.created_at,p.id LIMIT 100`);
    for (const row of exceptions.rows) {
      const inserted = await client.query(`INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link)
        VALUES(gen_random_uuid(),$1,$2,'Late payment exception','A late payment needs review.','/admin/exceptions')
        ON CONFLICT(recipient,event_key) DO NOTHING`, [userId, `exception:${row.id}`]);
      created += inserted.rowCount ?? 0;
    }
    committing = true; await client.query("COMMIT");
    return { created };
  } catch (error) {
    if (committing) discarded = true;
    else try { await client.query("ROLLBACK"); } catch { discarded = true; }
    throw error;
  } finally { client.release(discarded); }
}

export async function listInbox(pool: Db, verify: StaffVerifier, unreadOnly = false) {
  const { userId } = await getStaff(pool, verify);
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT id,title,body,link,created_at,read_at FROM ethn.notifications
      WHERE recipient=$1 AND ($2::boolean=false OR read_at IS NULL)
      ORDER BY created_at DESC,id DESC LIMIT $3`, [userId, unreadOnly, limit]);
    return rows.map(row => ({ id: row.id as string, title: row.title as string, body: row.body as string, link: row.link as string, createdAt: (row.created_at as Date).toISOString(), readAt: row.read_at ? (row.read_at as Date).toISOString() : null }));
  } finally { client.release(); }
}

export async function markInboxRead(pool: Db, verify: StaffVerifier, id: string) {
  const { userId } = await getStaff(pool, verify);
  if (!uuid.test(id)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  try {
    const result = await client.query(`UPDATE ethn.notifications SET read_at=COALESCE(read_at,clock_timestamp())
      WHERE id=$1 AND recipient=$2 RETURNING id,read_at`, [id, userId]);
    if (!result.rows[0]) return null;
    return { id: result.rows[0].id as string, readAt: (result.rows[0].read_at as Date).toISOString() };
  } finally { client.release(); }
}
