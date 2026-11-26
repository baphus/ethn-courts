import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { parsePesos, priceItems } from "../booking/core";
import { resolveSchedule } from "../booking/schedule";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const pesos = (value: bigint) => `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

type WalkInInput = {
  courtId: string; date: string; start: string; end: string; guestName: string; guestPhone: string | null;
  method: "cash" | "gcash"; reference: string | null; collectedAmount: string; displayedTotal: string;
  settingsVersion: string; paymentReceived: true; idempotencyKey: string; holdId: string;
};
type HoldInput = Pick<WalkInInput, "courtId" | "date" | "start" | "end" | "guestName" | "guestPhone">;
function validateHold(body: unknown): HoldInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_INPUT");
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(key => !["courtId","date","start","end","guestName","guestPhone"].includes(key))) throw new Error("INVALID_INPUT");
  const valid = validate({ ...b, method:"cash", collectedAmount:"0.00", displayedTotal:"0.00", settingsVersion:"1", paymentReceived:true, idempotencyKey:randomUUID() }, false);
  return {courtId:valid.courtId,date:valid.date,start:valid.start,end:valid.end,guestName:valid.guestName,guestPhone:valid.guestPhone};
}

function validate(body: unknown, requireHold = true): WalkInInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_INPUT");
  const b = body as Record<string, unknown>;
  const allowed = ["courtId", "date", "start", "end", "guestName", "guestPhone", "method", "reference", "collectedAmount", "displayedTotal", "settingsVersion", "paymentReceived", "idempotencyKey", "holdId"];
  if (Object.keys(b).some(key => !allowed.includes(key))) throw new Error("INVALID_INPUT");
  const { courtId, date, start, end, guestName, guestPhone = null, method, reference = null, collectedAmount, displayedTotal, settingsVersion, paymentReceived, idempotencyKey, holdId } = b;
  const paymentMethod = method === "cash" || method === "gcash" ? method : null;
  if (typeof courtId !== "string" || !/^[1-9]\d*$/.test(courtId) || BigInt(courtId) > BigInt("9223372036854775807")) throw new Error("INVALID_INPUT");
  if (typeof date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error("INVALID_INPUT");
  for (const value of [start, end]) {
    if (typeof value !== "string" || !iso.test(value)) throw new Error("INVALID_INPUT");
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error("INVALID_INPUT");
  }
  if (new Date(end as string) <= new Date(start as string)) throw new Error("INVALID_INPUT");
  if (typeof guestName !== "string" || !guestName.trim() || guestName.trim().length > 100) throw new Error("INVALID_INPUT");
  if (guestPhone !== null && (typeof guestPhone !== "string" || guestPhone.trim().length > 30 || !/^[0-9+()\-\s]*$/.test(guestPhone.trim()))) throw new Error("INVALID_INPUT");
  if (!paymentMethod) throw new Error("INVALID_INPUT");
  if (paymentMethod === "gcash") {
    if (typeof reference !== "string" || !reference.trim() || reference.trim().length > 100 || !/^[\x21-\x7e]+$/.test(reference.trim())) throw new Error("INVALID_INPUT");
  } else if (reference !== null && reference !== "") throw new Error("INVALID_INPUT");
  if (typeof collectedAmount !== "string" || typeof displayedTotal !== "string" || typeof settingsVersion !== "string" || !/^[1-9]\d*$/.test(settingsVersion) || BigInt(settingsVersion) > BigInt("9223372036854775807") || paymentReceived !== true || typeof idempotencyKey !== "string" || !/^[\x21-\x7e]{1,200}$/.test(idempotencyKey) || (requireHold && (typeof holdId !== "string" || !/^[0-9a-f-]{36}$/i.test(holdId)))) throw new Error("INVALID_INPUT");
  try {
    return { courtId, date, start: start as string, end: end as string, guestName: guestName.trim(), guestPhone: guestPhone === null ? null : (guestPhone as string).trim() || null, method: paymentMethod, reference: paymentMethod === "gcash" ? (reference as string).trim() : null, collectedAmount: pesos(parsePesos(collectedAmount)), displayedTotal: pesos(parsePesos(displayedTotal)), settingsVersion, paymentReceived, idempotencyKey, holdId: typeof holdId === "string" ? holdId.toLowerCase() : "" };
  } catch { throw new Error("INVALID_INPUT"); }
}

export async function reserveWalkIn(pool: Db, verify: StaffVerifier, body: unknown) {
  const input = validateHold(body);
  const subject = await verify();
  if (!subject || !/^[0-9a-f-]{36}$/i.test(subject)) throw new Error("UNAUTHENTICATED");
  const actor = subject.toLowerCase(), ownerHash = hash(actor), client = await pool.connect();
  let committing=false,discard=false;
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT version::text, interval_minutes, minimum_minutes, anchor_minutes, horizon_days, hold_minutes, merchant FROM ethn.settings WHERE singleton=true FOR UPDATE")).rows[0];
    if (!settings) throw new Error("WALK_IN_UNAVAILABLE");
    const courts = (await client.query("SELECT id::text,name,active FROM ethn.courts ORDER BY id FOR UPDATE")).rows;
    const hours = (await client.query("SELECT court_id::text,weekday,opens::text,closes::text,hourly_rate::text FROM ethn.court_hours")).rows;
    const candidates=(await client.query("SELECT DISTINCT b.id FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id WHERE b.status='held' AND a.state='held' AND a.court_id=$1 AND a.starts_at<$3 AND a.ends_at>$2 ORDER BY b.id",[input.courtId,input.start,input.end])).rows.map(row=>row.id);
    await client.query("SELECT id FROM ethn.bookings WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[candidates]);
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const expired=(await client.query("UPDATE ethn.bookings SET status='expired' WHERE id=ANY($1::uuid[]) AND status='held' AND expires_at<=$2 RETURNING id",[candidates,now])).rows.map(row=>row.id);
    await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE state='held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id=ANY($1::uuid[]))",[expired]);
    const resolved = resolveSchedule({ date: input.date, now, anchorMinutes: settings.anchor_minutes, interval: settings.interval_minutes, minimum: settings.minimum_minutes, horizonDays: settings.horizon_days, courts, hours, requests: [{ courtId: input.courtId,start: new Date(input.start),end: new Date(input.end) }] });
    if ("error" in resolved) throw new Error(resolved.error);
    const range = resolved.ranges[0], total = pesos(priceItems([range]));
    const holdId = randomUUID(), itemId = randomUUID(), expiry = new Date(now.getTime() + settings.hold_minutes * 60000);
    await client.query("INSERT INTO ethn.bookings(id,owner_hash,walk_in_actor,operating_date,status,expires_at,total,guest_name,guest_phone,price_acknowledged,merchant_snapshot,settings_version) VALUES($1,$2,$3,$4,'held',$5,$6,$7,$8,true,$9,$10)", [holdId,ownerHash,actor,input.date,expiry,total,input.guestName,input.guestPhone,settings.merchant,settings.version]);
    await client.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [itemId,holdId,input.courtId,input.start,input.end,pesos(parsePesos(range.rate)),range.minutes,total,settings.interval_minutes,settings.minimum_minutes]);
    await client.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state,expires_at) VALUES($1,$2,$3,$4,$5,'held',$6)", [randomUUID(),itemId,input.courtId,input.start,input.end,expiry]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'walkin.hold',$3::jsonb)", [holdId,actor,JSON.stringify({courtId:input.courtId,startsAt:input.start,endsAt:input.end,total,expiresAt:expiry.toISOString()})]);
    committing=true; await client.query("COMMIT"); return { holdId, courtId: input.courtId, courtName: courts.find(court=>court.id===input.courtId)?.name??null, startsAt:input.start, endsAt:input.end, total, settingsVersion:settings.version, merchant:settings.merchant, expiresAt:expiry.toISOString() };
  } catch (error) {
    if(committing)discard=true;else try { await client.query("ROLLBACK"); } catch { discard=true; }
    if (error && typeof error === "object" && "code" in error && error.code === "23P01") throw new Error("SLOT_TAKEN");
    if (error instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|COURT_UNAVAILABLE|CLOSED|INVALID_RATE|INVALID_SCHEDULE)$/.test(error.message)) throw error;
    throw new Error("WALK_IN_UNAVAILABLE");
  } finally { client.release(discard); }
}

export async function createWalkIn(pool: Db, verify: StaffVerifier, body: unknown) {
  let input: WalkInInput;
  input = validate(body);
  const subject = await verify();
  if (!subject || !/^[0-9a-f-]{36}$/i.test(subject)) throw new Error("UNAUTHENTICATED");
  const actor = subject.toLowerCase();
  await getStaff(pool, async () => actor);
  const ownerHash = hash(actor);
  const { idempotencyKey, holdId, ...payload } = input;
  const fingerprint = hash(JSON.stringify({holdId,...payload}));
  const client = await pool.connect();
  let committing = false, discard = false;
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const inserted = await client.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES ($1,'walkin',$2,$3,NULL) ON CONFLICT DO NOTHING RETURNING key", [ownerHash, idempotencyKey, fingerprint]);
    const existing = await client.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='walkin' AND key=$2 FOR UPDATE", [ownerHash, idempotencyKey]);
    const idem = existing.rows[0];
    if (!idem || idem.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (!inserted.rows.length) {
      if (idem.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE");
      committing = true; await client.query("COMMIT"); return idem.result;
    }
    await client.query("SELECT singleton FROM ethn.settings WHERE singleton FOR UPDATE");
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const held = (await client.query(`SELECT b.id,b.status,b.expires_at,b.total::text,b.settings_version::text,b.merchant_snapshot,b.operating_date::text,
      i.court_id::text,i.starts_at,i.ends_at,i.hourly_rate::text,i.duration_minutes,i.amount::text,i.interval_minutes,i.minimum_minutes,a.state,a.expires_at AS allocation_expires
      FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id
      WHERE b.id=$1 AND b.walk_in_actor=$2 FOR UPDATE OF b,a`, [holdId,actor])).rows[0];
    if (!held || held.status !== "held") throw new Error("HOLD_NOT_FOUND");
    if (held.total !== input.displayedTotal || held.total !== input.collectedAmount || held.settings_version !== input.settingsVersion || held.court_id !== input.courtId || held.operating_date !== input.date || held.starts_at.toISOString() !== input.start || held.ends_at.toISOString() !== input.end) throw new Error("PRICE_CHANGED");
    const settings = (await client.query("SELECT version::text, merchant FROM ethn.settings WHERE singleton=true FOR UPDATE")).rows[0];
    if (!settings) throw new Error("WALK_IN_UNAVAILABLE");
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    if (held.expires_at <= now) throw new Error("HOLD_EXPIRED");
    if (held.state !== 'held' || held.allocation_expires <= now) throw new Error('HOLD_EXPIRED');
    const bookingId = holdId, total = held.total, paymentId = randomUUID();
    const merchant = held.merchant_snapshot;
    if (input.method === "gcash" && (!merchant || !String(merchant).trim())) throw new Error("NOT_CONFIGURED");
    const courts = (await client.query("SELECT id::text,name FROM ethn.courts")).rows;
    await client.query("UPDATE ethn.bookings SET status='confirmed' WHERE id=$1 AND status='held'", [bookingId]);
    await client.query("UPDATE ethn.court_allocations SET state='confirmed' WHERE item_id=(SELECT id FROM ethn.booking_items WHERE booking_id=$1) AND state='held'", [bookingId]);
    await client.query("INSERT INTO ethn.payments(id,booking_id,method,merchant_snapshot,status,accepted_reference,collected_amount,received_at,verified_at,verified_by) VALUES($1,$2,$3,$4,'accepted',$5,$6,$7,$7,$8)", [paymentId,bookingId,input.method,merchant,input.reference,total,now,actor]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'walkin.create',$3::jsonb)", [bookingId,actor,JSON.stringify({courtId:input.courtId,startsAt:input.start,endsAt:input.end,total,method:input.method})]);
    const result = { bookingId,courtId:input.courtId,courtName:courts.find(court=>court.id===input.courtId)?.name??null,operatingDate:input.date,startsAt:input.start,endsAt:input.end,total,method:input.method };
    await client.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='walkin' AND key=$2 AND fingerprint=$3", [ownerHash,idempotencyKey,fingerprint,JSON.stringify(result)]);
    committing=true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard=true; else { try { await client.query("ROLLBACK"); } catch { discard=true; } }
    if (error && typeof error === "object" && "code" in error && error.code === "23P01") throw new Error("SLOT_TAKEN");
    if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new Error("REFERENCE_TAKEN");
    if (error instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|NOT_CONFIGURED|COURT_UNAVAILABLE|CLOSED|INVALID_RATE|INVALID_SCHEDULE|PRICE_CHANGED|IDEMPOTENCY_MISMATCH|HOLD_NOT_FOUND|HOLD_EXPIRED|IDEMPOTENCY_INCOMPLETE)$/.test(error.message)) throw error;
    throw new Error("WALK_IN_UNAVAILABLE");
  } finally { client.release(discard); }
}
