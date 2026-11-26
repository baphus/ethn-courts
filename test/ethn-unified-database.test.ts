import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createInternalBooking} from '../src/lib/admin/ethn-internal-booking';
import {bookingAction} from '../src/lib/admin/ethn-booking-actions';
import {savePaymentMethod,listPaymentMethods,paymentMethodQr} from '../src/lib/admin/ethn-payment-methods';
import {createCheckout,releaseCheckout} from '../src/lib/booking/checkout';
import {reserveProof} from '../src/lib/booking/proof-reservation';
import {submitBooking} from '../src/lib/booking/submission';
import {decidePayment} from '../src/lib/admin/ethn-payment-decision';
import {listInbox} from '../src/lib/admin/ethn-notifications';
import {getFinance} from '../src/lib/admin/ethn-finance';
const url=process.env.ETHN_UNIFIED_TEST_DATABASE_URL,adminUrl=process.env.ETHN_UNIFIED_TEST_ADMIN_URL;
test('unified booking restricted SQL transactions', {skip:!url||!adminUrl},async()=>{
 const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:adminUrl});
 const actor='00000000-0000-4000-8000-000000000001',verify=async()=>actor;
 try{
  await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true)",[actor]);
  await admin.query("UPDATE ethn.court_hours SET hourly_rate=200");
  await savePaymentMethod(pool,verify,{id:'metrobank',name:'Metrobank',instructions:'Bank account',enabled:true});
  assert.ok((await listPaymentMethods(pool)).methods.some(m=>m.id==='metrobank'));
  await savePaymentMethod(pool,verify,{id:'metrobank',name:'Metrobank',instructions:'Bank account',enabled:true},Buffer.from('old-qr'));
  const oldVersion=(await listPaymentMethods(pool)).methods.find(m=>m.id==='metrobank')!.version;
  await savePaymentMethod(pool,verify,{id:'metrobank',name:'Metrobank',instructions:'Bank account',enabled:true},Buffer.from('new-qr'));
  assert.equal((await paymentMethodQr(pool,'metrobank',undefined,oldVersion))?.toString(),'old-qr');
  await savePaymentMethod(pool,verify,{id:'metrobank',name:'Metrobank',instructions:'Changed recipient',enabled:true});
  assert.equal(await paymentMethodQr(pool,'metrobank'),undefined);
  await savePaymentMethod(pool,verify,{id:'metrobank',name:'Metrobank',instructions:'Bank account',enabled:true},Buffer.from('current-qr'));
  assert.equal((await paymentMethodQr(pool,'metrobank'))?.toString(),'current-qr');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+2*86400000));
  const start=`${date}T00:00:00.000Z`,end=`${date}T01:00:00.000Z`;
  const first={courtId:'1',start,end},second={courtId:'2',start,end:`${date}T02:00:00.000Z`};
  const input={ranges:[first,second],date,guestName:'Test guest',guestEmail:'guest@example.test',method:'metrobank',reference:'desk-ref',displayedTotal:'600.00',settingsVersion:'1',paymentReceived:true,idempotencyKey:randomUUID()};
  const booking=await createInternalBooking(pool,verify,input);
  assert.equal(booking.status,'confirmed');
  assert.deepEqual(await createInternalBooking(pool,verify,{...input,ranges:[second,first]}),booking);
  const items=(await admin.query(`SELECT i.court_id::text,i.starts_at,i.ends_at,i.amount::text,a.state FROM ethn.booking_items i JOIN ethn.court_allocations a ON a.item_id=i.id WHERE i.booking_id=$1 ORDER BY i.court_id`,[booking.bookingId])).rows;
  assert.deepEqual(items.map(i=>[i.court_id,i.starts_at.toISOString(),i.ends_at.toISOString(),i.amount,i.state]),[['1',start,end,'200.00','confirmed'],['2',start,second.end,'400.00','confirmed']]);
  const payment=(await admin.query('SELECT method,collected_amount::text,received_at FROM ethn.payments WHERE booking_id=$1',[booking.bookingId])).rows[0];
  assert.deepEqual(payment,{method:'metrobank',collected_amount:'600.00',received_at:null});
  await assert.rejects(createInternalBooking(pool,verify,{...input,ranges:[first],displayedTotal:'200.00'}),/IDEMPOTENCY_MISMATCH/);
  const counts=()=>admin.query('SELECT (SELECT count(*)::int FROM ethn.bookings) AS bookings,(SELECT count(*)::int FROM ethn.booking_items) AS items,(SELECT count(*)::int FROM ethn.court_allocations) AS allocations,(SELECT count(*)::int FROM ethn.payments) AS payments');
  const before=(await counts()).rows[0];
  const freeFirst={...first,start:end,end:second.end};
  await assert.rejects(createInternalBooking(pool,verify,{...input,ranges:[freeFirst,second],idempotencyKey:randomUUID()}),/SLOT_TAKEN/);
  assert.deepEqual((await counts()).rows[0],before);
  const refund={key:randomUUID(),reason:'Customer cancellation',reference:'external-return'};
  assert.equal((await bookingAction(pool,verify,booking.bookingId,'refund',refund)).status,'refunded');
  await bookingAction(pool,verify,booking.bookingId,'refund',refund);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM ethn.booking_refunds')).rows[0].n,1);
   const queued=async (id:string)=>(await pool.query('SELECT kind,payload FROM ethn.email_outbox WHERE booking_id=$1 ORDER BY kind',[id])).rows;
    const ownerAlert=(source:string)=>({kind:'booking_owner_alert',payload:{ownerId:actor,source}});
    assert.deepEqual(await queued(booking.bookingId),[{kind:'booking_approved',payload:{email:'guest@example.test',staff:true,total:'600.00'}},ownerAlert('internal'),{kind:'booking_refunded',payload:{email:'guest@example.test',staff:true,total:'600.00'}}]);
   assert.equal((await pool.query('SELECT guest_email FROM ethn.bookings WHERE id=$1',[booking.bookingId])).rows[0].guest_email,'guest@example.test');
  await bookingAction(pool,verify,booking.bookingId,'archive',{key:randomUUID()});
  const finance=await getFinance(pool,verify,null,null);
  assert.equal(finance.totals.other,'600.00');assert.equal(finance.totals.refunds,'600.00');assert.equal(finance.totals.net,'0.00');
  const noEmail=await createInternalBooking(pool,verify,{...input,guestEmail:null,ranges:[first],displayedTotal:'200.00',method:'cash',idempotencyKey:randomUUID()});
  await bookingAction(pool,verify,noEmail.bookingId,'cancel',{key:randomUUID(),reason:'No email on file'});
  assert.deepEqual(await queued(noEmail.bookingId),[ownerAlert('internal')]);
  const next=await createInternalBooking(pool,verify,{...input,ranges:[first],displayedTotal:'200.00',method:'cash',idempotencyKey:randomUUID()});
  const cancel={key:randomUUID(),reason:'Customer cancelled, payment retained'};
  await bookingAction(pool,verify,next.bookingId,'cancel',cancel);
  await bookingAction(pool,verify,next.bookingId,'cancel',cancel);
  assert.deepEqual(await queued(next.bookingId),[...['booking_approved','booking_cancelled'].map(kind=>({kind,payload:{email:'guest@example.test',staff:true,total:'200.00'}})),ownerAlert('internal')]);
  assert.equal((await admin.query('SELECT status FROM ethn.payments WHERE booking_id=$1',[next.bookingId])).rows[0].status,'accepted');
  const ownerToken=randomUUID();
  const early={courtId:'2',start,end},late={courtId:'2',start:`${date}T02:00:00.000Z`,end:`${date}T03:00:00.000Z`};
  const onlineInput={ownerToken,idempotencyKey:randomUUID(),date,ranges:[late,early],displayedTotal:'400.00',displayedVersion:'1'};
  await assert.rejects(createCheckout(pool,{...onlineInput,ranges:[early,early]}),/INVALID_INPUT/);
  const abandoned=await createCheckout(pool,{...onlineInput,idempotencyKey:randomUUID()});
  const release={ownerToken,checkoutId:abandoned.checkoutId};
  assert.equal(await releaseCheckout(pool,{...release,ownerToken:randomUUID()}),false);
  await assert.rejects(createCheckout(pool,onlineInput),/SLOT_TAKEN/);
  assert.equal(await releaseCheckout(pool,release),true);
  assert.equal(await releaseCheckout(pool,release),true);
  const checkout=await createCheckout(pool,onlineInput);
   assert.deepEqual(await queued(checkout.checkoutId), []);
  assert.deepEqual(await createCheckout(pool,{...onlineInput,ranges:[early,late]}),checkout);
  const allocations=(await admin.query('SELECT a.starts_at,a.ends_at FROM ethn.court_allocations a JOIN ethn.booking_items i ON i.id=a.item_id WHERE i.booking_id=$1 AND a.state=$2 ORDER BY a.starts_at',[checkout.checkoutId,'held'])).rows;
  assert.deepEqual(allocations.map(a=>[a.starts_at.toISOString(),a.ends_at.toISOString()]),[[early.start,early.end],[late.start,late.end]]);
  await savePaymentMethod(pool,verify,{id:'metrobank',name:'Changed bank',instructions:'Changed account',enabled:false});
  await savePaymentMethod(pool,verify,{id:'gcash',name:'GCash',instructions:'Backup payment method',enabled:true});
   const proof=await reserveProof(pool,{ownerToken,checkoutId:checkout.checkoutId,idempotencyKey:randomUUID(),mimeType:'image/png',byteSize:10});
   const submitted=await submitBooking(pool,{inspect:async()=>({bytes:10,mimeType:'image/png'})},{ownerToken,checkoutId:checkout.checkoutId,reservationId:proof.reservationId,idempotencyKey:randomUUID(),paymentMethodId:'metrobank',customer:{name:'Online guest',email:'test@example.test',phone:'123'}});
   assert.equal(submitted.booked,true);
  assert.equal(await releaseCheckout(pool,{ownerToken,checkoutId:checkout.checkoutId}),false);
  await decidePayment(pool,verify,{bookingId:checkout.checkoutId,key:randomUUID(),action:'approve',paymentReceived:true,acceptedReference:'verified-online-transfer'});
  const online=(await admin.query('SELECT method,claimed_reference,collected_amount::text,received_at,merchant_snapshot FROM ethn.payments WHERE booking_id=$1',[checkout.checkoutId])).rows[0];
  assert.equal(online.method,'metrobank');assert.equal(online.collected_amount,'400.00');assert.equal(online.received_at,null);assert.equal(online.claimed_reference,null);assert.ok(online.merchant_snapshot.includes('Bank account'));
  await bookingAction(pool,verify,checkout.checkoutId,'refund',{key:randomUUID(),reason:'Internal note',reference:'External transfer'});
  const onlineNotices=await queued(checkout.checkoutId);
  assert.deepEqual(onlineNotices.map(n=>n.kind),['booking_approved','booking_owner_alert','booking_refunded','booking_submission']);
  const [approved, alert, refunded, submission]=onlineNotices;
   assert.deepEqual(alert, ownerAlert('online'));
   const inbox = (await listInbox(pool,verify)).filter(item=>item.link===`/admin/bookings/${checkout.checkoutId}`);
   assert.deepEqual(inbox.map(item=>item.kind).sort(), ['booking_confirmed','proof_submitted','refund_recorded']);
   assert.ok(inbox.every(item=>item.booking?.customerName==='Online guest' && item.booking.reference===submission.payload.code && item.booking.amount==='400.00' && item.booking.slots.length===2));
   assert.equal(inbox.find(item=>item.kind==='refund_recorded')?.booking?.amountKind,'refund_amount');
   assert.ok(!JSON.stringify(inbox).includes('test@example.test'));
  assert.match(submission.payload.trackingToken,/^[0-9a-f]{64}$/);
  assert.deepEqual(refunded.payload,{email:'test@example.test',total:'400.00',code:submission.payload.code,trackingToken:submission.payload.trackingToken});
  assert.equal(approved.payload.trackingToken,refunded.payload.trackingToken);
  await savePaymentMethod(pool,verify,{id:'metrobank',name:'Metrobank',instructions:'Bank account',enabled:true});
  const pending=await createCheckout(pool,{...onlineInput,idempotencyKey:randomUUID()});
  const pendingProof=await reserveProof(pool,{ownerToken,checkoutId:pending.checkoutId,idempotencyKey:randomUUID(),mimeType:'image/png',byteSize:10});
  await submitBooking(pool,{inspect:async()=>({bytes:10,mimeType:'image/png'})},{ownerToken,checkoutId:pending.checkoutId,reservationId:pendingProof.reservationId,idempotencyKey:randomUUID(),paymentMethodId:'metrobank',customer:{name:'Pending guest',email:'pending@example.test',phone:'123'}});
  const movePast=(slot:typeof early)=>admin.query(`WITH moved AS (
    UPDATE ethn.booking_items SET starts_at=starts_at-interval '7 days',ends_at=ends_at-interval '7 days'
    WHERE booking_id=$1 AND starts_at=$2 RETURNING id,starts_at,ends_at
   ) UPDATE ethn.court_allocations a SET starts_at=m.starts_at,ends_at=m.ends_at FROM moved m WHERE a.item_id=m.id`,[pending.checkoutId,slot.start]);
  const freeSlot={...first,start:end,end:second.end};
  const duplicate=await Promise.allSettled([
   decidePayment(pool,verify,{bookingId:pending.checkoutId,key:randomUUID(),action:'approve',paymentReceived:true,acceptedReference:'verified-online-transfer'}),
   createInternalBooking(pool,verify,{...input,ranges:[freeSlot],displayedTotal:'200.00',reference:'VERIFIED-ONLINE-TRANSFER',idempotencyKey:randomUUID()}),
  ]);
  assert.match(String((duplicate[0] as PromiseRejectedResult).reason),/REFERENCE_ALREADY_USED/);
  assert.match(String((duplicate[1] as PromiseRejectedResult).reason),/REFERENCE_TAKEN/);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ethn.payments WHERE method='metrobank' AND lower(accepted_reference)='verified-online-transfer'")).rows[0].n,1);
  await movePast(early);
  await assert.rejects(decidePayment(pool,verify,{bookingId:pending.checkoutId,key:randomUUID(),action:'approve',paymentReceived:true,acceptedReference:'verified-ended-transfer'}),/DECISION_ALREADY_FINAL/);
  const overdue=(await admin.query(`SELECT b.status,p.status AS payment_status,p.proof_id,
    ARRAY(SELECT a.state FROM ethn.court_allocations a JOIN ethn.booking_items i ON i.id=a.item_id WHERE i.booking_id=b.id) AS allocations,
    (SELECT count(*)::int FROM ethn.audit WHERE booking_id=b.id AND action='booking.cancel' AND actor='system:cancellation') AS audits
    FROM ethn.bookings b JOIN ethn.payments p ON p.booking_id=b.id WHERE b.id=$1`,[pending.checkoutId])).rows[0];
  assert.deepEqual(overdue,{status:'pending',payment_status:'unverified',proof_id:pendingProof.reservationId,allocations:['pending','pending'],audits:0});
  assert.equal((await listInbox(pool,verify)).filter(item=>item.link===`/admin/bookings/${pending.checkoutId}` && item.kind==='booking_cancelled').length,0);
  assert.equal((await decidePayment(pool,verify,{bookingId:pending.checkoutId,key:randomUUID(),action:'reject',reason:'Payment could not be verified'})).status,'rejected');
  const lateHold=await createCheckout(pool,{...onlineInput,idempotencyKey:randomUUID(),ranges:[freeSlot],displayedTotal:'200.00'});
  const lateInput={ownerToken,checkoutId:lateHold.checkoutId,mimeType:'image/png',byteSize:10};
  const reserved=await Promise.all([1,2].map(()=>reserveProof(pool,{...lateInput,idempotencyKey:randomUUID()})));
  await admin.query("UPDATE ethn.bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[lateHold.checkoutId]);
  const sendLate=(reservationId:string)=>submitBooking(pool,{inspect:async()=>({bytes:10,mimeType:'image/png'})},{ownerToken,checkoutId:lateHold.checkoutId,reservationId,idempotencyKey:randomUUID(),paymentMethodId:'metrobank',customer:{name:'Late guest',email:'late@example.test',phone:'123'}});
  assert.equal((await sendLate(reserved[0].reservationId)).booked,false);
  await assert.rejects(sendLate(reserved[1].reservationId),/ALREADY_SUBMITTED/);
  const raceHold=await createCheckout(pool,{...onlineInput,idempotencyKey:randomUUID()});
  const raceProof=await reserveProof(pool,{ownerToken,checkoutId:raceHold.checkoutId,mimeType:'image/png',byteSize:10,idempotencyKey:randomUUID()});
  await submitBooking(pool,{inspect:async()=>({bytes:10,mimeType:'image/png'})},{ownerToken,checkoutId:raceHold.checkoutId,reservationId:raceProof.reservationId,idempotencyKey:randomUUID(),paymentMethodId:'metrobank',customer:{name:'Race guest',email:'race@example.test',phone:'123'}});
  const beforeRace=await getFinance(pool,verify,null,null);
  const race=await Promise.allSettled([
   decidePayment(pool,verify,{bookingId:raceHold.checkoutId,key:randomUUID(),action:'approve',paymentReceived:true,acceptedReference:'race-transfer'}),
   createInternalBooking(pool,verify,{...input,ranges:[freeSlot],displayedTotal:'200.00',reference:'RACE-TRANSFER',idempotencyKey:randomUUID()}),
  ]);
  assert.equal(race.filter(result=>result.status==='fulfilled').length,1);
  const rejected=race.find(result=>result.status==='rejected');
  assert.match(String(rejected?.reason),/REFERENCE_(TAKEN|ALREADY_USED)/);
  const expectedIncrease=race[0].status==='fulfilled'?400:200;
  assert.equal(Number((await getFinance(pool,verify,null,null)).totals.other)-Number(beforeRace.totals.other),expectedIncrease);
  await admin.query('UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1',[actor]);
  await assert.rejects(bookingAction(pool,verify,next.bookingId,'archive',{key:randomUUID()}),/FORBIDDEN/);
 }finally{await pool.end();await admin.end();}
});
