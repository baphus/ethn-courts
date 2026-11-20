import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { parsePesos, priceItems } from "../booking/core";
import { resolveSchedule } from "../booking/schedule";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const pesos = (value: bigint) => `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;

export type WalkInInput = {
  courtId: string; date: string; start: string; end: string;
  guestName: string; guestPhone?: string | null; method: "cash" | "gcash"; reference?: string | null;
};

function validate(body: unknown): WalkInInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_INPUT");
  const b = body as Record<string, unknown>;
  const allowed = ["courtId", "date", "start", "end", "guestName", "guestPhone", "method", "reference"];
  if (Object.keys(b).some(key => !allowed.includes(key))) throw new Error("INVALID_INPUT");
  const { courtId, date, start, end, guestName, guestPhone = null, method, reference = null } = b;
  if (typeof courtId !== "string" || !/^[1-9]\d*$/.test(courtId) || BigInt(courtId) > BigInt("9223372036854775807")) throw new Error("INVALID_INPUT");
  if (typeof date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error("INVALID_INPUT");
  for (const value of [start, end]) {
    if (typeof value !== "string" || !iso.test(value)) throw new Error("INVALID_INPUT");
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error("INVALID_INPUT");
  }
  if (new Date(end as string) <= new Date(start as string)) throw new Error("INVALID_INPUT");
  if (typeof guestName !== "string") throw new Error("INVALID_INPUT");
  const name = guestName.trim();
  if (!name || name.length > 100) throw new Error("INVALID_INPUT");
  if (guestPhone !== null && (typeof guestPhone !== "string" || guestPhone.trim().length > 30 || !/^[0-9+()\-\s]*$/.test(guestPhone.trim()))) throw new Error("INVALID_INPUT");
  if (method !== "cash" && method !== "gcash") throw new Error("INVALID_INPUT");
  if (method === "gcash") {
    if (typeof reference !== "string") throw new Error("INVALID_INPUT");
    const trimmed = reference.trim();
    if (!trimmed || trimmed.length > 100 || !/^[\x21-\x7e]+$/.test(trimmed)) throw new Error("INVALID_INPUT");
    return { courtId, date, start: start as string, end: end as string, guestName: name, guestPhone: guestPhone === null ? null : guestPhone.trim() || null, method, reference: trimmed };
  }
  if (reference !== null && reference !== "") throw new Error("INVALID_INPUT");
  return { courtId, date, start: start as string, end: end as string, guestName: name, guestPhone: guestPhone === null ? null : guestPhone.trim() || null, method, reference: null };
}

export async function createWalkIn(pool: Db, verify: StaffVerifier, body: unknown) {
  const input = validate(body);
  const subject = await verify();
  if (!subject || !/^[0-9a-f-]{36}$/i.test(subject)) throw new Error("UNAUTHENTICATED");
  const actor = subject.toLowerCase();
  await getStaff(pool, async () => actor);
  const client = await pool.connect();
  let committing = false, discard = false;
  try {
    await client.query("BEGIN");
    const staff = (await client.query("SELECT role FROM ethn.staff_access WHERE user_id = $1 AND enabled AND role IN ('owner','staff') FOR UPDATE", [actor])).rows[0];
    if (!staff) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT version::text, interval_minutes, minimum_minutes, anchor_minutes, horizon_days, merchant FROM ethn.settings WHERE singleton = true FOR UPDATE")).rows[0];
    if (!settings) throw new Error("WALK_IN_UNAVAILABLE");
    if (input.method === "gcash" && (typeof settings.merchant !== "string" || !settings.merchant.trim())) throw new Error("NOT_CONFIGURED");
    // shortcut: all-court lock matches checkout's small-venue serialization; revisit on measured contention.
    const courts = (await client.query("SELECT id::text, name, active FROM ethn.courts ORDER BY id FOR UPDATE")).rows;
    const hours = (await client.query("SELECT court_id::text, weekday, opens::text, closes::text, hourly_rate::text FROM ethn.court_hours")).rows;
    const candidates = (await client.query(`SELECT DISTINCT b.id FROM ethn.bookings b
      JOIN ethn.booking_items i ON i.booking_id = b.id JOIN ethn.court_allocations a ON a.item_id = i.id
      WHERE b.status = 'held' AND a.state = 'held' AND a.court_id = $1
        AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
      ORDER BY b.id`, [input.courtId, input.start, input.end])).rows.map(row => row.id);
    const locked = candidates.length ? (await client.query("SELECT id FROM ethn.bookings WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [candidates])).rows.map(row => row.id) : [];
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (locked.length) {
      const expired = (await client.query("UPDATE ethn.bookings SET status = 'expired' WHERE id = ANY($1::uuid[]) AND status = 'held' AND expires_at <= $2 RETURNING id", [locked, now])).rows.map(row => row.id);
      if (expired.length) await client.query("UPDATE ethn.court_allocations SET state = 'expired' WHERE state = 'held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id = ANY($1::uuid[]))", [expired]);
    }
    const resolved = resolveSchedule({ date: input.date, now, anchorMinutes: settings.anchor_minutes, interval: settings.interval_minutes, minimum: settings.minimum_minutes, horizonDays: settings.horizon_days, courts, hours, requests: [{ courtId: input.courtId, start: new Date(input.start), end: new Date(input.end) }] });
    if ("error" in resolved) throw new Error(resolved.error);
    const range = resolved.ranges[0];
    const total = pesos(priceItems([range]));
    const bookingId = randomUUID(), itemId = randomUUID(), paymentId = randomUUID();
    const merchant = input.method === "gcash" ? (settings.merchant as string) : (typeof settings.merchant === "string" && settings.merchant.trim() ? settings.merchant : null);
    await client.query(`INSERT INTO ethn.bookings (id, owner_hash, operating_date, status, expires_at, total, guest_name, guest_phone, price_acknowledged, merchant_snapshot, settings_version)
      VALUES ($1,$2,$3,'confirmed',$4,$5,$6,$7,true,$8,$9)`,
      [bookingId, createHash("sha256").update(randomUUID()).digest("hex"), input.date, now, total, input.guestName, input.guestPhone, merchant, settings.version]);
    await client.query(`INSERT INTO ethn.booking_items (id, booking_id, court_id, starts_at, ends_at, hourly_rate, duration_minutes, amount, interval_minutes, minimum_minutes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [itemId, bookingId, input.courtId, input.start, input.end, pesos(parsePesos(range.rate)), range.minutes, total, settings.interval_minutes, settings.minimum_minutes]);
    await client.query("INSERT INTO ethn.court_allocations (id, item_id, court_id, starts_at, ends_at, state) VALUES ($1,$2,$3,$4,$5,'confirmed')", [randomUUID(), itemId, input.courtId, input.start, input.end]);
    await client.query(`INSERT INTO ethn.payments (id, booking_id, method, merchant_snapshot, status, accepted_reference, collected_amount, received_at, verified_at, verified_by)
      VALUES ($1,$2,$3,$4,'accepted',$5,$6,$7,$7,$8)`, [paymentId, bookingId, input.method, merchant, input.reference, total, now, actor]);
    await client.query("INSERT INTO ethn.audit (booking_id, actor, action, detail) VALUES ($1,$2,'walkin.create',$3::jsonb)", [bookingId, actor, JSON.stringify({ courtId: input.courtId, startsAt: input.start, endsAt: input.end, total, method: input.method })]);
    const result = { bookingId, courtId: input.courtId, courtName: courts.find(court => court.id === input.courtId)?.name ?? null, operatingDate: input.date, startsAt: input.start, endsAt: input.end, total, method: input.method };
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard = true;
    else { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (error && typeof error === "object" && "code" in error && error.code === "23P01") throw new Error("SLOT_TAKEN");
    if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new Error("REFERENCE_TAKEN");
    if (error instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|NOT_CONFIGURED|COURT_UNAVAILABLE|CLOSED|INVALID_RATE|INVALID_SCHEDULE)$/.test(error.message)) throw error;
    throw new Error("WALK_IN_UNAVAILABLE");
  } finally { client.release(discard); }
}
