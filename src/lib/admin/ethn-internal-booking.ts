import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { parsePesos, priceItems } from '../booking/core';
import { resolveSchedule } from '../booking/schedule';
import { expireExtensionHolds } from '../booking/extension-expiry';
import type { StaffVerifier } from './ethn-payments';
const money=(v:bigint)=>`${v/BigInt(100)}.${(v%BigInt(100)).toString().padStart(2,'0')}`;
export function validateInternalBooking(body:unknown) {
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('INVALID_INPUT');
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['courtId','date','start','end','guestName','guestPhone','method','reference','receivedAt','displayedTotal','settingsVersion','paymentReceived','idempotencyKey','collectedAmount'].includes(k)))throw new Error('INVALID_INPUT');
 for(const k of ['courtId','date','start','end','guestName','method','displayedTotal','settingsVersion','idempotencyKey'])if(typeof b[k]!=='string')throw new Error('INVALID_INPUT');
 if(!/^[1-9]\d{0,18}$/.test(b.courtId as string)||!/^[1-9]\d{0,18}$/.test(b.settingsVersion as string)||!/^\d{4}-\d\d-\d\d$/.test(b.date as string)||!b.guestName||String(b.guestName).trim().length>100||!String(b.guestName).trim()||!/^[a-z][a-z0-9_-]{0,63}$/.test(b.method as string)||!/^[\x21-\x7e]{1,200}$/.test(b.idempotencyKey as string)||b.paymentReceived!==true)throw new Error('INVALID_INPUT');
 for(const k of ['start','end']){const d=new Date(b[k] as string);if(!Number.isFinite(d.getTime())||d.toISOString()!==b[k])throw new Error('INVALID_INPUT');}
 if(new Date(b.end as string)<=new Date(b.start as string))throw new Error('INVALID_INPUT');
 if(b.guestPhone!=null&&(typeof b.guestPhone!=='string'||b.guestPhone.length>30||!/^[0-9+()\-\s]*$/.test(b.guestPhone)))throw new Error('INVALID_INPUT');
 if(b.reference!=null&&(typeof b.reference!=='string'||b.reference.trim().length>200))throw new Error('INVALID_INPUT');
 const receivedAt=b.receivedAt?new Date(b.receivedAt as string):null;
 if(receivedAt&&(!Number.isFinite(receivedAt.getTime())||typeof b.receivedAt!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(b.receivedAt)))throw new Error('INVALID_INPUT');
 let displayedTotal:string;try{displayedTotal=money(parsePesos(b.displayedTotal as string));}catch{throw new Error('INVALID_INPUT');}
 return {courtId:b.courtId as string,date:b.date as string,start:b.start as string,end:b.end as string,guestName:(b.guestName as string).trim(),guestPhone:(b.guestPhone as string)?.trim()||null,method:b.method as string,reference:b.method==='cash'?null:(b.reference as string)?.trim()||null,receivedAt:receivedAt?.toISOString()??null,displayedTotal,settingsVersion:b.settingsVersion as string,idempotencyKey:b.idempotencyKey as string};
}
export async function createInternalBooking(pool:Pick<Pool,'connect'>,verify:StaffVerifier,body:unknown){
 const input=validateInternalBooking(body),actor=await verify();if(!actor||!/^[0-9a-f-]{36}$/i.test(actor))throw new Error('UNAUTHENTICATED');
 const {idempotencyKey,...payload}=input,owner=createHash('sha256').update(actor.toLowerCase()).digest('hex'),fingerprint=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 const c=await pool.connect();let discard=false,committing=false;
 try{
  await c.query('BEGIN');
  if(!(await c.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role IN ('owner','staff') FOR UPDATE",[actor])).rowCount)throw new Error('FORBIDDEN');
  const inserted=await c.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'internal.create',$2,$3,NULL) ON CONFLICT DO NOTHING RETURNING key",[owner,idempotencyKey,fingerprint]);
  const prior=(await c.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='internal.create' AND key=$2 FOR UPDATE",[owner,idempotencyKey])).rows[0];
  if(!prior||prior.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_MISMATCH');
  if(!inserted.rowCount){if(!prior.result)throw new Error('IDEMPOTENCY_INCOMPLETE');committing=true;await c.query('COMMIT');return prior.result;}
  const settings=(await c.query('SELECT version::text,interval_minutes,minimum_minutes,anchor_minutes,horizon_days FROM ethn.settings WHERE singleton FOR UPDATE')).rows[0];if(!settings)throw new Error('NOT_CONFIGURED');
  const courts=(await c.query('SELECT id::text,name,active FROM ethn.courts ORDER BY id FOR UPDATE')).rows;
  await expireExtensionHolds(c);
  const expired=(await c.query("UPDATE ethn.bookings SET status='expired' WHERE status='held' AND expires_at<=clock_timestamp() RETURNING id")).rows.map(r=>r.id);
  await c.query("UPDATE ethn.court_allocations SET state='expired' WHERE state='held' AND item_id IN(SELECT id FROM ethn.booking_items WHERE booking_id=ANY($1::uuid[]))",[expired]);
  const hours=(await c.query('SELECT court_id::text,weekday,opens::text,closes::text,hourly_rate::text FROM ethn.court_hours')).rows;
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  if(input.receivedAt&&new Date(input.receivedAt)>now)throw new Error('INVALID_INPUT');
  const method=input.method==='cash'?{name:'Cash',instructions:''}:(await c.query('SELECT name,instructions FROM ethn.payment_methods WHERE id=$1 AND enabled FOR SHARE',[input.method])).rows[0];if(!method)throw new Error('INVALID_INPUT');
  const resolved=resolveSchedule({date:input.date,now,anchorMinutes:settings.anchor_minutes,interval:settings.interval_minutes,minimum:settings.minimum_minutes,horizonDays:settings.horizon_days,courts,hours,requests:[{courtId:input.courtId,start:new Date(input.start),end:new Date(input.end)}]});
  if('error'in resolved)throw new Error(resolved.error);
  const range=resolved.ranges[0],total=money(priceItems([range]));if(total!==input.displayedTotal||settings.version!==input.settingsVersion)throw new Error('PRICE_CHANGED');
  const id=randomUUID(),item=randomUUID(),merchant=JSON.stringify({name:method.name,instructions:method.instructions});
  await c.query("INSERT INTO ethn.bookings(id,owner_hash,walk_in_actor,operating_date,status,expires_at,total,guest_name,guest_phone,price_acknowledged,merchant_snapshot,settings_version) VALUES($1,$2,$3,$4,'confirmed',$5,$6,$7,$8,true,$9,$10)",[id,owner,actor,input.date,now,total,input.guestName,input.guestPhone,merchant,settings.version]);
  await c.query('INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[item,id,input.courtId,input.start,input.end,money(parsePesos(range.rate)),range.minutes,total,settings.interval_minutes,settings.minimum_minutes]);
  await c.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,$3,$4,$5,'confirmed')",[randomUUID(),item,input.courtId,input.start,input.end]);
  await c.query("INSERT INTO ethn.payments(id,booking_id,method,merchant_snapshot,status,accepted_reference,collected_amount,received_at,verified_at,verified_by) VALUES($1,$2,$3,$4,'accepted',$5,$6,$7,$8,$9)",[randomUUID(),id,input.method,merchant,input.reference,total,input.receivedAt,now,actor]);
  await c.query("INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,'internal.create',$3::jsonb)",[id,actor,JSON.stringify({method:input.method,total,paymentReceived:true})]);
  const result={bookingId:id,status:'confirmed',total,method:input.method};
  await c.query("UPDATE ethn.idempotency SET result=$3::jsonb WHERE owner_hash=$1 AND operation='internal.create' AND key=$2",[owner,idempotencyKey,JSON.stringify(result)]);
  committing=true;await c.query('COMMIT');return result;
 }catch(e){if(committing)discard=true;else try{await c.query('ROLLBACK');}catch{discard=true;}if((e as {code?:string})?.code==='23P01')throw new Error('SLOT_TAKEN');throw e;}finally{c.release(discard?new Error('discard transaction'):undefined);}
}
