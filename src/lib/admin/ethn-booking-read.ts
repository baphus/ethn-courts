import type { Pool } from "pg";
import { manilaDateStr } from "@/lib/booking/slots";
import { getStaff, type StaffVerifier } from "@/lib/admin/ethn-payments";
import { summarizeBookingSchedule } from "./ethn-booking-schedule";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const statuses = new Set(["pending", "confirmed", "completed", "rejected", "cancelled", "refunded"]);
const visibleBooking = "b.status NOT IN ('held', 'expired')";
const latePayment = "b.status='expired' AND EXISTS (SELECT 1 FROM ethn.payments p WHERE p.booking_id=b.id AND p.status='exception' AND p.proof_id IS NOT NULL)";
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
  let discardClient = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const clock = (await client.query("SELECT clock_timestamp() AS now, anchor_minutes FROM ethn.settings WHERE singleton = true")).rows[0];
    if (!clock) throw new Error("NOT_CONFIGURED");
    const now = new Date(clock.now);
    const operatingDate = manilaDateStr(new Date(now.getTime() - Number(clock.anchor_minutes) * 60_000));
    const { confirmed, completed } = (await client.query(`SELECT
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      count(*) FILTER (WHERE status = 'completed')::int AS completed
      FROM ethn.bookings WHERE operating_date = $1::date AND status IN ('confirmed','completed')`, [operatingDate])).rows[0];
    const recent = await client.query<SummaryRow & { slot_count: number; approved_at: Date }>(`SELECT b.id, b.guest_name, b.status, b.operating_date::text, b.created_at, b.total::text,
      x.item_count, x.slot_count, approval.approved_at FROM ethn.bookings b
      CROSS JOIN LATERAL (
        SELECT max(p.verified_at) AS approved_at FROM ethn.payments p
        WHERE p.booking_id = b.id AND p.extension_id IS NULL AND p.status = 'accepted'
      ) approval CROSS JOIN LATERAL (
        SELECT count(*)::int AS item_count, coalesce(sum(i.duration_minutes / i.interval_minutes), 0)::int AS slot_count
        FROM ethn.booking_items i WHERE i.booking_id = b.id
      ) x
      WHERE b.status IN ('confirmed','completed') AND b.archived_at IS NULL AND approval.approved_at IS NOT NULL
      ORDER BY approval.approved_at DESC, b.id DESC LIMIT 8`);
    await client.query("COMMIT");
    return { operatingDate, calendarDate: manilaDateStr(now), counts: { confirmed, completed },
      recentBookings: recent.rows.map(row => ({ ...summary(row), slotCount: row.slot_count, approvedAt: row.approved_at.toISOString() })) };
  } catch (error) { discardClient = await rollback(client); throw error; }
  finally { client.release(discardClient); }
}

export async function searchEthnBookings(pool: Db, verify: StaffVerifier, params: URLSearchParams) {
  const allowed = new Set(["q", "status", "from", "to", "page", "limit", "archived"]);
  for (const key of new Set(params.keys())) if (!allowed.has(key) || (key !== "status" && params.getAll(key).length !== 1)) invalid();
  const q = (params.get("q") ?? "").trim();
  const selected = params.getAll("status");
  if (selected.length === 1 && selected[0] === "") selected.pop();
  const archived = params.get("archived");
  if (archived !== null && archived !== "true" && archived !== "false" && archived !== "all" && archived !== "include") invalid();
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  const pageRaw = params.get("page") ?? "1", limitRaw = params.get("limit") ?? "20";
  if (q.length > 100 || selected.length > statuses.size || selected.some(status => !statuses.has(status)) || (from && !date(from)) || (to && !date(to)) || (from && to && from > to) || !/^\d+$/.test(pageRaw) || !/^\d+$/.test(limitRaw)) invalid();
  const page = Number(pageRaw), limit = Number(limitRaw);
  if (page < 1 || page > 1000 || limit < 1 || limit > 50) invalid();
  const actor = await getStaff(pool, verify);
  const offset = (page - 1) * limit;
  const values: unknown[] = [];
  const filters = [uuid.test(q) && !selected.length ? `(${visibleBooking} OR (${latePayment}))` : visibleBooking];
  if (archived !== "all" && archived !== "include") {
    filters.push(archived === "true" ? "b.archived_at IS NOT NULL" : "b.archived_at IS NULL");
  }
  if (selected.length) {
    values.push(selected.includes("confirmed") ? [...new Set([...selected, "completed"])] : selected);
    const statusMatch = `b.status = ANY($${values.length}::text[])`;
    filters.push(archived === "include" ? `(b.archived_at IS NOT NULL OR ${statusMatch})` : statusMatch);
  } else if (archived === "include") {
    filters.push("b.archived_at IS NOT NULL");
  }
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
    const rows = await client.query<SummaryRow & { archived: boolean; tracking_code: string | null; guest_email: string | null; guest_phone: string | null; can_approve: boolean; can_refund: boolean }>(`SELECT b.id, b.guest_name, b.status, b.operating_date::text, b.created_at, b.total::text,
      b.archived_at IS NOT NULL AS archived, b.tracking_code, b.guest_email, b.guest_phone,
      (b.status = 'pending' AND (SELECT count(*) = 1 AND bool_and(p.status='unverified' AND r.id IS NOT NULL)
        FROM ethn.payments p LEFT JOIN ethn.proof_reservations r ON r.id=p.proof_id AND r.booking_id=b.id AND r.owner_hash=b.owner_hash AND r.state='attached'
        WHERE p.booking_id=b.id)) AS can_approve,
      (SELECT count(*)::int FROM ethn.booking_items i WHERE i.booking_id = b.id) AS item_count
      FROM ethn.bookings b ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]);
    const schedules = new Map<string, Parameters<typeof summarizeBookingSchedule>[0]>();
    if (rows.rows.length) {
      const { rows: items } = await client.query<{ booking_id: string; court_name: string; starts_at: Date; ends_at: Date; duration_minutes: number; interval_minutes: number }>(`
        SELECT i.booking_id, c.name AS court_name, i.starts_at, i.ends_at, i.duration_minutes, i.interval_minutes
        FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id WHERE i.booking_id = ANY($1::uuid[])
        UNION ALL
        SELECT e.booking_id, c.name, i.starts_at, i.ends_at, i.duration_minutes, i.interval_minutes
        FROM ethn.extensions e JOIN ethn.extension_items i ON i.extension_id = e.id JOIN ethn.courts c ON c.id = i.court_id
        WHERE e.booking_id = ANY($1::uuid[]) AND e.status IN ('confirmed', 'completed')`, [rows.rows.map(row => row.id)]);
      for (const item of items) {
        const schedule = schedules.get(item.booking_id) ?? [];
        schedule.push({ courtName: item.court_name, startsAt: item.starts_at.toISOString(), endsAt: item.ends_at.toISOString(), durationMinutes: item.duration_minutes, intervalMinutes: item.interval_minutes });
        schedules.set(item.booking_id, schedule);
      }
    }
    await client.query("COMMIT");
    const owner = actor.role === "owner";
    return { rows: rows.rows.map(row => ({ ...summary(row), archived: row.archived, canApprove: owner && row.can_approve, canRefund: owner && row.can_refund, canDelete: owner, trackingCode: row.tracking_code, guestEmail: row.guest_email, guestPhone: row.guest_phone, ...summarizeBookingSchedule(schedules.get(row.id) ?? []) })), page, limit, total };
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
    const b = (await client.query(`SELECT id, operating_date::text, status, no_show, expires_at, total::text, guest_name, guest_email, guest_phone, created_at, walk_in_actor, archived_at,
      statement_timestamp() AS now, EXISTS (SELECT 1 FROM ethn.extensions e WHERE e.booking_id=b.id AND e.status IN ('held','pending')) AS unresolved_extension,
      NOT EXISTS (SELECT 1 FROM ethn.extensions e WHERE e.booking_id=b.id AND e.status IN ('held','pending','confirmed')) AS extensions_clear
      FROM ethn.bookings b WHERE b.id = $1 AND (${visibleBooking} OR (${latePayment}))`, [id])).rows[0];
    if (!b) { await client.query("COMMIT"); return null; }
    const [items, payments] = await Promise.all([
      client.query(`SELECT i.court_id::text, c.name AS court_name, i.starts_at, i.ends_at, i.duration_minutes, i.hourly_rate::text, i.amount::text,
        i.interval_minutes, false AS is_extension
        FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id WHERE i.booking_id = $1
        UNION ALL SELECT ei.court_id::text, c.name, ei.starts_at, ei.ends_at, ei.duration_minutes, ei.hourly_rate::text, ei.amount::text,
        ei.interval_minutes, true FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id = ei.extension_id
        JOIN ethn.courts c ON c.id = ei.court_id WHERE e.booking_id = $1 AND e.status = 'confirmed' ORDER BY starts_at`, [id]),
      client.query(`SELECT p.id, p.method, p.status, p.claimed_amount::text, p.claimed_reference, p.received_at, p.verified_at,
        p.collected_amount::text, p.accepted_reference, p.reviewed_at, p.review_reason, p.extension_id,
        COALESCE(m.value->>'name', pm.name, CASE p.method WHEN 'cash' THEN 'Cash' WHEN 'gcash' THEN 'GCash' ELSE p.method END) AS method_name,
        EXISTS (SELECT 1 FROM ethn.proof_reservations r WHERE r.id = p.proof_id AND r.booking_id = p.booking_id AND r.owner_hash = b.owner_hash AND r.state = 'attached') AS "proofAvailable"
        FROM ethn.payments p JOIN ethn.bookings b ON b.id = p.booking_id
        LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(b.payment_methods_snapshot) WHERE value->>'id' = p.method LIMIT 1) m ON true
        LEFT JOIN ethn.payment_methods pm ON pm.id = p.method WHERE p.booking_id = $1 ORDER BY p.id`, [id]),
    ]);
    await client.query("COMMIT");
    const paymentMethod = [...new Set(payments.rows.filter(p => p.extension_id === null).map(p => p.method_name))].join(", ") || null;
    const canComplete = b.status === 'confirmed' && !b.unresolved_extension && items.rows.length > 0 && items.rows.every(item => item.ends_at <= b.now);
    const canCancel = b.status === 'confirmed' && b.extensions_clear && items.rows.length > 0 && items.rows.every(item => item.starts_at > b.now);
    const accepted = payments.rows.filter(payment => payment.status === 'accepted');
    const canRefund = canCancel && accepted.length === 1 && accepted[0].collected_amount === b.total;
    return { id: b.id, canComplete, canCancel, canRefund, paymentMethod, internal: !!b.walk_in_actor, archivedAt: iso(b.archived_at), operatingDate: b.operating_date, status: b.status, noShow: b.no_show as boolean, expiresAt: iso(b.expires_at), total: b.total, guestName: b.guest_name, guestEmail: b.guest_email, guestPhone: b.guest_phone, createdAt: iso(b.created_at), items: items.rows.map(i => ({ courtId: i.court_id, courtName: i.court_name, startsAt: iso(i.starts_at), endsAt: iso(i.ends_at), durationMinutes: i.duration_minutes, intervalMinutes: i.interval_minutes, isExtension: i.is_extension, hourlyRate: i.hourly_rate, amount: i.amount })), payments: payments.rows.map(p => ({ id: p.id, method: p.method, status: p.status, claimedAmount: p.claimed_amount, claimedReference: p.claimed_reference, receivedAt: iso(p.received_at), verifiedAt: iso(p.verified_at), collectedAmount: p.collected_amount, acceptedReference: p.accepted_reference, reviewedAt: iso(p.reviewed_at), reviewReason: p.review_reason, proofAvailable: p.proofAvailable })) };
  } catch (error) { await client.query("ROLLBACK").catch(() => { discard = error instanceof Error ? error : new Error("DB_ERROR"); }); if (discard) (client as typeof client & { release(error?: Error): void }).release(discard); throw error; }
  finally { if (!discard) client.release(); }
}
