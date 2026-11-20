import type { Pool } from "pg";

export type StaffVerifier = () => Promise<string | null>;
type Db = Pick<Pool, "connect">;
type Signer = (path: string, expiresIn: number) => Promise<string>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getStaff(pool: Db, verify: StaffVerifier) {
  const id = await verify();
  if (!id || !uuid.test(id)) throw new Error("UNAUTHENTICATED");
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT role FROM ethn.staff_access WHERE user_id = $1 AND enabled = true AND role IN ('owner','staff')", [id]);
    if (!rows[0]) throw new Error("FORBIDDEN");
    return { userId: id, role: rows[0].role as "owner" | "staff" };
  } finally { client.release(); }
}

export async function paymentQueue(pool: Db, verify: StaffVerifier) {
  await getStaff(pool, verify);
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT b.id, b.guest_name, b.operating_date::text, b.total::text, p.created_at, p.claimed_amount::text
      FROM ethn.bookings b JOIN ethn.payments p ON p.booking_id = b.id
      WHERE b.status = 'pending' AND p.status = 'unverified'
      ORDER BY p.created_at, b.id LIMIT 50`);
    return rows.map(r => ({ bookingId: r.id as string, guestName: r.guest_name as string | null, operatingDate: r.operating_date as string, total: r.total as string, createdAt: (r.created_at as Date).toISOString(), claimedAmount: r.claimed_amount as string | null }));
  } finally { client.release(); }
}

export async function paymentDetail(pool: Db, verify: StaffVerifier, bookingId: string) {
  await getStaff(pool, verify);
  if (!uuid.test(bookingId)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  try {
    const b = (await client.query("SELECT id, operating_date::text, status, total::text, guest_name, guest_email, guest_phone, created_at FROM ethn.bookings WHERE id = $1", [bookingId])).rows[0];
    if (!b) return null;
    const items = (await client.query("SELECT c.name AS court, i.starts_at, i.ends_at, i.amount::text FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id WHERE i.booking_id = $1 ORDER BY i.starts_at, c.name", [bookingId])).rows;
    const payments = (await client.query(`SELECT p.method, p.status, p.claimed_reference, p.claimed_amount::text, p.merchant_snapshot,
      EXISTS (SELECT 1 FROM ethn.proof_reservations r WHERE r.id = p.proof_id AND r.booking_id = p.booking_id AND r.owner_hash = b.owner_hash AND r.state = 'attached') AS proof_available
      FROM ethn.payments p JOIN ethn.bookings b ON b.id = p.booking_id WHERE p.booking_id = $1 ORDER BY p.id`, [bookingId])).rows;
    return { bookingId: b.id as string, operatingDate: b.operating_date as string, status: b.status as string, total: b.total as string, guestName: b.guest_name as string | null, guestEmail: b.guest_email as string | null, guestPhone: b.guest_phone as string | null, createdAt: (b.created_at as Date).toISOString(), items: items.map(i => ({ court: i.court as string, startsAt: (i.starts_at as Date).toISOString(), endsAt: (i.ends_at as Date).toISOString(), amount: i.amount as string })), payments: payments.map(p => ({ method: p.method as string, status: p.status as string, claimedReference: p.claimed_reference as string | null, claimedAmount: p.claimed_amount as string | null, merchant: p.merchant_snapshot as string | null, proofAvailable: p.proof_available as boolean })) };
  } finally { client.release(); }
}

export async function paymentProof(pool: Db, verify: StaffVerifier, bookingId: string, sign: Signer) {
  await getStaff(pool, verify);
  if (!uuid.test(bookingId)) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  let path: string | undefined;
  try {
    const { rows } = await client.query(`SELECT r.object_path FROM ethn.bookings b JOIN ethn.payments p ON p.booking_id = b.id
      JOIN ethn.proof_reservations r ON r.id = p.proof_id AND r.booking_id = b.id AND r.owner_hash = b.owner_hash
      WHERE b.id = $1 AND r.state = 'attached' ORDER BY p.id LIMIT 1`, [bookingId]);
    path = rows[0]?.object_path;
  } finally { client.release(); }
  if (!path) return null;
  await getStaff(pool, verify);
  return { signedUrl: await sign(path, 300), expiresIn: 300 };
}
