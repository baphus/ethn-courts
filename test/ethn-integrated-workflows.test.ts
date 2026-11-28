import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getAvailability } from "../src/lib/booking/ethn-availability";
import { completeBooking } from "../src/lib/admin/ethn-outcomes";
import { createEthnBlock, getEthnCalendar, releaseEthnBlock } from "../src/lib/admin/ethn-calendar";
import { createOpenPlay, listPublicOpenPlays } from "../src/lib/admin/ethn-open-plays";
import { correctExpense } from "../src/lib/admin/ethn-expense-corrections";
import { getFinance } from "../src/lib/admin/ethn-finance";
import { putEthnHours } from "../src/lib/admin/ethn-hours";
import { createExtensionHold } from "../src/lib/admin/ethn-extensions";
import { createSale } from "../src/lib/admin/ethn-sales";
import { manilaDateStr } from "../src/lib/booking/slots";

const url = process.env.ETHN_INTEGRATED_TEST_DATABASE_URL;
test("integrated ETHN allocation, calendar, extension, completion, and finance workflows", { skip: !url }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: process.env.ETHN_INTEGRATED_TEST_ADMIN_URL });
  const owner = randomUUID(), ids = { booking: randomUUID(), item: randomUUID(), extensionBooking: randomUUID(), extensionItem: randomUUID(), dueBooking: randomUUID(), dueItem: randomUUID(), sale: randomUUID(), expense: randomUUID() };
  const verify = async () => owner;
  const anchor = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 120) % 1440, anchorMs = anchor * 60000;
  const future = new Date(Date.now() + 2 * 86400000); future.setUTCHours(10, 0, 0, 0);
  const futureEnd = new Date(future.getTime() + 3600000), futureDate = manilaDateStr(new Date(future.getTime() - anchorMs));
  const scheduleSlot = Math.floor((Date.now() - anchorMs) / 1800000) * 1800000 + anchorMs;
  const extensionStart = new Date(scheduleSlot - 1800000), extensionEnd = new Date(scheduleSlot + 1800000);
  const extensionDate = manilaDateStr(new Date(extensionStart.getTime() - anchorMs));
  const dueStart = new Date(Date.now() - 2 * 3600000), dueEnd = new Date(Date.now() - 3600000), today = manilaDateStr(new Date()), ledgerDate = manilaDateStr(new Date(Date.now() - anchorMs));
  let openPlayId: string | undefined;
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true)", [owner]);
    await admin.query("UPDATE ethn.settings SET merchant='fixture',anchor_minutes=$1,version=version+1 WHERE singleton", [anchor]);
    await admin.query("DELETE FROM ethn.court_hours");
    const anchorTime = `${String(Math.floor(anchor/60)).padStart(2,"0")}:${String(anchor%60).padStart(2,"0")}`;
    for (const court of [1,2]) for (let day=0; day<7; day++) await admin.query("INSERT INTO ethn.court_hours(court_id,weekday,opens,closes,hourly_rate) VALUES($1,$2,$3,$3,100)", [court,day,anchorTime]);
    const version = (await admin.query("SELECT version::text FROM ethn.settings WHERE singleton")).rows[0].version;
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version,guest_name) VALUES($1,'integrated',$2,'confirmed',clock_timestamp(),100,1,'calendar guest')", [ids.booking,futureDate]);
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,2,$3,$4,100,60,100,30,30)", [ids.item,ids.booking,future.toISOString(),futureEnd.toISOString()]);
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,2,$3,$4,'confirmed')", [randomUUID(),ids.item,future.toISOString(),futureEnd.toISOString()]);
    const block = await createEthnBlock(pool,verify,{courtId:"1",startsAt:future.toISOString(),endsAt:futureEnd.toISOString(),reason:"private maintenance fixture",kind:"maintenance"});
    const playStart = new Date(futureEnd.getTime()+3600000), playEnd = new Date(playStart.getTime()+3600000);
    openPlayId = (await createOpenPlay(pool,verify,{courtIds:["2"],title:"Integrated play",description:"fixture",fee:"0.00",startsAt:playStart.toISOString(),endsAt:playEnd.toISOString()})).id;
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version,guest_name) VALUES($1,'extension',$2,'confirmed',clock_timestamp(),100,1,'extension guest')", [ids.extensionBooking,extensionDate]);
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,1,$3,$4,100,60,100,30,30)", [ids.extensionItem,ids.extensionBooking,extensionStart.toISOString(),extensionEnd.toISOString()]);
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,1,$3,$4,'confirmed')", [randomUUID(),ids.extensionItem,extensionStart.toISOString(),extensionEnd.toISOString()]);
    const hold = await createExtensionHold(pool,verify,{bookingId:ids.extensionBooking,courtId:"1",date:extensionDate,start:extensionEnd.toISOString(),end:new Date(extensionEnd.getTime()+3600000).toISOString(),settingsVersion:version,idempotencyKey:randomUUID()});
    const extensionAmount = hold.total;
    const availability = await getAvailability(pool,futureDate), publicCourt = availability.courts.find(c=>c.id==="2")!;
    assert.ok(publicCourt.occupied.some(o=>o.startsAt===future.toISOString())); assert.equal(JSON.stringify(publicCourt).includes("private maintenance fixture"),false);
    const calendar = (await getEthnCalendar(pool,verify,futureDate)).courts.flatMap(c=>c.intervals);
    assert.ok(calendar.some(i=>i.kind==="maintenance"&&i.reason==="private maintenance fixture"&&i.slotCount===undefined)); assert.equal(calendar.find(i=>i.kind==="booking"&&i.bookingId===ids.booking)?.slotCount,2); assert.ok((await listPublicOpenPlays(pool)).some(p=>p.id===openPlayId));
    await assert.rejects(releaseEthnBlock(pool,verify,(await admin.query("SELECT id FROM ethn.court_blocks WHERE open_play_id=$1",[openPlayId])).rows[0].id),/BLOCK_NOT_FOUND/);
    const current = (await getEthnCalendar(pool,verify,extensionDate)).courts.flatMap(c=>c.intervals);
    assert.ok(current.some(i=>i.bookingId===ids.extensionBooking&&i.guestName==="extension guest")); assert.ok(current.some(i=>i.bookingId===ids.extensionBooking&&i.startsAt===hold.startsAt));
    const hours = (await admin.query("SELECT version::text FROM ethn.settings WHERE singleton")).rows[0].version;
    await assert.rejects(putEthnHours(pool,verify,{version:hours,courts:[{id:"1",active:false,hours:[]},{id:"2",active:true,hours:[]}]}),/HOURS_CONFLICT|INVALID_SCHEDULE|SETTINGS_UNAVAILABLE/);
    await assert.rejects(completeBooking(pool,verify,ids.extensionBooking),/NOT_READY_TO_COMPLETE/);
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES($1,'due',$2,'confirmed',clock_timestamp(),100,1)",[ids.dueBooking,today]);
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,1,$3,$4,100,60,100,30,30)",[ids.dueItem,ids.dueBooking,dueStart,dueEnd]);
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,1,$3,$4,'confirmed')",[randomUUID(),ids.dueItem,dueStart,dueEnd]);
    assert.equal((await completeBooking(pool,verify,ids.dueBooking)).changed,true);
    const sale = await createSale(pool,verify,{itemName:"Fixture sale",category:"Other",description:null,note:null,amount:"10.00",method:"cash",receivedAt:new Date().toISOString(),idempotencyKey:randomUUID()});
    await admin.query(`INSERT INTO ethn.sale_corrections(id,sale_id,amount_delta,cash_delta,gcash_delta,reason,created_by,created_at)
      VALUES($1,$2,-2,-10,8,'Historical correction fixture',$3,($4::date::timestamp AT TIME ZONE 'Asia/Manila')+interval '1 hour')`, [randomUUID(),sale.id,owner,today]);
    const client = await pool.connect();
    try { await client.query("INSERT INTO ethn.expenses(id,title,category,amount,paid_date,created_by) VALUES($1,'Fixture expense','Other',5,$2,$3)",[ids.expense,ledgerDate,owner]); }
    finally { client.release(); }
    await correctExpense(pool,verify,ids.expense,{amountDelta:"-1.00",reason:"fixture",correctionDate:today,expectedPreviousCorrectionId:null,idempotencyKey:randomUUID()});
    const finance = await getFinance(pool,verify,ledgerDate,today);
    assert.equal(finance.components.manualSalesAfterCorrections,"8.00");
    assert.equal(finance.totals.cash,"0.00");
    assert.equal(finance.totals.gcash,"8.00");
    assert.equal(finance.totals.expenses,"4.00");
    assert.deepEqual((await pool.query("SELECT has_column_privilege(current_user,'ethn.expense_corrections','amount_delta','UPDATE') correction_update,has_table_privilege('anon','ethn.payments','SELECT') anon_payment_read")).rows[0],{correction_update:false,anon_payment_read:false});
  } finally { await pool.end(); await admin.end(); }
});
