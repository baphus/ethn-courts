import { expireExtensionHolds } from '../booking/extension-expiry';
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { manilaDateStr, manilaWallClock } from "../booking/slots";
import { scheduleWindows } from "../booking/schedule";
import type { StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const decimal = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
function serviceError(error: unknown): never {
  if (error instanceof Error && /^(UNAUTHENTICATED|FORBIDDEN|INVALID_INPUT|SLOT_TAKEN|OPEN_PLAY_NOT_FOUND|CLOSED|INVALID_SCHEDULE|STALE_OPEN_PLAY)$/.test(error.message)) throw error;
  if (error && typeof error === "object" && "code" in error && (error as {code:string}).code === "23P01") throw new Error("SLOT_TAKEN");
  throw new Error("OPEN_PLAYS_UNAVAILABLE");
}
async function actorId(verify: StaffVerifier) {
  const actor = await verify();
  if (!actor || !uuid.test(actor)) throw new Error("UNAUTHENTICATED");
  return actor.toLowerCase();
}
function validate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_INPUT");
  const b = value as Record<string, unknown>;
  const keys=Object.keys(b).sort().join(",");
  if (keys !== "courtIds,description,endsAt,fee,startsAt,title" && keys !== "courtIds,description,endsAt,expectedVersion,fee,startsAt,title") throw new Error("INVALID_INPUT");
  if (!Array.isArray(b.courtIds) || !b.courtIds.length || b.courtIds.length > 100 || b.courtIds.some(id => typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) || new Set(b.courtIds).size !== b.courtIds.length) throw new Error("INVALID_INPUT");
  if (typeof b.title !== "string" || !b.title.trim() || b.title.trim().length > 100 || typeof b.description !== "string" || b.description.length > 2000 || typeof b.fee !== "string" || !decimal.test(b.fee) || typeof b.startsAt !== "string" || !iso.test(b.startsAt) || typeof b.endsAt !== "string" || !iso.test(b.endsAt)) throw new Error("INVALID_INPUT");
  const start = new Date(b.startsAt), end = new Date(b.endsAt);
  if (!Number.isFinite(start.getTime()) || start.toISOString() !== b.startsAt || !Number.isFinite(end.getTime()) || end.toISOString() !== b.endsAt || end <= start) throw new Error("INVALID_INPUT");
  return { courtIds: [...b.courtIds] as string[], title: b.title.trim(), description: b.description.trim(), fee: b.fee, start, end };
}

function eventDto(row: { id: string; title: string; description: string; starts_at: Date; ends_at: Date; court_names: string[]; court_ids: string[] }, fee: string | null, version: number) {
  return { id: row.id, title: row.title, description: row.description, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(), fee, courtNames: row.court_names, courtIds: row.court_ids, version };
}

export async function hideBookingOpenPlay(pool: Db, verify: StaffVerifier, id: string, body: unknown) {
  if (!uuid.test(id) || !body || typeof body !== "object" || Object.keys(body).length !== 1 || !("hidden" in body) || typeof body.hidden !== "boolean") throw new Error("INVALID_INPUT");
  const actor = await actorId(verify), client = await pool.connect();
  try {
    const result = (await client.query(`WITH owner_access AS (
      SELECT user_id FROM ethn.staff_access WHERE user_id=$2 AND enabled AND role='owner' FOR UPDATE
    ), changed AS (
      UPDATE ethn.booking_open_plays SET hidden=$3 WHERE id=$1 AND EXISTS (SELECT 1 FROM owner_access) RETURNING id
    ), logged AS (
      INSERT INTO ethn.audit(actor,action,detail)
      SELECT $2,'open_play.moderate',jsonb_build_object('openPlayId',id,'hidden',$3::boolean) FROM changed
    ) SELECT EXISTS (SELECT 1 FROM owner_access) AS allowed, EXISTS (SELECT 1 FROM changed) AS found`, [id, actor, body.hidden])).rows[0];
    if (!result.allowed) throw new Error("FORBIDDEN");
    if (!result.found) throw new Error("OPEN_PLAY_NOT_FOUND");
    return { ok: true };
  } catch (error) { serviceError(error); } finally { client.release(); }
}

export async function listPublicOpenPlays(pool: Db, includeHidden = false): Promise<(ReturnType<typeof eventDto> & { eventUrl?: string; hidden?: boolean })[]> {
  const client = await pool.connect();
  try {
    const rows = (await client.query(`SELECT p.id::text,p.title,p.description,p.starts_at,p.ends_at,p.informational_fee::text,p.version,
      array_agg(c.name ORDER BY c.id) AS court_names, array_agg(c.id::text ORDER BY c.id) AS court_ids
      FROM ethn.open_plays p JOIN ethn.court_blocks b ON b.open_play_id=p.id AND b.removed_at IS NULL
      JOIN ethn.court_allocations a ON a.block_id=b.id AND a.state='confirmed'
      JOIN ethn.courts c ON c.id=b.court_id
      WHERE p.removed_at IS NULL
      GROUP BY p.id ORDER BY p.starts_at,p.id LIMIT 100`)).rows;
    const customerRows = (await client.query(`SELECT p.id::text,p.title,p.description,p.event_url,p.hidden,s.starts_at,s.ends_at,s.court_names,s.court_ids
      FROM ethn.booking_open_plays p JOIN ethn.bookings b ON b.id=p.booking_id
      JOIN ethn.booking_open_play_sessions s ON s.booking_id=p.booking_id
      WHERE NOT p.removed AND b.status='confirmed' AND s.ends_at > clock_timestamp() AND ($1 OR NOT p.hidden)
      ORDER BY s.starts_at,p.booking_id LIMIT 100`, [includeHidden])).rows;
    const venueEvents = rows.map(row => eventDto(row, row.informational_fee, row.version));
    const customerEvents = customerRows.map(row => ({ ...eventDto(row, null, 1), eventUrl: row.event_url as string, ...(includeHidden ? { hidden: row.hidden as boolean } : {}) }));
    return [...venueEvents, ...customerEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  } catch (error) { serviceError(error); } finally { client.release(); }
}

async function allocateOpenPlay(client: PoolClient, playId: string, actor: string, input: ReturnType<typeof validate>) {
  for (const courtId of input.courtIds) {
    const blockId=randomUUID();
    await client.query("INSERT INTO ethn.court_blocks(id,court_id,starts_at,ends_at,kind,reason,created_by,open_play_id) VALUES($1,$2,$3,$4,'open_play',$5,$6,$7)", [blockId,courtId,input.start,input.end,input.title,actor,playId]);
    await client.query("INSERT INTO ethn.court_allocations(id,item_id,block_id,court_id,starts_at,ends_at,state,expires_at) VALUES($1,NULL,$2,$3,$4,$5,'confirmed',NULL)", [randomUUID(),blockId,courtId,input.start,input.end]);
  }
}

async function validateAllocation(client: PoolClient, input: ReturnType<typeof validate>, settings: {anchor_minutes:number;horizon_days:number}, allCourts: Array<{id:string;active:boolean}>, ignorePlayId?:string) {
  await expireExtensionHolds(client);
  const selected=allCourts.filter(c=>input.courtIds.includes(c.id));
  if(selected.length!==input.courtIds.length||selected.some(c=>!c.active)) throw new Error("INVALID_INPUT");
  const hours=(await client.query("SELECT court_id::text,weekday,opens::text,closes::text,hourly_rate::text FROM ethn.court_hours WHERE court_id=ANY($1::bigint[])",[input.courtIds])).rows;
  const eventDate=manilaDateStr(new Date(input.start.getTime()-settings.anchor_minutes*60000));
  for(const courtId of input.courtIds){const windows=scheduleWindows(eventDate,settings.anchor_minutes,courtId,hours);if("error" in windows)throw new Error(windows.error);if(!windows.windows.some(w=>input.start.getTime()>=w.opens&&input.end.getTime()<=w.closes))throw new Error("CLOSED");}
  const now=(await client.query("SELECT clock_timestamp() now")).rows[0].now as Date;
  const today=manilaDateStr(new Date(now.getTime()-settings.anchor_minutes*60000));
  const horizon=new Date(manilaWallClock(today).getTime()+settings.anchor_minutes*60000+settings.horizon_days*86400000);
  if(input.start<=now||eventDate<today||input.start>=horizon||input.end>horizon)throw new Error("INVALID_INPUT");
  const candidates=(await client.query(`SELECT DISTINCT b.id FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id
    WHERE b.status='held' AND a.state='held' AND a.court_id=ANY($1::bigint[]) AND tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)') ORDER BY b.id`,[input.courtIds,input.start,input.end])).rows.map(r=>r.id);
  const locked=candidates.length?(await client.query("SELECT id FROM ethn.bookings WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[candidates])).rows.map(r=>r.id):[];
  const lockedNow=(await client.query("SELECT clock_timestamp() now")).rows[0].now as Date;
  const currentDate=manilaDateStr(new Date(lockedNow.getTime()-settings.anchor_minutes*60000));
  const currentHorizon=new Date(manilaWallClock(currentDate).getTime()+settings.anchor_minutes*60000+settings.horizon_days*86400000);
  if(input.start<=lockedNow||input.start>=currentHorizon||input.end>currentHorizon)throw new Error("INVALID_INPUT");
  const expired=locked.length?(await client.query("UPDATE ethn.bookings SET status='expired' WHERE id=ANY($1::uuid[]) AND status='held' AND expires_at<=$2 RETURNING id",[locked,lockedNow])).rows.map(r=>r.id):[];
  if(expired.length)await client.query("UPDATE ethn.court_allocations SET state='expired' WHERE state='held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id=ANY($1::uuid[]))",[expired]);
  const conflicts=(await client.query(`SELECT 1 FROM ethn.court_allocations a LEFT JOIN ethn.court_blocks b ON b.id=a.block_id
    WHERE a.court_id=ANY($1::bigint[]) AND a.state IN ('held','pending','confirmed','completed') AND a.starts_at<$3 AND a.ends_at>$2
    AND ($4::uuid IS NULL OR b.open_play_id IS DISTINCT FROM $4) LIMIT 1`,[input.courtIds,input.start,input.end,ignorePlayId??null])).rows;
  if(conflicts.length)throw new Error("SLOT_TAKEN");
}

export async function createOpenPlay(pool: Db, verify: StaffVerifier, body: unknown) {
  const input = validate(body), actor = await actorId(verify), client = await pool.connect(); let committing=false,discard=false;
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const settings = (await client.query("SELECT anchor_minutes,horizon_days FROM ethn.settings WHERE singleton FOR UPDATE")).rows[0];
    if (!settings) throw new Error("OPEN_PLAYS_UNAVAILABLE");
    const courts = (await client.query("SELECT id::text,name,active FROM ethn.courts ORDER BY id FOR UPDATE")).rows;
    await validateAllocation(client,input,settings,courts);
    const playId = randomUUID();
    await client.query("INSERT INTO ethn.open_plays(id,title,description,starts_at,ends_at,informational_fee,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [playId,input.title,input.description,input.start,input.end,input.fee,actor]);
    await allocateOpenPlay(client,playId,actor,input);
    await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'open_play.create',$2::jsonb)", [actor,JSON.stringify({openPlayId:playId,courtIds:input.courtIds})]);
    committing=true; await client.query("COMMIT"); return {id:playId,title:input.title,description:input.description,startsAt:input.start.toISOString(),endsAt:input.end.toISOString(),fee:input.fee,courtIds:input.courtIds,version:1};
  } catch(error) { if(committing) discard=true; else try { await client.query("ROLLBACK"); } catch { discard=true; } serviceError(error); } finally { client.release(discard); }
}

export async function editOpenPlay(pool: Db, verify: StaffVerifier, playId: string, body: unknown) {
  if(!uuid.test(playId))throw new Error("INVALID_INPUT");
  if(!body||typeof body!=="object"||Array.isArray(body)||!Number.isSafeInteger((body as Record<string,unknown>).expectedVersion))throw new Error("INVALID_INPUT");
  const {expectedVersion,...inputBody}=body as Record<string,unknown>;
  const input=validate(inputBody),actor=await actorId(verify),client=await pool.connect();let committing=false,discard=false;
  try{
    await client.query("BEGIN");
    if(!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor])).rows.length)throw new Error("FORBIDDEN");
    const settings=(await client.query("SELECT anchor_minutes,horizon_days FROM ethn.settings WHERE singleton FOR UPDATE")).rows[0];if(!settings)throw new Error("OPEN_PLAYS_UNAVAILABLE");
    const courts=(await client.query("SELECT id::text,name,active FROM ethn.courts ORDER BY id FOR UPDATE")).rows;
    const event=(await client.query("SELECT version FROM ethn.open_plays WHERE id=$1 AND removed_at IS NULL FOR UPDATE",[playId])).rows[0];
    if(!event)throw new Error("OPEN_PLAY_NOT_FOUND");
    if(expectedVersion!==event.version)throw new Error("STALE_OPEN_PLAY");
    await validateAllocation(client,input,settings,courts,playId);
    await client.query("UPDATE ethn.court_blocks SET removed_by=$2,removed_at=clock_timestamp() WHERE open_play_id=$1 AND removed_at IS NULL",[playId,actor]);
    await client.query("UPDATE ethn.court_allocations SET state='released' WHERE block_id IN (SELECT id FROM ethn.court_blocks WHERE open_play_id=$1) AND state='confirmed'",[playId]);
    await client.query("UPDATE ethn.open_plays SET title=$2,description=$3,starts_at=$4,ends_at=$5,informational_fee=$6,version=version+1 WHERE id=$1",[playId,input.title,input.description,input.start,input.end,input.fee]);
    await allocateOpenPlay(client,playId,actor,input);
    await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'open_play.edit',$2::jsonb)",[actor,JSON.stringify({openPlayId:playId,version:event.version+1,courtIds:input.courtIds})]);
    committing=true;await client.query("COMMIT");return {id:playId,title:input.title,description:input.description,startsAt:input.start.toISOString(),endsAt:input.end.toISOString(),fee:input.fee,courtIds:input.courtIds,version:event.version+1};
  }catch(error){if(committing)discard=true;else try{await client.query("ROLLBACK");}catch{discard=true;}serviceError(error);}finally{client.release(discard);}
}

export async function removeOpenPlay(pool: Db, verify: StaffVerifier, playId: string) {
  if (!uuid.test(playId)) throw new Error("INVALID_INPUT"); const actor=await actorId(verify),client=await pool.connect();let committing=false,discard=false;
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    await client.query("SELECT singleton FROM ethn.settings WHERE singleton FOR UPDATE"); await client.query("SELECT id FROM ethn.courts ORDER BY id FOR UPDATE");
    const removed=await client.query("UPDATE ethn.open_plays SET removed_by=$2,removed_at=clock_timestamp() WHERE id=$1 AND removed_at IS NULL RETURNING id", [playId,actor]);
    if (!removed.rows.length) { if (!(await client.query("SELECT 1 FROM ethn.open_plays WHERE id=$1", [playId])).rows.length) throw new Error("OPEN_PLAY_NOT_FOUND"); }
    else {
      await client.query("UPDATE ethn.court_blocks SET removed_by=$2,removed_at=clock_timestamp() WHERE open_play_id=$1 AND removed_at IS NULL", [playId,actor]);
      await client.query("UPDATE ethn.court_allocations SET state='released' WHERE block_id IN (SELECT id FROM ethn.court_blocks WHERE open_play_id=$1) AND state='confirmed'", [playId]);
      await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'open_play.remove',$2::jsonb)", [actor,JSON.stringify({openPlayId:playId})]);
    }
    committing=true; await client.query("COMMIT");
  } catch(error) { if(committing) discard=true; else try { await client.query("ROLLBACK"); } catch { discard=true; } serviceError(error); } finally { client.release(discard); }
}
