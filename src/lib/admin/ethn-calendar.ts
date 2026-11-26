import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { manilaDateStr, manilaWallClock } from "../booking/slots";
import type { StaffVerifier } from "./ethn-payments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= BigInt("9223372036854775807");
const exact = (v: unknown, fields: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
function dateOk(value: string) { const d = manilaWallClock(value); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(d.getTime()) && manilaDateStr(d) === value; }
function validInput(value: unknown) {
  if (!exact(value, ["courtId", "startsAt", "endsAt", "reason", "kind"])) throw new Error("INVALID_INPUT");
  const body = value as Record<string, unknown>;
  if (!id(body.courtId) || typeof body.startsAt !== "string" || typeof body.endsAt !== "string" || typeof body.reason !== "string" || !["maintenance", "private"].includes(body.kind as string)) throw new Error("INVALID_INPUT");
  const start = new Date(body.startsAt as string), end = new Date(body.endsAt as string), reason = (body.reason as string).trim();
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.startsAt as string) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.endsAt as string) || !Number.isFinite(start.getTime()) || start.toISOString() !== body.startsAt || !Number.isFinite(end.getTime()) || end.toISOString() !== body.endsAt || end <= start || !reason || reason.length > 500) throw new Error("INVALID_INPUT");
  return { courtId: body.courtId as string, start, end, reason, kind: body.kind as "maintenance" | "private" };
}
async function actorId(verify: StaffVerifier) { const actor = await verify(); if (!actor || !uuid.test(actor)) throw new Error("UNAUTHENTICATED"); return actor.toLowerCase(); }
function serviceError(error: unknown): never {
  if (error instanceof Error && /^(UNAUTHENTICATED|FORBIDDEN|INVALID_INPUT|COURT_NOT_FOUND|BLOCK_NOT_FOUND|SLOT_TAKEN)$/.test(error.message)) throw error;
  if (error && typeof error === "object" && "code" in error && (error as {code:string}).code === "23P01") throw new Error("SLOT_TAKEN");
  throw new Error("CALENDAR_UNAVAILABLE");
}
export async function getEthnCalendar(pool: Pick<Pool,"connect">, verify: StaffVerifier, requestedDate: string | null) {
  const actor = await actorId(verify), client = await pool.connect();
  let transaction=false, committing=false, discard=false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); transaction=true;
    if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor])).rows.length) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT anchor_minutes, transaction_timestamp() AS now FROM ethn.settings WHERE singleton")).rows[0];
    if (!settings || !Number.isInteger(settings.anchor_minutes)) throw new Error("CALENDAR_UNAVAILABLE");
    const now = settings.now as Date, date = requestedDate ?? manilaDateStr(new Date(now.getTime() - settings.anchor_minutes * 60000));
    if (!dateOk(date)) throw new Error("INVALID_INPUT");
    const start = new Date(manilaWallClock(date).getTime() + settings.anchor_minutes * 60000), end = new Date(start.getTime() + 86400000);
    const courts = (await client.query("SELECT id::text,name,active FROM ethn.courts ORDER BY id")).rows;
    const rows = (await client.query(`SELECT a.id::text,a.court_id::text,a.starts_at,a.ends_at,a.state,a.block_id::text,b.kind,b.reason,COALESCE(bi.booking_id,e.booking_id)::text AS booking_id,COALESCE(bookings.guest_name,eb.guest_name) AS guest_name,COALESCE(bookings.expires_at,e.expires_at) AS expires_at,
      CASE WHEN a.state <> 'held' THEN COALESCE(bi.duration_minutes / NULLIF(bi.interval_minutes,0),ei.duration_minutes / NULLIF(ei.interval_minutes,0)) END AS slot_count
      FROM ethn.court_allocations a LEFT JOIN ethn.court_blocks b ON b.id=a.block_id LEFT JOIN ethn.booking_items bi ON bi.id=a.item_id LEFT JOIN ethn.bookings ON bookings.id=bi.booking_id LEFT JOIN ethn.extension_items ei ON ei.id=a.extension_item_id LEFT JOIN ethn.extensions e ON e.id=ei.extension_id LEFT JOIN ethn.bookings eb ON eb.id=e.booking_id
      WHERE a.starts_at < $2 AND a.ends_at > $1 AND (a.state IN ('pending','confirmed','completed') OR (a.state='held' AND COALESCE(bookings.expires_at,e.expires_at) > $3)) ORDER BY a.court_id,a.starts_at,a.id`, [start,end,now])).rows;
    const result = courts.map(c => ({ id:c.id as string,name:c.name as string,active:c.active as boolean,intervals:rows.filter(r=>r.court_id===c.id).map(r=>({id:r.id as string,startsAt:(r.starts_at as Date).toISOString(),endsAt:(r.ends_at as Date).toISOString(),state:r.state as string,kind:r.block_id ? r.kind as "maintenance"|"private"|"open_play" : "booking",bookingId:r.booking_id as string|null,guestName:r.block_id ? null : r.guest_name as string|null,blockId:r.block_id as string|null,reason:r.block_id ? r.reason as string : null, ...(r.slot_count > 0 ? { slotCount: r.slot_count as number } : {})})) }));
    committing=true; await client.query("COMMIT"); return {date,serverNow:now.toISOString(),window:{startsAt:start.toISOString(),endsAt:end.toISOString()},courts:result};
  } catch(e) { if(committing) discard=true; else if(transaction) try { await client.query("ROLLBACK"); } catch { discard=true; } serviceError(e); }
  finally { client.release(discard); }
}
export async function listUpcomingBlocks(pool: Pick<Pool,"connect">, verify: StaffVerifier) {
  const actor=await actorId(verify),client=await pool.connect();
  let transaction=false, committing=false, discard=false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); transaction=true;
    if(!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'",[actor])).rows.length) throw new Error("FORBIDDEN");
    const rows=(await client.query(`SELECT b.id::text,c.name AS court_name,b.starts_at,b.ends_at,b.kind,b.reason FROM ethn.court_blocks b JOIN ethn.courts c ON c.id=b.court_id WHERE b.removed_at IS NULL AND b.ends_at > transaction_timestamp() ORDER BY b.starts_at,b.id LIMIT 50`)).rows;
    committing=true; await client.query("COMMIT");
    return rows.map(r=>({id:r.id as string,courtName:r.court_name as string,startsAt:(r.starts_at as Date).toISOString(),endsAt:(r.ends_at as Date).toISOString(),kind:r.kind as string,reason:r.reason as string}));
  } catch(e) { if(committing) discard=true; else if(transaction) try { await client.query("ROLLBACK"); } catch { discard=true; } serviceError(e); }
  finally { client.release(discard); }
}
export async function createEthnBlock(pool: Pick<Pool,"connect">,verify:StaffVerifier,body:unknown) {
  const input=validInput(body);
  return (await createBlocks(pool,verify,{...input,courtIds:[input.courtId]}))[0];
}
export async function createEthnBlocks(pool: Pick<Pool,"connect">,verify:StaffVerifier,body:unknown) {
  if(!exact(body,["courtIds","startsAt","endsAt","reason","kind"])) throw new Error("INVALID_INPUT");
  const {courtIds,...fields}=body as Record<string,unknown>;
  if(!Array.isArray(courtIds)||!courtIds.length||courtIds.length>100||!courtIds.every(id)||new Set(courtIds).size!==courtIds.length) throw new Error("INVALID_INPUT");
  const input=validInput({...fields,courtId:courtIds[0]});
  return {blocks:await createBlocks(pool,verify,{...input,courtIds})};
}
async function createBlocks(pool: Pick<Pool,"connect">,verify:StaffVerifier,input:ReturnType<typeof validInput>&{courtIds:string[]}) {
  const actor=await actorId(verify),client=await pool.connect(); let transaction=false, committing=false, discard=false;
  try {
    await client.query("BEGIN"); transaction=true;
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor])).rows.length) throw new Error("FORBIDDEN");
    const settings=(await client.query("SELECT anchor_minutes,horizon_days,clock_timestamp() AS now FROM ethn.settings WHERE singleton FOR UPDATE")).rows[0]; if(!settings) throw new Error("CALENDAR_UNAVAILABLE");
    await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const courts=await client.query("SELECT active FROM ethn.courts WHERE id=ANY($1::bigint[])",[input.courtIds]); if(courts.rows.length!==input.courtIds.length||courts.rows.some(c=>!c.active)) throw new Error("COURT_NOT_FOUND");
    const candidates=(await client.query("SELECT DISTINCT bi.booking_id FROM ethn.court_allocations a JOIN ethn.booking_items bi ON bi.id=a.item_id JOIN ethn.bookings x ON x.id=bi.booking_id WHERE a.court_id=ANY($1::bigint[]) AND a.state='held' AND a.starts_at<$3 AND a.ends_at>$2 AND x.status='held' ORDER BY bi.booking_id",[input.courtIds,input.start,input.end])).rows.map(r=>r.booking_id);
    await client.query("SELECT id FROM ethn.bookings WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[candidates]);
    const now=(await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const today=manilaDateStr(new Date(now.getTime()-settings.anchor_minutes*60000)), startDate=manilaDateStr(new Date(input.start.getTime()-settings.anchor_minutes*60000)), boundary=new Date(manilaWallClock(today).getTime()+settings.anchor_minutes*60000+settings.horizon_days*86400000);
    if(input.start<=now || startDate<today || input.start>=boundary || input.end>boundary) throw new Error("INVALID_INPUT");
    const stale=(await client.query("SELECT id FROM ethn.bookings WHERE id=ANY($1::uuid[]) AND status='held' AND expires_at<=$2 ORDER BY id",[candidates,now])).rows.map(r=>r.id);
    const expired=(await client.query("UPDATE ethn.bookings SET status='expired' WHERE id=ANY($1::uuid[]) AND status='held' AND expires_at<=$2 RETURNING id",[stale,now])).rows.map(r=>r.id);
    await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id=ANY($1::uuid[])) AND state='held'",[expired]);
    if((await client.query("SELECT 1 FROM ethn.court_allocations WHERE court_id=ANY($1::bigint[]) AND state IN ('held','pending','confirmed','completed') AND starts_at<$3 AND ends_at>$2",[input.courtIds,input.start,input.end])).rows.length) throw new Error("SLOT_TAKEN");
    const blocks=[];
    for(const courtId of input.courtIds) {
      const blockId=randomUUID(); await client.query("INSERT INTO ethn.court_blocks(id,court_id,starts_at,ends_at,kind,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[blockId,courtId,input.start,input.end,input.kind,input.reason,actor]);
      await client.query("INSERT INTO ethn.court_allocations(id,item_id,block_id,court_id,starts_at,ends_at,state,expires_at) VALUES($1,NULL,$2,$3,$4,$5,'confirmed',NULL)",[randomUUID(),blockId,courtId,input.start,input.end]);
      await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'calendar.block.create',$2::jsonb)",[actor,JSON.stringify({blockId,courtId,kind:input.kind})]);
      blocks.push({id:blockId,courtId,startsAt:input.start.toISOString(),endsAt:input.end.toISOString(),reason:input.reason,kind:input.kind});
    }
    committing=true; await client.query("COMMIT"); return blocks;
  } catch(e) { if(committing) discard=true; else if(transaction) try { await client.query("ROLLBACK"); } catch { discard=true; } serviceError(e); } finally { client.release(discard); }
}
export async function releaseEthnBlock(pool:Pick<Pool,"connect">,verify:StaffVerifier,blockId:string) {
  if(!uuid.test(blockId)) throw new Error("INVALID_INPUT"); const actor=await actorId(verify),client=await pool.connect(); let transaction=false, committing=false, discard=false;
  try {
    await client.query("BEGIN");transaction=true;
    if(!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor])).rows.length) throw new Error("FORBIDDEN");
    await client.query("SELECT singleton FROM ethn.settings WHERE singleton FOR UPDATE"); await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const target=(await client.query("SELECT kind FROM ethn.court_blocks WHERE id=$1",[blockId])).rows[0];
    if(!target || !['maintenance','private'].includes(target.kind)) throw new Error('BLOCK_NOT_FOUND');
    const released=await client.query("UPDATE ethn.court_blocks SET removed_by=$2,removed_at=clock_timestamp() WHERE id=$1 AND removed_at IS NULL RETURNING id,court_id::text,starts_at,ends_at",[blockId,actor]);
    if(released.rows[0]) { await client.query("UPDATE ethn.court_allocations SET state='released' WHERE block_id=$1 AND state='confirmed'",[blockId]); await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'calendar.block.release',$2::jsonb)",[actor,JSON.stringify({blockId,courtId:released.rows[0].court_id})]); }
    else if(!(await client.query("SELECT 1 FROM ethn.court_blocks WHERE id=$1",[blockId])).rows.length) throw new Error("BLOCK_NOT_FOUND");
    committing=true; await client.query("COMMIT");
  } catch(e) { if(committing) discard=true; else if(transaction) try { await client.query("ROLLBACK"); } catch { discard=true; } serviceError(e); } finally { client.release(discard); }
}
