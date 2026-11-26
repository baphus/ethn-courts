import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateInternalBooking, createInternalBooking } from '../src/lib/admin/ethn-internal-booking';
import { bookingAction, validateBookingAction } from '../src/lib/admin/ethn-booking-actions';
import { methodId } from '../src/lib/admin/ethn-payment-methods';
const first={courtId:'1',start:'2026-12-01T00:00:00.000Z',end:'2026-12-01T01:00:00.000Z'};
const second={...first,courtId:'2',end:'2026-12-01T02:00:00.000Z'};
const input={ranges:[first,second],date:'2026-12-01',guestName:' Guest ',method:'metrobank',reference:'desk-ref',displayedTotal:'500.00',settingsVersion:'1',paymentReceived:true,idempotencyKey:'create-one'};
test('internal booking needs no hold or reference/time; retains chosen method',()=>{
 const parsed=validateInternalBooking(input);assert.equal(parsed.method,'metrobank');assert.equal(parsed.reference,'desk-ref');assert.equal(parsed.receivedAt,null);assert.equal(parsed.guestName,'Guest');
 assert.deepEqual(validateInternalBooking({...input,guestEmail:null}),parsed);
 assert.equal(validateInternalBooking({...input,guestEmail:' guest@example.test '}).guestEmail,'guest@example.test');
 for(const guestEmail of ['guest', 'one,two@example.test','guest@example.test\r\nBCC:x@y.test',123]) assert.throws(()=>validateInternalBooking({...input,guestEmail}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,holdId:'hidden-hold'}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,paymentReceived:false}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,method:'Cash<script>'}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,receivedAt:'wrong'}),/INVALID_INPUT/);
});
test('range validation normalizes court order and rejects gaps represented by duplicate courts, partial hours and mixed payloads',()=>{
 assert.deepEqual(validateInternalBooking({...input,ranges:[second,first]}).ranges,[first,second]);
 for(const ranges of [[],[first,first],[{...first,start:'2026-12-01T00:30:00.000Z'}],[{...first,courtId:'9223372036854775808'}]]) assert.throws(()=>validateInternalBooking({...input,ranges}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,...first}),/INVALID_INPUT/);
});
test('refund requires reason and external reference; archive rejects deletion flags',()=>{
 assert.deepEqual(validateBookingAction('refund',{key:'r1',reason:' Customer cancelled ',reference:'return-1'}),{key:'r1',reason:'Customer cancelled',reference:'return-1'});
 assert.throws(()=>validateBookingAction('refund',{key:'r1',reason:'Customer cancelled'}),/INVALID_INPUT/);
 assert.throws(()=>validateBookingAction('archive',{key:'a1',hardDelete:true}),/INVALID_INPUT/);
 assert.throws(()=>validateBookingAction('cancel',{key:'c1',reason:' '}),/INVALID_INPUT/);
 assert.equal(methodId.test('metrobank'),true);assert.equal(methodId.test('../secret'),false);
});
test('direct internal creation writes every court and one payment, or rolls back a later conflict',async()=>{
 const queries:string[]=[];let failSecond=false,allocations=0;
 const request={...input,guestEmail:'guest@example.test'};
 const client={async query(sql:string,args?:unknown[]){queries.push(sql);
  if(sql.startsWith('INSERT INTO ethn.email_outbox')) assert.deepEqual(JSON.parse(String(args?.[2])),{email:request.guestEmail,total:'500.00',staff:true});
  if(sql.startsWith('INSERT INTO ethn.court_allocations') && ++allocations === 2 && failSecond) throw Object.assign(new Error('overlap'),{code:'23P01'});
  if(sql.includes('SELECT user_id'))return{rowCount:1,rows:[{user_id:'00000000-0000-4000-8000-000000000001'}]};
  if(sql.startsWith('INSERT INTO ethn.idempotency'))return{rowCount:1,rows:[{key:'create-one'}]};
  if(sql.startsWith('SELECT fingerprint')){const {idempotencyKey:_,...payload}=validateInternalBooking(request);return{rows:[{fingerprint:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}]};}
  if(sql.startsWith('SELECT version'))return{rows:[{version:'1',interval_minutes:30,minimum_minutes:30,anchor_minutes:420,horizon_days:30}]};
  if(sql.startsWith('SELECT id::text,name'))return{rows:[{id:'1',name:'Court 1',active:true},{id:'2',name:'Court 2',active:true}]};
  if(sql.startsWith('SELECT court_id'))return{rows:[{court_id:'1',weekday:2,opens:'07:00:00',closes:'22:00:00',hourly_rate:'200.00'},{court_id:'2',weekday:2,opens:'07:00:00',closes:'22:00:00',hourly_rate:'150.00'}]};
  if(sql.includes('clock_timestamp() AS now'))return{rows:[{now:new Date('2026-11-24T00:00:00Z')}]};
  if(sql.startsWith('SELECT name,instructions'))return{rows:[{name:'Metrobank',instructions:'Bank transfer'}]};
  return{rowCount:0,rows:[]};},release(){}};
 const result=await createInternalBooking({connect:async()=>client} as never,async()=>'00000000-0000-4000-8000-000000000001',request);
 assert.equal(result.status,'confirmed');assert.equal(result.method,'metrobank');
 assert.ok(queries.some(q=>q.startsWith('INSERT INTO ethn.bookings')&&q.includes("'confirmed'")));
 assert.ok(!queries.some(q=>q.startsWith('INSERT')&&q.includes("'held'")));
 assert.equal(result.total,'500.00');
 assert.equal(allocations,2);
 assert.equal(queries.filter(q=>q.startsWith('INSERT INTO ethn.payments')).length,1);
 assert.equal(queries.filter(q=>q.startsWith('INSERT INTO ethn.email_outbox')).length,1);
 assert.equal(queries.filter(q=>q.includes('INSERT INTO ethn.notifications') && q.includes("'booking_owner_alert'")).length,1);
  assert.equal(queries.at(-1),'COMMIT');
 failSecond=true;allocations=0;queries.length=0;
 await assert.rejects(createInternalBooking({connect:async()=>client} as never,async()=>'00000000-0000-4000-8000-000000000001',request),/SLOT_TAKEN/);
 assert.ok(!queries.some(q=>q.startsWith('INSERT INTO ethn.payments') || q.includes('INSERT INTO ethn.email_outbox')));
 assert.equal(queries.at(-1),'ROLLBACK');
});

test('booking actions queue one customer notice with no staff notes or refund reference',async()=>{
 const id='00000000-0000-4000-8000-000000000002',actor='00000000-0000-4000-8000-000000000001';
 const email='guest@example.test',trackingToken='a'.repeat(64),total='500.00';
 for(const scenario of [{action:'cancel',email,token:null},{action:'cancel',email:null,token:null},{action:'refund',email,token:trackingToken},{action:'refund',email,token:'b'.repeat(64)}] as const){
  const input={key:'test',reason:'Private note',...(scenario.action==='refund'?{reference:'Private reference'}:{})};
  const fingerprint=createHash('sha256').update(JSON.stringify({id,action:scenario.action,reason:input.reason,reference:input.reference??null})).digest('hex');
  const sent:unknown[]=[], alerts:unknown[]=[];let result:unknown;
  const client={async query(sql:string,args?:unknown[]){
   if(sql.startsWith('SELECT user_id'))return{rows:[{user_id:actor}]};
   if(sql.includes('INSERT INTO ethn.notifications'))alerts.push(args?.[4]);
   if(sql.startsWith('INSERT INTO ethn.idempotency'))return{rowCount:result?0:1};
   if(sql.startsWith('SELECT fingerprint'))return{rows:[{fingerprint,result}]};
   if(sql.includes('FROM ethn.bookings WHERE id='))return{rows:[{status:'confirmed',walk_in_actor:scenario.action==='cancel'?actor:null,total,guest_email:scenario.email,tracking_code:scenario.token?'ABCDE':null,tracking_hash:createHash('sha256').update(trackingToken).digest('hex')}]};
   if(sql.includes('clock_timestamp() AS now'))return{rows:[{now:new Date('2026-11-24T00:00:00Z')}]};
   if(sql.includes('min(starts_at)'))return{rows:[{first_start:new Date('2026-12-01T00:00:00Z')}]};
   if(sql.includes('FROM ethn.payments'))return{rows:[{id,method:'cash',collected_amount:total}]};
   if(sql.startsWith('SELECT payload'))return{rows:[{payload:{trackingToken:scenario.token}}]};
   if(sql.startsWith('INSERT INTO ethn.email_outbox'))sent.push([args?.[2],JSON.parse(String(args?.[3]))]);
   if(sql.startsWith('UPDATE ethn.idempotency'))result=JSON.parse(String(args?.[3]));
   return{rowCount:0,rows:[]};
  },release(){}};
  const pool={connect:async()=>client} as never;
  const first=await bookingAction(pool,async()=>actor,id,scenario.action,input);
  assert.deepEqual(await bookingAction(pool,async()=>actor,id,scenario.action,input),first);
  const tracking=scenario.token?{code:'ABCDE',...(scenario.token===trackingToken?{trackingToken}:{})}:{staff:true};
  assert.deepEqual(sent,scenario.email?[[`booking_${first.status}`,{email,total,...tracking}]]:[]);
  assert.deepEqual(alerts, [scenario.action === 'refund' ? 'refund_recorded' : 'booking_cancelled']);
 }
});
