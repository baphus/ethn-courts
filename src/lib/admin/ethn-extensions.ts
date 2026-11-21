import { expireExtensionHolds } from '../booking/extension-expiry';
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { parsePesos, priceItems } from "../booking/core";
import { resolveSchedule } from "../booking/schedule";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
type PaymentMethod = "cash" | "gcash";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const pesos = (cents: bigint) => `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;

function validate(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_INPUT");
  const b = input as Record<string, unknown>;
  if (Object.keys(b).some(k => !["bookingId", "courtId", "date", "start", "end", "settingsVersion", "idempotencyKey"].includes(k))) throw new Error("INVALID_INPUT");
  const { bookingId, courtId, date, start, end, settingsVersion, idempotencyKey } = b;
  if (typeof bookingId !== "string" || !uuid.test(bookingId) || typeof courtId !== "string" || !/^[1-9]\d*$/.test(courtId) || BigInt(courtId) > BigInt("9223372036854775807") || typeof date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(date) || typeof settingsVersion !== "string" || !/^[1-9]\d*$/.test(settingsVersion) || typeof idempotencyKey !== "string" || !/^[\x21-\x7e]{1,200}$/.test(idempotencyKey)) throw new Error("INVALID_INPUT");
  for (const time of [start, end]) if (typeof time !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(time) || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) throw new Error("INVALID_INPUT");
  if (Date.parse(end as string) <= Date.parse(start as string)) throw new Error("INVALID_INPUT");
  return { bookingId: bookingId.toLowerCase(), courtId, date, start: start as string, end: end as string, settingsVersion, idempotencyKey };
}

async function staffActor(pool: Db, verify: StaffVerifier) {
  const actor = await verify();
  if (!actor || !uuid.test(actor)) throw new Error("UNAUTHENTICATED");
  await getStaff(pool, async () => actor.toLowerCase());
  return actor.toLowerCase();
}

export async function createExtensionHold(pool: Db, verify: StaffVerifier, body: unknown) {
  const input = validate(body), actor = await staffActor(pool, verify);
  const fingerprint = hash(JSON.stringify({ ...input, idempotencyKey: undefined }));
  const client = await pool.connect();
  let discard = false, committing = false;
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role IN ('owner','staff') FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT version::text,interval_minutes,minimum_minutes,anchor_minutes,horizon_days,hold_minutes,merchant FROM ethn.settings WHERE singleton=true FOR UPDATE")).rows[0];
    if (!settings) throw new Error("EXTENSION_UNAVAILABLE");
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const ins = await client.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'extension_hold',$2,$3,NULL) ON CONFLICT DO NOTHING RETURNING key", [hash(actor), input.idempotencyKey, fingerprint]);
    const prior = (await client.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='extension_hold' AND key=$2 FOR UPDATE", [hash(actor), input.idempotencyKey])).rows[0];
    if (!prior || prior.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (!ins.rows.length) { if (!prior.result) throw new Error("IDEMPOTENCY_INCOMPLETE"); committing = true; await client.query("COMMIT"); return prior.result; }
    if (settings.version !== input.settingsVersion) throw new Error("PRICE_CHANGED");
    await expireExtensionHolds(client);
    const booking = (await client.query("SELECT id,status,operating_date::text FROM ethn.bookings WHERE id=$1 FOR UPDATE", [input.bookingId])).rows[0];
    if (!booking || booking.status !== "confirmed") throw new Error("BOOKING_INELIGIBLE");
    const priorExt = (await client.query("SELECT id,status,expires_at FROM ethn.extensions WHERE booking_id=$1 AND status IN ('held','pending') FOR UPDATE", [input.bookingId])).rows[0];
    if (priorExt) {
      const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
      if (priorExt.status !== "held" || new Date(priorExt.expires_at) > now) throw new Error("EXTENSION_ACTIVE");
      await client.query("UPDATE ethn.extensions SET status='expired' WHERE id=$1 AND status='held'", [priorExt.id]);
      await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=$1) AND state='held'", [priorExt.id]);
    }
    const items = (await client.query("SELECT court_id::text,starts_at,ends_at,false AS is_extension FROM ethn.booking_items WHERE booking_id=$1 UNION ALL SELECT ei.court_id::text,ei.starts_at,ei.ends_at,true AS is_extension FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id WHERE e.booking_id=$1 AND e.status='confirmed'", [input.bookingId])).rows;
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const courtItems = items.filter((item: { court_id: string }) => item.court_id === input.courtId);
    const originalItems = items.filter((item: { is_extension: boolean }) => !item.is_extension);
    const earliest = Math.min(...originalItems.map((item: { starts_at: Date }) => new Date(item.starts_at).getTime()));
    const latest = courtItems.reduce((end: number, item: { ends_at: Date }) => Math.max(end, new Date(item.ends_at).getTime()), 0);
    if (!items.length || !courtItems.length || !Number.isFinite(earliest) || earliest > now.getTime() || latest <= now.getTime() || input.date !== booking.operating_date || Date.parse(input.start) !== latest) throw new Error("BOOKING_INELIGIBLE");
    const courts = (await client.query("SELECT id::text,active FROM ethn.courts ORDER BY id")).rows;
    const hours = (await client.query("SELECT court_id::text,weekday,opens::text,closes::text,hourly_rate::text FROM ethn.court_hours")).rows;
    const schedule = resolveSchedule({ date: input.date, now, anchorMinutes: settings.anchor_minutes, interval: settings.interval_minutes, minimum: settings.minimum_minutes, horizonDays: settings.horizon_days, courts, hours, requests: [{ courtId: input.courtId, start: new Date(input.start), end: new Date(input.end) }] });
    if ("error" in schedule) throw new Error(schedule.error);
    const range = schedule.ranges[0];
    const total = pesos(priceItems([{ rate: range.rate, minutes: range.minutes }]));
    const extensionId = randomUUID(), itemId = randomUUID(), expires = new Date(Math.min(now.getTime() + settings.hold_minutes * 60000, latest));
    await client.query("INSERT INTO ethn.extensions(id,booking_id,status,expires_at,operating_date,total,merchant_snapshot,settings_version,created_by,idempotency_key) VALUES($1,$2,'held',$3,$4,$5,$6,$7,$8,$9)", [extensionId,input.bookingId,expires,input.date,total,settings.merchant,settings.version,actor,input.idempotencyKey]);
    await client.query("INSERT INTO ethn.extension_items(id,extension_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [itemId,extensionId,input.courtId,input.start,input.end,range.rate,range.minutes,total,settings.interval_minutes]);
    await client.query("INSERT INTO ethn.court_allocations(id,extension_item_id,court_id,starts_at,ends_at,state,expires_at) VALUES($1,$2,$3,$4,$5,'held',$6)", [randomUUID(),itemId,input.courtId,input.start,input.end,expires]);
    const result = { extensionId, bookingId: input.bookingId, courtId: input.courtId, startsAt: input.start, endsAt: input.end, total, expiresAt: expires.toISOString() };
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'extension.hold',$3::jsonb)", [input.bookingId,actor,JSON.stringify({ extensionId, courtId: input.courtId, startsAt: input.start, endsAt: input.end, total })]);
    await client.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='extension_hold' AND key=$2 AND fingerprint=$3", [hash(actor),input.idempotencyKey,fingerprint,JSON.stringify(result)]);
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard = true; else try { await client.query("ROLLBACK"); } catch { discard = true; }
    if (error && typeof error === "object" && "code" in error && error.code === "23P01") throw new Error("SLOT_TAKEN");
    if (error instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|IDEMPOTENCY_MISMATCH|BOOKING_INELIGIBLE|EXTENSION_ACTIVE|PRICE_CHANGED|COURT_UNAVAILABLE|INVALID_SCHEDULE|CLOSED|INVALID_RATE)$/.test(error.message)) throw error;
    throw new Error("EXTENSION_UNAVAILABLE", { cause: error });
  } finally { client.release(discard); }
}

export async function confirmExtension(pool: Db, verify: StaffVerifier, input: { extensionId: string; key: string; method: PaymentMethod; collectedAmount: string; receivedAt: string; paymentReceived: true; acceptedReference?: string }) {
  if (!input || !uuid.test(input.extensionId) || !/^[\x21-\x7e]{1,200}$/.test(input.key) || !["cash","gcash"].includes(input.method) || input.paymentReceived !== true) throw new Error("INVALID_INPUT");
  let amount: string, reference: string | null = null;
  try { amount = pesos(parsePesos(input.collectedAmount)); if (input.method === "gcash") { if (typeof input.acceptedReference !== "string" || !input.acceptedReference.trim() || input.acceptedReference.trim().length > 200) throw new Error(); reference = input.acceptedReference.trim(); } else if (input.acceptedReference) throw new Error(); } catch { throw new Error("INVALID_INPUT"); }
  const received = new Date(input.receivedAt);
  if (!Number.isFinite(received.getTime()) || received.toISOString() !== input.receivedAt) throw new Error("INVALID_INPUT");
  const actor = await staffActor(pool, verify), fingerprint = hash(JSON.stringify({ extensionId: input.extensionId.toLowerCase(), method: input.method, amount, receivedAt: input.receivedAt, reference }));
  const client = await pool.connect(); let discard = false, committing = false;
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role IN ('owner','staff') FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT singleton,merchant FROM ethn.settings WHERE singleton=true FOR UPDATE")).rows[0];
    if (!settings) throw new Error("EXTENSION_UNAVAILABLE");
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const extRow = (await client.query("SELECT booking_id FROM ethn.extensions WHERE id=$1",[input.extensionId])).rows[0];
    if (!extRow) throw new Error("EXTENSION_FINAL");
    const inserted = await client.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'extension_confirm',$2,$3,NULL) ON CONFLICT DO NOTHING RETURNING key", [hash(actor),input.key,fingerprint]);
    const idem = (await client.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='extension_confirm' AND key=$2 FOR UPDATE", [hash(actor),input.key])).rows[0];
    if (!idem || idem.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (!inserted.rows.length) { if (!idem.result) throw new Error("IDEMPOTENCY_INCOMPLETE"); committing = true; await client.query("COMMIT"); return idem.result; }
    const booking = (await client.query("SELECT id,status FROM ethn.bookings WHERE id=$1 FOR UPDATE",[extRow.booking_id])).rows[0];
    if (!booking || booking.status !== "confirmed") throw new Error("BOOKING_INELIGIBLE");
    const ext = (await client.query("SELECT id,booking_id,status,total::text,merchant_snapshot FROM ethn.extensions WHERE id=$1 FOR UPDATE", [input.extensionId])).rows[0];
    if (!ext || ext.status !== "held") throw new Error("EXTENSION_FINAL");
    const items = (await client.query("SELECT court_id::text,starts_at,ends_at,false AS is_extension FROM ethn.booking_items WHERE booking_id=$1 UNION ALL SELECT ei.court_id::text,ei.starts_at,ei.ends_at,true AS is_extension FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id WHERE e.booking_id=$1 AND e.status='confirmed'", [ext.booking_id])).rows;
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const starts = items.filter((item: { is_extension: boolean }) => !item.is_extension).map((item: { starts_at: Date }) => new Date(item.starts_at).getTime());
    const ends = items.map((item: { ends_at: Date }) => new Date(item.ends_at).getTime());
    if (!starts.length || Math.min(...starts) > now.getTime() || Math.max(...ends) <= now.getTime()) throw new Error("BOOKING_INELIGIBLE");
    if (new Date(input.receivedAt) > now) throw new Error("INVALID_INPUT");
    if (amount !== ext.total) throw new Error("AMOUNT_MISMATCH");
    if (input.method === "gcash" && !ext.merchant_snapshot) throw new Error("NOT_CONFIGURED");
    const allocation = (await client.query("SELECT a.id FROM ethn.court_allocations a JOIN ethn.extension_items i ON i.id=a.extension_item_id WHERE i.extension_id=$1 AND a.state='held' AND a.expires_at>$2 AND (SELECT expires_at FROM ethn.extensions WHERE id=$1)>$2 FOR UPDATE OF a", [ext.id,now])).rows[0];
    if (!allocation) throw new Error("EXTENSION_EXPIRED");
    await client.query("INSERT INTO ethn.payments(id,booking_id,extension_id,method,merchant_snapshot,status,accepted_reference,collected_amount,received_at,verified_at,verified_by) VALUES($1,$2,$3,$4,$5,'accepted',$6,$7,$8,$9,$10)", [randomUUID(),ext.booking_id,ext.id,input.method,input.method==='gcash'?ext.merchant_snapshot:null,reference,amount,received,now,actor]);
    await client.query("UPDATE ethn.extensions SET status='confirmed' WHERE id=$1 AND status='held'", [ext.id]);
    await client.query("UPDATE ethn.court_allocations SET state='confirmed',expires_at=NULL WHERE id=$1 AND state='held'", [allocation.id]);
    await client.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'extension.confirm',$3::jsonb)", [ext.booking_id,actor,JSON.stringify({ extensionId:ext.id, amount, method:input.method, receivedAt:input.receivedAt })]);
    const result = { extensionId: ext.id, bookingId: ext.booking_id, status: "confirmed", total: amount, method: input.method };
    await client.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='extension_confirm' AND key=$2 AND fingerprint=$3", [hash(actor),input.key,fingerprint,JSON.stringify(result)]);
    committing = true; await client.query("COMMIT"); return result;
  } catch (error) {
    if (committing) discard=true; else try { await client.query("ROLLBACK"); } catch { discard=true; }
    if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new Error("REFERENCE_TAKEN");
    if (error instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|IDEMPOTENCY_MISMATCH|EXTENSION_FINAL|EXTENSION_EXPIRED|AMOUNT_MISMATCH|NOT_CONFIGURED|BOOKING_INELIGIBLE)$/.test(error.message)) throw error;
    throw new Error("EXTENSION_UNAVAILABLE", { cause: error });
  } finally { client.release(discard); }
}

export async function expireExtension(pool: Db, verify: StaffVerifier, extensionId: string) {
  if (!uuid.test(extensionId)) throw new Error("INVALID_INPUT");
  const actor = await staffActor(pool, verify), client = await pool.connect(); let discard=false, committing=false;
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role IN ('owner','staff') FOR UPDATE",[actor])).rows.length) throw new Error("FORBIDDEN");
    await client.query("SELECT singleton FROM ethn.settings WHERE singleton=true FOR UPDATE");
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const ext = (await client.query("SELECT id,booking_id,status,expires_at FROM ethn.extensions WHERE id=$1 FOR UPDATE",[extensionId])).rows[0];
    if (!ext) throw new Error("NOT_FOUND");
    if (ext.status === "held") {
      const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
      const expired = await client.query("UPDATE ethn.extensions SET status='expired' WHERE id=$1 AND status='held' AND expires_at<=$2 RETURNING status",[extensionId,now]);
      if (expired.rows.length) await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=$1) AND state='held'",[extensionId]);
      const current = (await client.query("SELECT status FROM ethn.extensions WHERE id=$1",[extensionId])).rows[0];
      committing = true; await client.query("COMMIT"); return { extensionId, status: current.status };
    }
    committing = true; await client.query("COMMIT"); return { extensionId, status: ext.status };
  } catch(error) { if(committing) discard=true; else try { await client.query("ROLLBACK"); } catch { discard=true; } if(error instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|NOT_FOUND)$/.test(error.message)) throw error; throw new Error("EXTENSION_UNAVAILABLE"); }
  finally { client.release(discard); }
}
