import type { Pool } from "pg";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limit = 50;
const inboxRecipient = "recipient=$1 AND link <> '/admin/exceptions'";

export async function getSidebarCounts(pool: Db, verify: StaffVerifier) {
  const { userId } = await getStaff(pool, verify);
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ pendingBookings: string; unreadNotifications: string }>(`SELECT
      (SELECT count(*) FROM ethn.bookings WHERE status='pending') AS "pendingBookings",
      (SELECT count(*) FROM ethn.notifications WHERE ${inboxRecipient} AND read_at IS NULL) AS "unreadNotifications"`, [userId]);
    return { pendingBookings: Number(rows[0].pendingBookings), unreadNotifications: Number(rows[0].unreadNotifications) };
  } finally { client.release(); }
}

export async function listInbox(pool: Db, verify: StaffVerifier, unreadOnly = false) {
  const { userId } = await getStaff(pool, verify);
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT id,title,body,link,created_at,read_at FROM ethn.notifications
      WHERE ${inboxRecipient} AND ($2::boolean=false OR read_at IS NULL)
      ORDER BY created_at DESC,id DESC LIMIT $3`, [userId, unreadOnly, limit]);
    return rows.map(row => ({ id: row.id as string, title: row.title as string, body: row.body as string, link: row.link as string, createdAt: (row.created_at as Date).toISOString(), readAt: row.read_at ? (row.read_at as Date).toISOString() : null }));
  } finally { client.release(); }
}

export async function markAllInboxRead(pool: Db, verify: StaffVerifier) {
  const { userId } = await getStaff(pool, verify);
  const client = await pool.connect();
  try {
    const result = await client.query(`UPDATE ethn.notifications SET read_at=statement_timestamp()
      WHERE ${inboxRecipient} AND read_at IS NULL`, [userId]);
    return { markedRead: result.rowCount ?? 0 };
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
