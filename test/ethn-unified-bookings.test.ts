import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInternalBooking, createInternalBooking } from '../src/lib/admin/ethn-internal-booking';
import { validateBookingAction } from '../src/lib/admin/ethn-booking-actions';
import { methodId } from '../src/lib/admin/ethn-payment-methods';
const input={courtId:'1',date:'2026-12-01',start:'2026-12-01T00:00:00.000Z',end:'2026-12-01T01:00:00.000Z',guestName:' Guest ',method:'metrobank',displayedTotal:'200.00',settingsVersion:'1',paymentReceived:true,idempotencyKey:'create-one'};
test('internal booking needs no hold or reference/time; retains chosen method',()=>{
 const parsed=validateInternalBooking(input);assert.equal(parsed.method,'metrobank');assert.equal(parsed.reference,null);assert.equal(parsed.receivedAt,null);assert.equal(parsed.guestName,'Guest');
 assert.throws(()=>validateInternalBooking({...input,holdId:'hidden-hold'}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,paymentReceived:false}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,method:'Cash<script>'}),/INVALID_INPUT/);
 assert.throws(()=>validateInternalBooking({...input,receivedAt:'wrong'}),/INVALID_INPUT/);
});
test('refund requires reason and external reference; archive rejects deletion flags',()=>{
 assert.deepEqual(validateBookingAction('refund',{key:'r1',reason:' Customer cancelled ',reference:'return-1'}),{key:'r1',reason:'Customer cancelled',reference:'return-1'});
 assert.throws(()=>validateBookingAction('refund',{key:'r1',reason:'Customer cancelled'}),/INVALID_INPUT/);
 assert.throws(()=>validateBookingAction('archive',{key:'a1',hardDelete:true}),/INVALID_INPUT/);
 assert.throws(()=>validateBookingAction('cancel',{key:'c1',reason:' '}),/INVALID_INPUT/);
 assert.equal(methodId.test('metrobank'),true);assert.equal(methodId.test('../secret'),false);
});
test('direct internal creation writes confirmed only in one transaction',async()=>{
 const queries:string[]=[];const client={async query(sql:string){queries.push(sql);
  if(sql.includes('SELECT user_id'))return{rowCount:1,rows:[{user_id:'staff'}]};
  if(sql.startsWith('INSERT INTO ethn.idempotency'))return{rowCount:1,rows:[{key:'create-one'}]};
  if(sql.startsWith('SELECT fingerprint')){const {createHash}=await import('node:crypto');const {idempotencyKey:_,...payload}=validateInternalBooking(input);return{rows:[{fingerprint:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}]};}
  if(sql.startsWith('SELECT version'))return{rows:[{version:'1',interval_minutes:30,minimum_minutes:30,anchor_minutes:420,horizon_days:30}]};
  if(sql.startsWith('SELECT id::text,name'))return{rows:[{id:'1',name:'Court 1',active:true}]};
  if(sql.startsWith('SELECT court_id'))return{rows:[{court_id:'1',weekday:2,opens:'07:00:00',closes:'22:00:00',hourly_rate:'200.00'}]};
  if(sql.includes('clock_timestamp() AS now'))return{rows:[{now:new Date('2026-11-24T00:00:00Z')}]};
  if(sql.startsWith('SELECT name,instructions'))return{rows:[{name:'Metrobank',instructions:'Bank transfer'}]};
  return{rowCount:0,rows:[]};},release(){}};
 const result=await createInternalBooking({connect:async()=>client} as never,async()=>'00000000-0000-4000-8000-000000000001',input);
 assert.equal(result.status,'confirmed');assert.equal(result.method,'metrobank');
 assert.ok(queries.some(q=>q.startsWith('INSERT INTO ethn.bookings')&&q.includes("'confirmed'")));
 assert.ok(!queries.some(q=>q.startsWith('INSERT')&&q.includes("'held'")));
 assert.equal(queries.at(-1),'COMMIT');
});
