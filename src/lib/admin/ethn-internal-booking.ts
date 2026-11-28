import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { parsePesos, priceItems } from '../booking/core';
import { generateTrackingToken } from '../booking/tracking';
import { resolveSchedule } from '../booking/schedule';
import { lockBookingAlertOwners, recordNewBookingAlerts } from '../booking/ethn-booking-alerts';
import type { StaffVerifier } from './ethn-payments';
import { isEthnMailAddress } from '../mail/ethn-address';
const money=(v:bigint)=>`${v/BigInt(100)}.${(v%BigInt(100)).toString().padStart(2,'0')}`;
const hourMs = 3_600_000;
const positiveBigint = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807');

function parseRanges(value: unknown) {
 if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('INVALID_INPUT');
 const ranges = value.map((range: unknown) => {
  if (!range || typeof range !== 'object' || Array.isArray(range)) throw new Error('INVALID_INPUT');
  const {courtId, start, end, ...extra} = range as Record<string, unknown>;
  if (Object.keys(extra).length || !positiveBigint(courtId) || typeof start !== 'string' || typeof end !== 'string') throw new Error('INVALID_INPUT');
  const from = new Date(start), to = new Date(end);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.toISOString() !== start || to.toISOString() !== end || from.getTime() % hourMs || to.getTime() % hourMs || to <= from) throw new Error('INVALID_INPUT');
  return {courtId, start, end};
 }).sort((a,b) => a.courtId.length - b.courtId.length || a.courtId.localeCompare(b.courtId));
 if (new Set(ranges.map(range => range.courtId)).size !== ranges.length) throw new Error('INVALID_INPUT');
 return ranges;
}

export function validateInternalBooking(body:unknown) {
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('INVALID_INPUT');
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['ranges','date','guestName','guestPhone','guestEmail','method','reference','receivedAt','displayedTotal','settingsVersion','paymentReceived','idempotencyKey'].includes(k)))throw new Error('INVALID_INPUT');
 for(const k of ['date','guestName','method','displayedTotal','settingsVersion','idempotencyKey'])if(typeof b[k]!=='string')throw new Error('INVALID_INPUT');
 if(!positiveBigint(b.settingsVersion)||!/^\d{4}-\d\d-\d\d$/.test(b.date as string)||!b.guestName||String(b.guestName).trim().length>100||!String(b.guestName).trim()||!/^[a-z][a-z0-9_-]{0,63}$/.test(b.method as string)||!/^[\x21-\x7e]{1,200}$/.test(b.idempotencyKey as string)||b.paymentReceived!==true)throw new Error('INVALID_INPUT');
 const ranges = parseRanges(b.ranges);
 const guestEmail = typeof b.guestEmail === 'string' ? b.guestEmail.trim() : b.guestEmail;
 if (guestEmail != null && guestEmail !== '' && !isEthnMailAddress(guestEmail)) throw new Error('INVALID_INPUT');
 if(b.guestPhone!=null&&(typeof b.guestPhone!=='string'||b.guestPhone.length>30||!/^[0-9+()\-\s]*$/.test(b.guestPhone)))throw new Error('INVALID_INPUT');
 if(b.method !== 'cash' && (typeof b.reference !== 'string' || !b.reference.trim() || b.reference.trim().length > 200 || b.reference.includes('\0')))throw new Error('INVALID_INPUT');
 const receivedAt=b.receivedAt?new Date(b.receivedAt as string):null;
 if(receivedAt&&(!Number.isFinite(receivedAt.getTime())||typeof b.receivedAt!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(b.receivedAt)))throw new Error('INVALID_INPUT');
 let displayedTotal:string;try{displayedTotal=money(parsePesos(b.displayedTotal as string));}catch{throw new Error('INVALID_INPUT');}
 return {ranges,...(guestEmail ? {guestEmail} : {}),date:b.date as string,guestName:(b.guestName as string).trim(),guestPhone:(b.guestPhone as string)?.trim()||null,method:b.method as string,reference:b.method==='cash'?null:(b.reference as string)?.trim()||null,receivedAt:receivedAt?.toISOString()??null,displayedTotal,settingsVersion:b.settingsVersion as string,idempotencyKey:b.idempotencyKey as string};
}
export async function createInternalBooking(pool:Pick<Pool,'connect'>,verify:StaffVerifier,body:unknown){
 const input=validateInternalBooking(body),actor=await verify();if(!actor||!/^[0-9a-f-]{36}$/i.test(actor))throw new Error('UNAUTHENTICATED');
 const {idempotencyKey,...payload}=input,owner=createHash('sha256').update(actor.toLowerCase()).digest('hex'),fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 const c=await pool.connect();let discard=false,committing=false;
 try{
  await c.query('BEGIN');
  const owners = await lockBookingAlertOwners(c);
  if (!owners.includes(actor.toLowerCase())) throw new Error('FORBIDDEN');
  const inserted=await c.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'internal.create',$2,$3,NULL) ON CONFLICT DO NOTHING RETURNING key",[owner,idempotencyKey,fingerprint]);
  const prior=(await c.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='internal.create' AND key=$2 FOR UPDATE",[owner,idempotencyKey])).rows[0];
  if(!prior||prior.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_MISMATCH');
  if(!inserted.rowCount){if(!prior.result)throw new Error('IDEMPOTENCY_INCOMPLETE');committing=true;await c.query('COMMIT');return prior.result;}
  const settings=(await c.query('SELECT version::text,interval_minutes,minimum_minutes,anchor_minutes,horizon_days FROM ethn.settings WHERE singleton FOR UPDATE')).rows[0];if(!settings)throw new Error('NOT_CONFIGURED');
  const courts=(await c.query('SELECT id::text,name,active FROM ethn.courts ORDER BY id FOR UPDATE')).rows;
  const expired=(await c.query("UPDATE ethn.bookings SET status='expired' WHERE status='held' AND expires_at<=clock_timestamp() RETURNING id")).rows.map(r=>r.id);
  await c.query("UPDATE ethn.court_allocations SET state='expired' WHERE state='held' AND item_id IN(SELECT id FROM ethn.booking_items WHERE booking_id=ANY($1::uuid[]))",[expired]);
  const hours=(await c.query('SELECT court_id::text,weekday,opens::text,closes::text,hourly_rate::text FROM ethn.court_hours')).rows;
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  if(input.receivedAt&&new Date(input.receivedAt)>now)throw new Error('INVALID_INPUT');
  const method=input.method==='cash'?{name:'Cash',instructions:''}:(await c.query('SELECT name,instructions FROM ethn.payment_methods WHERE id=$1 AND enabled FOR SHARE',[input.method])).rows[0];if(!method)throw new Error('INVALID_INPUT');
  const resolved=resolveSchedule({date:input.date,now,anchorMinutes:settings.anchor_minutes,interval:settings.interval_minutes,minimum:settings.minimum_minutes,horizonDays:settings.horizon_days,courts,hours,requests:input.ranges.map(({courtId,start,end})=>({courtId,start:new Date(start),end:new Date(end)}))});
  if('error'in resolved)throw new Error('SCHEDULE_CHANGED');
  let cents: bigint;
  try { cents = priceItems(resolved.ranges); } catch { throw new Error('PRICE_CHANGED'); }
  if (cents <= BigInt(0)) throw new Error('PRICE_CHANGED');
  const total=money(cents);if(total!==input.displayedTotal||settings.version!==input.settingsVersion)throw new Error('PRICE_CHANGED');
  const id=randomUUID(),merchant=JSON.stringify({name:method.name,instructions:method.instructions});
  const trackingToken = input.guestEmail ? generateTrackingToken() : undefined;
   await c.query("INSERT INTO ethn.bookings(id,owner_hash,walk_in_actor,operating_date,status,expires_at,total,guest_name,guest_phone,guest_email,price_acknowledged,merchant_snapshot,settings_version,tracking_hash) VALUES($1,$2,$3,$4,'confirmed',$5,$6,$7,$8,$9,true,$10,$11,$12)",[id,owner,actor,input.date,now,total,input.guestName,input.guestPhone,input.guestEmail??null,merchant,settings.version,trackingToken ? createHash('sha256').update(trackingToken).digest('hex') : null]);
  for (const range of resolved.ranges) {
   const item=randomUUID(),start=range.start.toISOString(),end=range.end.toISOString();
   await c.query('INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[item,id,range.courtId,start,end,money(parsePesos(range.rate)),range.minutes,money(priceItems([range])),settings.interval_minutes,settings.minimum_minutes]);
   await c.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,$3,$4,$5,'confirmed')",[randomUUID(),item,range.courtId,start,end]);
  }
  await c.query("INSERT INTO ethn.payments(id,booking_id,method,merchant_snapshot,status,accepted_reference,collected_amount,received_at,verified_at,verified_by) VALUES($1,$2,$3,$4,'accepted',$5,$6,$7,$8,$9)",[randomUUID(),id,input.method,merchant,input.reference,total,input.receivedAt,now,actor]);
  await c.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'internal.create',$3::jsonb)",[id,actor,JSON.stringify({method:input.method,total,paymentReceived:true})]);
  if (input.guestEmail) await c.query("INSERT INTO ethn.email_outbox (id,booking_id,kind,payload) VALUES ($1,$2,'booking_approved',$3::jsonb)", [randomUUID(),id,JSON.stringify({email:input.guestEmail,total,staff:true,trackingToken})]);
  await recordNewBookingAlerts(c, id, "internal", owners);
  const result={bookingId:id,status:'confirmed',total,method:input.method};
  await c.query("UPDATE ethn.idempotency SET result=$3::jsonb WHERE owner_hash=$1 AND operation='internal.create' AND key=$2",[owner,idempotencyKey,JSON.stringify(result)]);
  committing=true;await c.query('COMMIT');return result;
 }catch(e){if(committing)discard=true;else try{await c.query('ROLLBACK');}catch{discard=true;}if ((e as {code?:string;constraint?:string})?.code === '23505' && ['payments_unique_method_transfer','payments_accepted_reference'].includes((e as {constraint?:string}).constraint ?? '')) throw new Error('REFERENCE_TAKEN');if((e as {code?:string})?.code==='23P01')throw new Error('SLOT_TAKEN');throw e;}finally{c.release(discard?new Error('discard transaction'):undefined);}
}
