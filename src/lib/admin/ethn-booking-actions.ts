import { createHash, randomUUID } from 'node:crypto';
import { isEthnMailAddress } from '../mail/ethn-address';
import type { Pool } from 'pg';
import type { StaffVerifier } from './ethn-payments';
import { lockBookingAlertOwners, recordBookingAlert } from '../booking/ethn-booking-alerts';
export type BookingAction='cancel'|'refund'|'delete';
export function validateBookingAction(action:BookingAction,body:unknown){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('INVALID_INPUT');const b=body as Record<string,unknown>;
 const fields=action==='refund'?['key','reason','reference','amount']:['key','reason'];
 if(Object.keys(b).some(k=>!fields.includes(k))||typeof b.key!=='string'||! /^[\x21-\x7e]{1,200}$/.test(b.key))throw new Error('INVALID_INPUT');
 if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.trim().length>500)throw new Error('INVALID_INPUT');
 if(action==='refund'&&Object.hasOwn(b,'reference')&&(typeof b.reference!=='string'||!b.reference.trim()||b.reference.trim().length>200))throw new Error('INVALID_INPUT');
 let amount: string | undefined;
 if(Object.hasOwn(b,'amount')){
  if(typeof b.amount!=='string'||!/^\d{1,10}(?:\.\d{1,2})?$/.test(b.amount))throw new Error('INVALID_INPUT');
  const [whole, fraction='']=b.amount.split('.');
  amount=`${BigInt(whole)}.${fraction.padEnd(2,'0')}`;
 }
 return {key:b.key,reason:b.reason.trim(),reference:typeof b.reference==='string'?b.reference.trim():null,...(amount!==undefined&&{amount})};
}
export async function bookingAction(pool:Pick<Pool,'connect'>,verify:StaffVerifier,id:string,action:BookingAction,body:unknown){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('INVALID_INPUT');
 const input=validateBookingAction(action,body),actor=await verify();if(!actor||!/^[0-9a-f-]{36}$/i.test(actor))throw new Error('UNAUTHENTICATED');
 const fingerprint=createHash('sha256').update(JSON.stringify({id,action,reason:input.reason,reference:input.reference,amount:input.amount})).digest('hex');
 const c=await pool.connect();let discard=false,committing=false;
 try{
  await c.query('BEGIN');
  const owners = await lockBookingAlertOwners(c);
  if (!owners.includes(actor.toLowerCase())) throw new Error('FORBIDDEN');
  const operation=`booking.${action}`;
  const inserted=await c.query('INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,$2,$3,$4,NULL) ON CONFLICT DO NOTHING RETURNING key',[actor,operation,input.key,fingerprint]);
  const prior=(await c.query('SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation=$2 AND key=$3 FOR UPDATE',[actor,operation,input.key])).rows[0];
  if(!prior||prior.fingerprint!==fingerprint)throw new Error('IDEMPOTENCY_MISMATCH');
  if(!inserted.rowCount){if(!prior.result)throw new Error('IDEMPOTENCY_INCOMPLETE');committing=true;await c.query('COMMIT');return prior.result;}
  if (action === 'delete') {
   const { rows: [deleted] } = await c.query<{ pending: boolean }>('SELECT ethn.permanently_delete_booking($1,$2,$3) AS pending', [id, actor, input.reason]);
   const result = { bookingId: id.toLowerCase(), status: 'deleted', proofCleanupPending: deleted.pending };
   await c.query('UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation=$2 AND key=$3', [actor, operation, input.key, JSON.stringify(result)]);
   committing = true;
   await c.query('COMMIT');
   return result;
  }
  await c.query('SELECT id FROM ethn.courts ORDER BY id FOR UPDATE');
  const b=(await c.query('SELECT id,status,total::text,guest_email,tracking_code,tracking_hash FROM ethn.bookings WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!b)throw new Error('BOOKING_NOT_FOUND');
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  if(b.status!=='confirmed')throw new Error('ACTION_CONFLICT');
  // Cancellation/refund of extension-bearing bookings requires a separate financial policy.
  if((await c.query("SELECT id FROM ethn.extensions WHERE booking_id=$1 AND status IN ('held','pending','confirmed') LIMIT 1",[id])).rowCount)throw new Error('ACTION_CONFLICT');
  const slots=(await c.query('SELECT min(starts_at) AS first_start FROM ethn.booking_items WHERE booking_id=$1',[id])).rows[0];
  if(!slots.first_start||slots.first_start<=now)throw new Error('ACTION_CONFLICT');
  let refundedAmount: string | undefined;
  if(action==='refund'){
   const payments=(await c.query("SELECT id,method,collected_amount::text FROM ethn.payments WHERE booking_id=$1 AND status='accepted' ORDER BY id FOR UPDATE",[id])).rows;
   if(payments.length!==1||payments[0].collected_amount!==b.total)throw new Error('ACTION_CONFLICT');const p=payments[0];
   const amount=input.amount??p.collected_amount;
   if(BigInt(amount.replace('.',''))>BigInt(p.collected_amount.replace('.','')))throw new Error('INVALID_INPUT');
   if(amount!=='0.00') refundedAmount=amount;
   if(refundedAmount) await c.query('INSERT INTO ethn.booking_refunds(booking_id,payment_id,amount,method,reason,reference,recorded_at,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,p.id,refundedAmount,p.method,input.reason,input.reference??'Not provided',now,actor]);
  }
  const status=refundedAmount?'refunded':'cancelled';
  await c.query('UPDATE ethn.bookings SET status=$2 WHERE id=$1',[id,status]);
  await c.query("UPDATE ethn.court_allocations SET state=$2 WHERE state='confirmed' AND starts_at>$3 AND item_id IN(SELECT id FROM ethn.booking_items WHERE booking_id=$1)",[id,status,now]);
  await recordBookingAlert(c, id, refundedAmount ? 'refund_recorded' : 'booking_cancelled', owners);
  if (isEthnMailAddress(b.guest_email)) {
   let trackingToken: string | undefined;
   if (b.tracking_hash) {
    const submission = (await c.query("SELECT payload FROM ethn.email_outbox WHERE booking_id=$1 AND kind IN ('booking_submission','open_play_submitted','booking_approved') AND payload ? 'trackingToken' ORDER BY id LIMIT 1",[id])).rows[0];
    const token = submission?.payload?.trackingToken;
    if (typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) && createHash('sha256').update(token).digest('hex') === b.tracking_hash) trackingToken = token;
   }
   const payload = {email:b.guest_email,total:refundedAmount??b.total,...(b.tracking_code ? {code:b.tracking_code} : {staff:true}),trackingToken};
   await c.query('INSERT INTO ethn.email_outbox (id,booking_id,kind,payload) VALUES ($1,$2,$3,$4::jsonb)',[randomUUID(),id,`booking_${status}`,JSON.stringify(payload)]);
  }
  await c.query('INSERT INTO ethn.audit(booking_id,actor,action,detail) VALUES($1,$2,$3,$4::jsonb)',[id,actor,`booking.${action}`,JSON.stringify({reason:input.reason,reference:input.reference,amount:refundedAmount??input.amount})]);
  const result={bookingId:id,status,archived:false};
  await c.query('UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation=$2 AND key=$3',[actor,operation,input.key,JSON.stringify(result)]);
  committing=true;await c.query('COMMIT');return result;
 }catch(e){if(committing)discard=true;else try{await c.query('ROLLBACK');}catch{discard=true;}throw e;}finally{c.release(discard?new Error('discard transaction'):undefined);}
}
