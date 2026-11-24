import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createExtensionHold, confirmExtension, expireExtension } from "../src/lib/admin/ethn-extensions";

const url=process.env.ETHN_EXTENSION_TEST_DATABASE_URL,adminUrl=process.env.ETHN_EXTENSION_TEST_ADMIN_URL;
const owner="00000000-0000-4000-8000-000000000031",staff="00000000-0000-4000-8000-000000000032";
const now=new Date(),manila=(()=>{const d=new Date(now.toLocaleString("en-US",{timeZone:"Asia/Manila"}));return {year:d.getFullYear(),month:d.getMonth(),date:d.getDate(),hour:d.getHours(),minute:d.getMinutes()};})(),anchor=(Math.floor((manila.hour*60+manila.minute)/30)*30+1440-120)%1440,anchorText=`${String(Math.floor(anchor/60)).padStart(2,"0")}:${String(anchor%60).padStart(2,"0")}`,businessDate=(()=>{const d=new Date(Date.UTC(manila.year,manila.month,manila.date));if(manila.hour*60+manila.minute<anchor)d.setUTCDate(d.getUTCDate()-1);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;})(),originalStart=new Date(Math.floor(now.getTime()/1800000)*1800000-1800000),originalEnd=new Date(originalStart.getTime()+3600000),later=(hours:number)=>new Date(originalEnd.getTime()+hours*3600000);

test("extension hold, full confirmation, expiry and original immutability",{skip:!url||!adminUrl},async()=>{
 const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:adminUrl});
 try{
  await admin.query("UPDATE ethn.settings SET merchant='ETHN GCash',hold_minutes=10,anchor_minutes=$1",[anchor]);
  await admin.query("UPDATE ethn.court_hours SET opens=$1,closes=$1,hourly_rate=100",[anchorText]);
  await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'owner',true)",[owner,staff]);
  const bookingId=randomUUID(),itemId=randomUUID(),ownerHash="extensiontest",originalPaymentId=randomUUID();
  await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,merchant_snapshot,settings_version) VALUES($1,$2,$3,'confirmed',clock_timestamp(),100,'ETHN GCash',1)",[bookingId,ownerHash,businessDate]);
  await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,1,$3,$4,100,60,100,30,30)",[itemId,bookingId,originalStart,originalEnd]);
  await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,1,$3,$4,'confirmed')",[randomUUID(),itemId,originalStart,originalEnd]);
  await admin.query("INSERT INTO ethn.payments(id,booking_id,method,merchant_snapshot,status,collected_amount,received_at,verified_at,verified_by) VALUES($1,$2,'cash','ETHN GCash','accepted',100,clock_timestamp(),clock_timestamp(),$3)",[originalPaymentId,bookingId,staff]);
  const version=(await admin.query("SELECT version::text FROM ethn.settings")).rows[0].version;
  let effectiveEnd=originalEnd;const create=(end:Date,key=randomUUID())=>createExtensionHold(pool,async()=>staff,{bookingId,courtId:"1",date:businessDate,start:effectiveEnd.toISOString(),end:end.toISOString(),settingsVersion:version,idempotencyKey:key});
  const original=await admin.query("SELECT b.status,b.total::text,i.starts_at,i.ends_at,a.state,p.id AS payment_id,p.collected_amount::text AS collected FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id JOIN ethn.payments p ON p.booking_id=b.id AND p.extension_id IS NULL WHERE b.id=$1",[bookingId]);
  const firstKey=randomUUID(),first=await create(later(1),firstKey);
  assert.deepEqual(await create(later(1),firstKey),first);
  await assert.rejects(create(later(1)),/EXTENSION_ACTIVE/);
  await assert.rejects(confirmExtension(pool,async()=>staff,{extensionId:first.extensionId,key:randomUUID(),method:"cash",collectedAmount:"99.99",receivedAt:new Date().toISOString(),paymentReceived:true}),/AMOUNT_MISMATCH/);
  assert.equal((await admin.query("SELECT status FROM ethn.extensions WHERE id=$1",[first.extensionId])).rows[0].status,"held");
  const confirmKey=randomUUID(),receipt={extensionId:first.extensionId,key:confirmKey,method:"cash" as const,collectedAmount:"100.00",receivedAt:new Date().toISOString(),paymentReceived:true as const};
  const confirmed=await confirmExtension(pool,async()=>staff,receipt);assert.deepEqual(await confirmExtension(pool,async()=>staff,receipt),confirmed);
  assert.deepEqual((await admin.query("SELECT p.booking_id,p.extension_id,p.collected_amount::text,a.state FROM ethn.payments p JOIN ethn.court_allocations a ON a.extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=p.extension_id) WHERE p.extension_id=$1",[first.extensionId])).rows[0],{booking_id:bookingId,extension_id:first.extensionId,collected_amount:"100.00",state:"confirmed"});
  assert.deepEqual((await admin.query("SELECT b.status,b.total::text,i.starts_at,i.ends_at,a.state,p.id AS payment_id,p.collected_amount::text AS collected FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id JOIN ethn.payments p ON p.booking_id=b.id AND p.extension_id IS NULL WHERE b.id=$1",[bookingId])).rows,original.rows);
  effectiveEnd=later(1);
  await assert.rejects(createExtensionHold(pool,async()=>staff,{bookingId,courtId:"1",date:businessDate,start:later(2).toISOString(),end:later(3).toISOString(),settingsVersion:version,idempotencyKey:randomUUID()}),/BOOKING_INELIGIBLE/);
  const second=await create(later(1.5));
  await admin.query("UPDATE ethn.extensions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[second.extensionId]);
  await admin.query("UPDATE ethn.court_allocations SET expires_at=clock_timestamp()-interval '1 second' WHERE extension_item_id IN (SELECT id FROM ethn.extension_items WHERE extension_id=$1)",[second.extensionId]);
  assert.equal((await expireExtension(pool,async()=>staff,second.extensionId)).status,"expired");
  const third=await create(later(2));
  await assert.rejects(create(later(2)),/EXTENSION_ACTIVE/);
  await admin.query("UPDATE ethn.extensions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[third.extensionId]);
  assert.equal((await expireExtension(pool,async()=>staff,third.extensionId)).status,"expired");
  const gcash=await create(later(2));
  await admin.query("UPDATE ethn.settings SET merchant='changed after hold',version=version+1");
  await confirmExtension(pool,async()=>staff,{extensionId:gcash.extensionId,key:randomUUID(),method:'gcash',collectedAmount:gcash.total,receivedAt:new Date().toISOString(),paymentReceived:true,acceptedReference:'extension-global-ref'});
  assert.equal((await admin.query("SELECT merchant_snapshot FROM ethn.payments WHERE extension_id=$1",[gcash.extensionId])).rows[0].merchant_snapshot,'ETHN GCash');
  await admin.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1",[staff]);
  await assert.rejects(create(later(3)),/FORBIDDEN/);
 }finally{await Promise.all([pool.end(),admin.end()]);}
});
