import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { bookingAction } from '../src/lib/admin/ethn-booking-actions';
import { searchEthnBookings } from '../src/lib/admin/ethn-booking-read';
import { createInternalBooking } from '../src/lib/admin/ethn-internal-booking';
import { savePaymentMethod } from '../src/lib/admin/ethn-payment-methods';
import { decidePayment } from '../src/lib/admin/ethn-payment-decision';
import { listInbox } from '../src/lib/admin/ethn-notifications';
import { createCheckout } from '../src/lib/booking/checkout';
import { reserveProof } from '../src/lib/booking/proof-reservation';
import { submitBooking } from '../src/lib/booking/submission';
import { cleanDeletedBookingProofs } from '../src/lib/booking/deleted-proof-cleanup';

const url = process.env.ETHN_UNIFIED_TEST_DATABASE_URL;
const adminUrl = process.env.ETHN_UNIFIED_TEST_ADMIN_URL;
test('owner deletion removes records, preserves running slots and retries proof cleanup', {skip: !url || !adminUrl}, async () => {
 const pool = new Pool({connectionString:url}), admin = new Pool({connectionString:adminUrl});
 const actor = randomUUID(), verify = async () => actor;
 try {
   await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true)",[actor]);
   await admin.query('UPDATE ethn.court_hours SET hourly_rate=200');
   await savePaymentMethod(pool,verify,{id:'metrobank',name:'Metrobank',instructions:'Bank account',enabled:true});
   const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+2*86400000));
   const first = {courtId:'1',start:`${date}T00:00:00.000Z`,end:`${date}T01:00:00.000Z`};
   const input = {date,ranges:[first],guestName:'Test guest',guestEmail:'guest@example.test',guestPhone:null,paymentReceived:true,settingsVersion:'1',method:'cash',displayedTotal:'200.00',idempotencyKey:randomUUID()};
   const ownerToken = randomUUID();
   const onlineInput = {ownerToken,date,ranges:[first],displayedTotal:'200.00',displayedVersion:'1',idempotencyKey:randomUUID()};
   const paidOnline = await createCheckout(pool,onlineInput);
   const proof = await reserveProof(pool,{ownerToken,checkoutId:paidOnline.checkoutId,idempotencyKey:randomUUID(),mimeType:'image/png',byteSize:10});
   await submitBooking(pool,{inspect:async()=>({bytes:10,mimeType:'image/png'})},{ownerToken,checkoutId:paidOnline.checkoutId,reservationId:proof.reservationId,idempotencyKey:randomUUID(),paymentMethodId:'metrobank',customer:{name:'Online guest',email:'test@example.test',phone:'123'}});
   await decidePayment(pool,verify,{bookingId:paidOnline.checkoutId,key:randomUUID(),action:'approve',paymentReceived:true});
   await bookingAction(pool,verify,paidOnline.checkoutId,'refund',{key:randomUUID(),reason:'Refunded externally',reference:'Verified transfer'});
   const deletion = {key:randomUUID(),reason:'Duplicate booking entered in error'};
   const id = paidOnline.checkoutId;
   const search = (bookingId: string) => searchEthnBookings(pool, verify, new URLSearchParams({q:bookingId}));
   const { rows: [refunded] } = await search(id);
   assert.equal(refunded.canDelete,true);
   assert.equal(refunded.canArchive,true);
   assert.equal(refunded.canCancel,false);
   await assert.rejects(bookingAction(pool,async()=>randomUUID(),id,'delete',deletion),/FORBIDDEN/);
   const deleted = await bookingAction(pool,verify,id,'delete',deletion);
   assert.deepEqual(deleted,{bookingId:id,status:'deleted',proofCleanupPending:true});
   assert.deepEqual(await bookingAction(pool,verify,id,'delete',deletion),deleted);
   assert.deepEqual((await search(id)).rows,[]);
   for (const table of ['bookings','booking_items','payments','booking_refunds','proof_reservations','email_outbox','audit']) {
     assert.equal((await admin.query(`SELECT 1 FROM ethn.${table} WHERE ${table==='bookings'?'id':'booking_id'}=$1`,[id])).rowCount,0,table);
   }
   assert.equal((await listInbox(pool,verify)).some(item=>item.link===`/admin/bookings/${id}`),false);
   assert.deepEqual((await admin.query("SELECT actor,detail FROM ethn.audit WHERE action='booking.delete'")).rows,[{actor,detail:{bookingId:id,reason:deletion.reason}}]);
   await assert.rejects(createCheckout(pool,onlineInput),/IDEMPOTENCY_INCOMPLETE/);
   assert.deepEqual(await cleanDeletedBookingProofs(pool,async()=>{throw Error('offline');},id),{attempted:1,failed:1});
   await admin.query("UPDATE ethn.deleted_booking_proofs SET next_attempt=now()-interval '1 minute',final_after=now()-interval '1 minute' WHERE booking_id=$1",[id]);
   assert.deepEqual(await cleanDeletedBookingProofs(pool,async path=>assert.equal(path,proof.objectPath),id),{attempted:1,failed:0});
   assert.equal((await admin.query('SELECT 1 FROM ethn.deleted_booking_proofs WHERE booking_id=$1',[id])).rowCount,0);
   const anotherDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+3*86400000));
   const current = {...first,start:`${anotherDate}T00:00:00.000Z`,end:`${anotherDate}T02:00:00.000Z`};
   const extra = {...current,start:current.end,end:`${anotherDate}T03:00:00.000Z`};
   const paid = await createInternalBooking(pool,verify,{...input,date:anotherDate,ranges:[current],displayedTotal:'400.00',method:'cash',idempotencyKey:randomUUID()});
   const extension = randomUUID(), extensionItem = randomUUID();
   await admin.query("INSERT INTO ethn.extensions(id,booking_id,status,expires_at,operating_date,total,settings_version,created_by,idempotency_key) VALUES($1,$2,'confirmed',$3,$4,200,1,$5,$1::uuid::text)",[extension,paid.bookingId,extra.end,anotherDate,actor]);
   await admin.query('INSERT INTO ethn.extension_items(id,extension_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes) VALUES($1,$2,1,$3,$4,200,60,200,60)',[extensionItem,extension,extra.start,extra.end]);
   await admin.query("INSERT INTO ethn.court_allocations(id,extension_item_id,court_id,starts_at,ends_at,state) VALUES(gen_random_uuid(),$1,1,$2,$3,'confirmed')",[extensionItem,extra.start,extra.end]);
   const extProof = `extension-incoming/${'f'.repeat(64)}.png`;
   await admin.query("INSERT INTO ethn.extension_proofs(id,extension_id,object_path,mime_type,byte_size,state,created_by) VALUES(gen_random_uuid(),$1,$2,'image/png',10,'reserved',$3)",[extension,extProof,actor]);
   await admin.query(`WITH moved AS (
     UPDATE ethn.booking_items SET starts_at=statement_timestamp()-interval '30 minutes',ends_at=statement_timestamp()+interval '90 minutes'
     WHERE booking_id=$1 RETURNING id,starts_at,ends_at
   ) UPDATE ethn.court_allocations a SET starts_at=m.starts_at,ends_at=m.ends_at FROM moved m WHERE a.item_id=m.id`,[paid.bookingId]);
   await bookingAction(pool,verify,paid.bookingId,'delete',{key:randomUUID(),reason:'Duplicate paid booking'});
   assert.equal((await admin.query('SELECT 1 FROM ethn.payments WHERE booking_id=$1',[paid.bookingId])).rowCount,0);
   assert.equal((await admin.query('SELECT 1 FROM ethn.extensions WHERE id=$1',[extension])).rowCount,0);
   assert.equal((await admin.query("SELECT 1 FROM ethn.court_allocations a JOIN ethn.court_blocks b ON b.id=a.block_id WHERE b.kind='deleted_booking' AND a.state='confirmed' AND a.starts_at < now() AND a.ends_at > now() AND a.ends_at < now()+interval '40 minutes'")).rowCount,1);
   assert.equal((await createInternalBooking(pool,verify,{...input,date:anotherDate,ranges:[extra],displayedTotal:'200.00',method:'cash',idempotencyKey:randomUUID()})).status,'confirmed');
   assert.deepEqual(await cleanDeletedBookingProofs(pool,async path=>assert.equal(path,extProof),paid.bookingId),{attempted:1,failed:0});
   assert.equal((await admin.query('SELECT 1 FROM ethn.deleted_booking_proofs WHERE booking_id=$1 AND next_attempt=final_after',[paid.bookingId])).rowCount,1);
 } finally {
   await pool.end();
   await admin.end();
 }
});
