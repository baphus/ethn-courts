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
    const { rows } = await client.query(`WITH inbox AS (
      SELECT id,title,body,link,created_at,read_at,split_part(event_key,':',1) AS kind,split_part(event_key,':',2) AS booking_id
      FROM ethn.notifications WHERE ${inboxRecipient} AND ($2::boolean=false OR read_at IS NULL)
      ORDER BY created_at DESC,id DESC LIMIT $3
    )
    SELECT n.*, b.guest_name, COALESCE(b.tracking_code, b.id::text) AS reference,
      CASE WHEN n.kind='refund_recorded' THEN r.amount ELSE b.total END::text AS amount,
      (SELECT jsonb_agg(jsonb_build_object('courtName',c.name,'startsAt',i.starts_at,'endsAt',i.ends_at) ORDER BY i.starts_at,c.name,i.id)
       FROM ethn.booking_items i JOIN ethn.courts c ON c.id=i.court_id WHERE i.booking_id=b.id) AS slots
    FROM inbox n LEFT JOIN ethn.bookings b ON b.id = CASE
      WHEN n.kind IN ('proof_submitted','booking_confirmed','booking_cancelled','refund_recorded') AND n.booking_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN n.booking_id::uuid END AND n.link='/admin/bookings/' || b.id::text
    LEFT JOIN ethn.booking_refunds r ON r.booking_id=b.id AND n.kind='refund_recorded'
    ORDER BY n.created_at DESC,n.id DESC`, [userId, unreadOnly, limit]);
    return rows.map(row => ({
      id: row.id as string, title: row.title as string, body: row.body as string, link: row.link as string,
      createdAt: (row.created_at as Date).toISOString(), readAt: row.read_at ? (row.read_at as Date).toISOString() : null,
      kind: row.reference ? row.kind : null,
      booking: row.reference && row.amount !== null ? {
        customerName: row.guest_name || "Customer name unavailable", reference: row.reference,
        slots: row.slots ?? [], amount: row.amount, amountKind: row.kind === "refund_recorded" ? "refund_amount" : "booking_total",
      } : null,
    }));
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
