import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCheckout } from "../src/lib/booking/checkout";
import { createWalkIn, reserveWalkIn } from "../src/lib/admin/ethn-walk-ins";

const url = process.env.ETHN_WALK_IN_TEST_DATABASE_URL, adminUrl = process.env.ETHN_WALK_IN_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000021", staff = "00000000-0000-4000-8000-000000000022", other = "00000000-0000-4000-8000-000000000024", disabled = "00000000-0000-4000-8000-000000000023";
const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const at = (hour: number, minute = 0) => { const d = new Date(`${day}T00:00:00.000Z`); d.setUTCHours(hour - 8, minute); return d; };

test("walk-in hold reserves slot before full payment, binds staff and confirms atomically", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString:url }), admin = new Pool({ connectionString:adminUrl });
  const reserve = (hour:number, actor=staff, minutes=60, guestName="Desk Guest", courtId="1") => reserveWalkIn(pool, async()=>actor, {courtId,date:day,start:at(hour).toISOString(),end:new Date(at(hour).getTime()+minutes*60000).toISOString(),guestName,guestPhone:null});
  const confirm = (hold:Awaited<ReturnType<typeof reserve>>, over:Record<string,unknown>={}, actor=staff, key=randomUUID()) => createWalkIn(pool, async()=>actor, {holdId:hold.holdId,courtId:hold.courtId,date:day,start:hold.startsAt,end:hold.endsAt,guestName:"Desk Guest",guestPhone:null,method:"cash",reference:null,displayedTotal:hold.total,collectedAmount:hold.total,settingsVersion:hold.settingsVersion,paymentReceived:true,idempotencyKey:key,...over});
  try {
    await admin.query("UPDATE ethn.court_hours SET hourly_rate=200");
    await admin.query("UPDATE ethn.settings SET merchant='ETHN GCash 0917-000-0000'");
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true),($2,'staff',true),($3,'staff',true),($4,'staff',false)",[owner,staff,other,disabled]);

    await assert.rejects(reserve(10,null as unknown as string),/UNAUTHENTICATED/);
    await assert.rejects(reserve(10,disabled),/FORBIDDEN/);
    await assert.rejects(reserve(10,staff,60," "),/INVALID_INPUT/);
    await assert.rejects(reserve(10,staff,60,"x".repeat(101)),/INVALID_INPUT/);
    await assert.rejects(reserve(10,staff,60,"x","999"),/COURT_UNAVAILABLE/);

    const first=await reserve(10);
    assert.equal(first.total,"200.00");
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1",[first.holdId])).rows[0].status,"held");
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.payments WHERE booking_id=$1",[first.holdId])).rows[0].n,0);
    await assert.rejects(reserve(10,other),/SLOT_TAKEN/);
    await assert.rejects(confirm(first,{},other),/HOLD_NOT_FOUND/);
    await assert.rejects(confirm(first,{collectedAmount:"199.99"}),/PRICE_CHANGED/);
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1",[first.holdId])).rows[0].status,"held");

    const cashKey=randomUUID(), cash=await confirm(first,{},staff,cashKey);
    const replay=await confirm(first,{},staff,cashKey);
    assert.equal(replay.bookingId,cash.bookingId);
    assert.deepEqual((await admin.query("SELECT b.status,a.state,p.status payment_status,p.method,p.collected_amount::text amount FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id JOIN ethn.payments p ON p.booking_id=b.id WHERE b.id=$1",[cash.bookingId])).rows[0],{status:"confirmed",state:"confirmed",payment_status:"accepted",method:"cash",amount:"200.00"});
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.audit WHERE booking_id=$1 AND action='walkin.create'",[cash.bookingId])).rows[0].n,1);
    await assert.rejects(confirm(first,{guestName:"different"},staff,cashKey),/IDEMPOTENCY_MISMATCH/);

    const gcashHold=await reserve(12);
    await admin.query("UPDATE ethn.settings SET merchant=NULL");
    const gcash=await confirm(gcashHold,{method:"gcash",reference:"GC-123"});
    assert.equal(gcash.total,"200.00");
    assert.equal((await admin.query("SELECT accepted_reference,merchant_snapshot FROM ethn.payments WHERE booking_id=$1",[gcash.bookingId])).rows[0].accepted_reference,"GC-123");

    const frozen=await reserve(14);
    await admin.query("UPDATE ethn.court_hours SET hourly_rate=250");
    const frozenConfirmed=await confirm(frozen,{},staff,randomUUID());
    assert.equal(frozenConfirmed.total,"200.00");
    assert.equal((await admin.query("SELECT total::text FROM ethn.bookings WHERE id=$1",[frozen.holdId])).rows[0].total,"200.00");

    const expired=await reserve(16);
    await admin.query("UPDATE ethn.bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.holdId]);
    await assert.rejects(confirm(expired),/HOLD_EXPIRED/);
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.payments WHERE booking_id=$1",[expired.holdId])).rows[0].n,0);

    const checkoutStart=at(18),checkoutEnd=new Date(checkoutStart.getTime()+3600000);
    await admin.query("UPDATE ethn.settings SET merchant='ETHN GCash 0917-000-0000'");
    const checkout=await createCheckout(pool,{ownerToken:randomUUID(),idempotencyKey:randomUUID(),date:day,ranges:[{courtId:"1",start:checkoutStart.toISOString(),end:checkoutEnd.toISOString()}],displayedTotal:"250.00",displayedVersion:"1"});
    await assert.rejects(reserve(18),/SLOT_TAKEN/);
    await admin.query("UPDATE ethn.bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[checkout.checkoutId]);
    const afterExpiry=await reserve(18);
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1",[checkout.checkoutId])).rows[0].status,"expired");
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1",[afterExpiry.holdId])).rows[0].status,"held");

    const concurrent=await reserve(20), key=randomUUID();
    const results=await Promise.all([confirm(concurrent,{},staff,key),confirm(concurrent,{},staff,key)]);
    assert.equal(results[0].bookingId,results[1].bookingId);
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.audit WHERE booking_id=$1 AND action='walkin.create'",[concurrent.holdId])).rows[0].n,1);
    await admin.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1",[staff]);
    await assert.rejects(confirm(concurrent,{},staff,key),/FORBIDDEN/);
  } finally { await pool.end(); await admin.end(); }
});
