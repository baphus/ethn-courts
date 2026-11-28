import type { Pool } from "pg";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limit = 50;
const inboxRecipient = "recipient=$1 AND link <> '/admin/exceptions' AND dismissed_at IS NULL";

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
    SELECT n.*, b.guest_name, b.guest_email, b.guest_phone, b.operating_date::text AS booking_date,
      COALESCE(b.tracking_code, b.id::text) AS reference, b.total::text AS booking_total,
      CASE WHEN n.kind='refund_recorded' THEN r.amount ELSE b.total END::text AS amount,
      COALESCE(m.value->>'name', pm.name, CASE p.method WHEN 'cash' THEN 'Cash' WHEN 'gcash' THEN 'GCash' ELSE p.method END) AS payment_method,
      (SELECT jsonb_agg(jsonb_build_object('courtName',c.name,'startsAt',i.starts_at,'endsAt',i.ends_at,
         'durationMinutes',i.duration_minutes,'hourlyRate',i.hourly_rate::text,'lineAmount',i.amount::text) ORDER BY i.starts_at,c.name,i.id)
       FROM ethn.booking_items i JOIN ethn.courts c ON c.id=i.court_id WHERE i.booking_id=b.id) AS slots
    FROM inbox n LEFT JOIN ethn.bookings b ON b.id = CASE
      WHEN n.kind IN ('proof_submitted','booking_confirmed','booking_cancelled','refund_recorded') AND n.booking_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN n.booking_id::uuid END AND n.link='/admin/bookings/' || b.id::text
    LEFT JOIN ethn.booking_refunds r ON r.booking_id=b.id AND n.kind='refund_recorded'
    LEFT JOIN LATERAL (SELECT method FROM ethn.payments WHERE booking_id=b.id AND extension_id IS NULL
      ORDER BY (status='accepted') DESC,id LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(b.payment_methods_snapshot) WHERE value->>'id'=p.method LIMIT 1) m ON true
    LEFT JOIN ethn.payment_methods pm ON pm.id=p.method
    ORDER BY n.created_at DESC,n.id DESC`, [userId, unreadOnly, limit]);
    return rows.map(row => ({
      id: row.id as string, title: row.title as string, body: row.body as string, link: row.link as string,
      createdAt: (row.created_at as Date).toISOString(), readAt: row.read_at ? (row.read_at as Date).toISOString() : null,
      kind: row.reference ? row.kind : null,
      booking: row.reference && row.amount !== null ? {
        customerName: row.guest_name || "Customer name unavailable", customerEmail: row.guest_email, customerPhone: row.guest_phone,
        reference: row.reference, bookingDate: row.booking_date, paymentMethod: row.payment_method, bookingTotal: row.booking_total,
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

export async function dismissInboxNotification(pool: Db, verify: StaffVerifier, id: string) {
  const { userId } = await getStaff(pool, verify);
  if (!uuid.test(id)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(`UPDATE ethn.notifications SET dismissed_at=statement_timestamp()
      WHERE ${inboxRecipient} AND id=$2`, [userId, id]);
    return rowCount === 1;
  } finally { client.release(); }
}

export async function markInboxRead(pool: Db, verify: StaffVerifier, id: string) {
  const { userId } = await getStaff(pool, verify);
  if (!uuid.test(id)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  try {
    const result = await client.query(`UPDATE ethn.notifications SET read_at=COALESCE(read_at,clock_timestamp())
      WHERE recipient=$1 AND id=$2 AND dismissed_at IS NULL RETURNING id,read_at`, [userId, id]);
    if (!result.rows[0]) return null;
    return { id: result.rows[0].id as string, readAt: (result.rows[0].read_at as Date).toISOString() };
  } finally { client.release(); }
}
