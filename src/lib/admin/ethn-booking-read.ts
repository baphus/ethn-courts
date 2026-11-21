import type { Pool } from "pg";
import { manilaDateStr } from "@/lib/booking/slots";
import { getStaff, type StaffVerifier } from "@/lib/admin/ethn-payments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const statuses = new Set(["held", "pending", "confirmed", "completed", "expired", "rejected"]);
type Db = Pick<Pool, "connect">;
type SummaryRow = { id: string; guest_name: string | null; status: string; operating_date: string; created_at: Date; total: string; item_count: number };
function summary(row: SummaryRow) {
  return { id: row.id, guestName: row.guest_name, status: row.status, operatingDate: row.operating_date, createdAt: new Date(row.created_at).toISOString(), total: row.total, itemCount: Number(row.item_count) };
}
function invalid(): never { throw new Error("INVALID_INPUT"); }
function iso(value: Date | string | null): string | null { return value == null ? null : new Date(value).toISOString(); }
async function rollback(client: { query: (sql: string) => Promise<unknown> }): Promise<boolean> {
  try { await client.query("ROLLBACK"); return false; } catch { return true; }
}
function date(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() === Number(value.slice(0, 4)) && d.getUTCMonth() + 1 === Number(value.slice(5, 7)) && d.getUTCDate() === Number(value.slice(8, 10));
}

export async function ethnDashboard(pool: Db, verify: StaffVerifier) {
  await getStaff(pool, verify);
  const client = await pool.connect();
  let discardClient=false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const clock = (await client.query("SELECT clock_timestamp() AS now, anchor_minutes FROM ethn.settings WHERE singleton = true")).rows[0];
    if (!clock) throw new Error("NOT_CONFIGURED");
    const now = new Date(clock.now);
    const operatingDate = manilaDateStr(new Date(now.getTime() - Number(clock.anchor_minutes) * 60_000));
    const counts = (await client.query(`SELECT
      count(*) FILTER (WHERE b.status = 'held' AND b.expires_at > $2::timestamptz)::int AS held,
      count(*) FILTER (WHERE b.status = 'pending')::int AS pending,
      count(*) FILTER (WHERE b.status = 'confirmed')::int AS confirmed,
      count(*) FILTER (WHERE b.status = 'completed')::int AS completed,
      count(*) FILTER (WHERE b.status = 'expired')::int AS expired,
      count(*) FILTER (WHERE b.status = 'pending' AND x.earliest_start <= $2::timestamptz)::int AS "pendingReviewOverdue"
      FROM ethn.bookings b LEFT JOIN LATERAL (SELECT min(i.starts_at) AS earliest_start FROM ethn.booking_items i WHERE i.booking_id = b.id) x ON true
      WHERE b.operating_date = $1::date`, [operatingDate, now])).rows[0];
    const recent = await client.query(`SELECT b.id, b.guest_name, b.status, b.operating_date::text, b.created_at, b.total::text,
      (SELECT count(*)::int FROM ethn.booking_items i WHERE i.booking_id = b.id) AS item_count
      FROM ethn.bookings b ORDER BY b.created_at DESC, b.id DESC LIMIT 8`);
    await client.query("COMMIT");
    return { operatingDate, counts, recentBookings: recent.rows.map(summary) };
  } catch (error) { discardClient=await rollback(client); throw error; }
  finally { client.release(discardClient); }
}

export async function searchEthnBookings(pool: Db, verify: StaffVerifier, params: URLSearchParams) {
  const allowed = new Set(["q", "status", "from", "to", "page", "limit"]);
  for (const key of new Set(params.keys())) if (!allowed.has(key) || params.getAll(key).length !== 1) invalid();
  const q = (params.get("q") ?? "").trim();
  const status = params.get("status") ?? "";
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  const pageRaw = params.get("page") ?? "1", limitRaw = params.get("limit") ?? "20";
  if (q.length > 100 || (status && !statuses.has(status)) || (from && !date(from)) || (to && !date(to)) || (from && to && from > to) || !/^\d+$/.test(pageRaw) || !/^\d+$/.test(limitRaw)) invalid();
  const page = Number(pageRaw), limit = Number(limitRaw);
  if (page < 1 || page > 1000 || limit < 1 || limit > 50) invalid();
  await getStaff(pool, verify);
  const offset = (page - 1) * limit;
  const values: unknown[] = [];
  const filters: string[] = [];
  if (status) { values.push(status); filters.push(`b.status = $${values.length}`); }
  if (from) { values.push(from); filters.push(`b.operating_date >= $${values.length}::date`); }
  if (to) { values.push(to); filters.push(`b.operating_date <= $${values.length}::date`); }
  if (q) {
    const search: string[] = [];
    if (uuid.test(q)) { values.push(q); search.push(`b.id = $${values.length}::uuid`); }
    const escaped = q.replace(/[\\%_]/g, "\\$&");
    values.push(`%${escaped}%`); const like = `$${values.length}`;
    search.push(`b.guest_name ILIKE ${like} ESCAPE E'\\\\'`, `b.guest_email ILIKE ${like} ESCAPE E'\\\\'`, `b.guest_phone ILIKE ${like} ESCAPE E'\\\\'`);
    values.push(`${escaped}%`); search.push(`b.tracking_code ILIKE $${values.length} ESCAPE E'\\\\'`);
    filters.push(`(${search.join(" OR ")})`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const client = await pool.connect();
  let discardClient=false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const total = Number((await client.query(`SELECT count(*)::int AS total FROM ethn.bookings b ${where}`, values)).rows[0].total);
    const rows = await client.query(`SELECT b.id, b.guest_name, b.status, b.operating_date::text, b.created_at, b.total::text,
      (SELECT count(*)::int FROM ethn.booking_items i WHERE i.booking_id = b.id) AS item_count
      FROM ethn.bookings b ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]);
    await client.query("COMMIT");
    return { rows: rows.rows.map(summary), page, limit, total };
  } catch (error) { discardClient=await rollback(client); throw error; }
  finally { client.release(discardClient); }
}

export async function ethnBookingDetail(pool: Db, verify: StaffVerifier, id: string) {
  if (!uuid.test(id)) invalid();
  await getStaff(pool, verify);
  const client = await pool.connect();
  let discard: Error | undefined;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const b = (await client.query(`SELECT id, operating_date::text, status, no_show, expires_at, total::text, guest_name, guest_email, guest_phone, created_at
      FROM ethn.bookings WHERE id = $1`, [id])).rows[0];
    if (!b) { await client.query("COMMIT"); return null; }
    const [items, payments] = await Promise.all([
      client.query(`SELECT i.court_id::text, c.name AS court_name, i.starts_at, i.ends_at, i.duration_minutes, i.hourly_rate::text, i.amount::text
        FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id WHERE i.booking_id = $1
         UNION ALL SELECT ei.court_id::text,c.name,ei.starts_at,ei.ends_at,ei.duration_minutes,ei.hourly_rate::text,ei.amount::text FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id JOIN ethn.courts c ON c.id=ei.court_id WHERE e.booking_id=$1 AND e.status='confirmed' ORDER BY starts_at`, [id]),
      client.query(`SELECT p.id, p.method, p.status, p.claimed_amount::text, p.claimed_reference, p.received_at, p.verified_at,
        p.collected_amount::text, p.accepted_reference, p.reviewed_at, p.review_reason,
        EXISTS (SELECT 1 FROM ethn.proof_reservations r WHERE r.id = p.proof_id AND r.booking_id = p.booking_id AND r.owner_hash = b.owner_hash AND r.state = 'attached') AS "proofAvailable"
        FROM ethn.payments p JOIN ethn.bookings b ON b.id = p.booking_id WHERE p.booking_id = $1 ORDER BY p.id`, [id]),
    ]);
    await client.query("COMMIT");
    return { id: b.id, operatingDate: b.operating_date, status: b.status, noShow: b.no_show as boolean, expiresAt: iso(b.expires_at), total: b.total, guestName: b.guest_name, guestEmail: b.guest_email, guestPhone: b.guest_phone, createdAt: iso(b.created_at), items: items.rows.map(i => ({ courtId: i.court_id, courtName: i.court_name, startsAt: iso(i.starts_at), endsAt: iso(i.ends_at), durationMinutes: i.duration_minutes, hourlyRate: i.hourly_rate, amount: i.amount })), payments: payments.rows.map(p => ({ id: p.id, method: p.method, status: p.status, claimedAmount: p.claimed_amount, claimedReference: p.claimed_reference, receivedAt: iso(p.received_at), verifiedAt: iso(p.verified_at), collectedAmount: p.collected_amount, acceptedReference: p.accepted_reference, reviewedAt: iso(p.reviewed_at), reviewReason: p.review_reason, proofAvailable: p.proofAvailable })) };
  } catch (error) { await client.query("ROLLBACK").catch(() => { discard = error instanceof Error ? error : new Error("DB_ERROR"); }); if (discard) (client as typeof client & { release(error?: Error): void }).release(discard); throw error; }
  finally { if (!discard) client.release(); }
}
