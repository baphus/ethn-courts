import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { submitExtensionProof, reserveExtensionProof, approveExtensionProof, rejectExtensionProof } from "../src/lib/admin/ethn-extension-review";
import { createExtensionHold } from "../src/lib/admin/ethn-extensions";
import { slotSelectionDateStr } from "../src/lib/booking/slots";
import { randomUUID } from "node:crypto";

const url=process.env.ETHN_EXTENSION_TEST_DATABASE_URL,adminUrl=process.env.ETHN_EXTENSION_TEST_ADMIN_URL;
const staff="00000000-0000-4000-8000-000000000032";

test("extension proof submit validates boundary inputs before storage or DB", async()=>{
  let inspected=0;
  const noPool={connect:async()=>{throw new Error("unexpected DB access");}} as unknown as Pick<Pool,"connect">;
  await assert.rejects(submitExtensionProof(noPool,async()=>staff,{extensionId:"bad",proofId:"bad",key:"k",claimedAmount:"1.00",claimedReference:"ref"},{inspect:async()=>{inspected++;return {bytes:1,mimeType:"image/png"};},sign:async()=>({signedUrl:"",token:"",path:""})}),/INVALID_INPUT/);
  assert.equal(inspected,0);
});

test("reservation idempotency persists actor operation request and replay shape",{skip:!url},async()=>{
  const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:adminUrl});
  const actor="00000000-0000-4000-8000-000000000032",key="reserve-replay-test";
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'staff',true) ON CONFLICT(user_id) DO UPDATE SET enabled=true",[actor]);
    await admin.query("UPDATE ethn.settings SET anchor_minutes=420,hold_minutes=10,merchant='Test merchant'");
    const start=new Date(Math.floor(Date.now()/1800000)*1800000),end=new Date(start.getTime()+3600000),operatingDate=slotSelectionDateStr([start])!;
    await admin.query("DELETE FROM ethn.court_hours"); await admin.query("INSERT INTO ethn.court_hours(court_id,weekday,opens,closes,hourly_rate) SELECT c.id,d,'07:00','07:00',100 FROM ethn.courts c CROSS JOIN generate_series(0,6) d");
    const bookingId=randomUUID(),itemId=randomUUID();
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,price_acknowledged,settings_version) VALUES($1,$2,$3,'confirmed',clock_timestamp()+interval '1 day',100,true,1)",[bookingId,randomUUID(),operatingDate]);
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,1,$3,$4,100,60,100,30,30)",[itemId,bookingId,start,end]);
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,1,$3,$4,'confirmed')",[randomUUID(),itemId,start,end]);
    const hold=await createExtensionHold(pool,async()=>actor,{bookingId,courtId:"1",date:operatingDate,start:end.toISOString(),end:new Date(end.getTime()+1800000).toISOString(),settingsVersion:"1",idempotencyKey:randomUUID()});
    const input={extensionId:hold.extensionId,mimeType:"image/png",byteSize:12,key};
    const first=await reserveExtensionProof(pool,async()=>actor,input);
    assert.deepEqual(await reserveExtensionProof(pool,async()=>actor,input),first);
    await assert.rejects(reserveExtensionProof(pool,async()=>actor,{...input,byteSize:13}),/IDEMPOTENCY_MISMATCH/);
    const proofId=first.proofId,storage={inspect:async()=>({bytes:12,mimeType:"image/png"}),sign:async(path:string)=>({signedUrl:"https://upload.invalid",token:"test",path})};
    await admin.query("UPDATE ethn.extensions SET expires_at=clock_timestamp()+interval '10 minutes' WHERE id=$1",[hold.extensionId]);
    const submit={extensionId:hold.extensionId,proofId,key:"proof-submit",claimedReference:"claimed-123",claimedAmount:"50.00"};
    const pending=await submitExtensionProof(pool,async()=>actor,submit,storage); assert.equal(pending.status,"pending");
    assert.deepEqual(await submitExtensionProof(pool,async()=>actor,submit,{...storage,inspect:async()=>{throw new Error("should not inspect replay");}}),pending);
    await assert.rejects(submitExtensionProof(pool,async()=>actor,{...submit,claimedReference:"different"},storage),/IDEMPOTENCY_MISMATCH/);
    const original=(await admin.query("SELECT b.status,b.total::text,a.state FROM ethn.bookings b JOIN ethn.court_allocations a ON a.item_id IN(SELECT id FROM ethn.booking_items WHERE booking_id=b.id) WHERE b.id=$1",[bookingId])).rows[0];
    const approval={extensionId:hold.extensionId,key:"approve",receivedAt:new Date().toISOString(),amount:"50.00",acceptedReference:"accepted-123"};
    const approved=await approveExtensionProof(pool,async()=>actor,approval); assert.equal(approved.status,"confirmed");
    assert.deepEqual(await approveExtensionProof(pool,async()=>actor,approval),approved);
    assert.deepEqual((await admin.query("SELECT b.status,b.total::text,a.state FROM ethn.bookings b JOIN ethn.court_allocations a ON a.item_id IN(SELECT id FROM ethn.booking_items WHERE booking_id=b.id) WHERE b.id=$1",[bookingId])).rows[0],original);
    const ext2=await createExtensionHold(pool,async()=>actor,{bookingId,courtId:"1",date:operatingDate,start:new Date(end.getTime()+1800000).toISOString(),end:new Date(end.getTime()+3600000).toISOString(),settingsVersion:"1",idempotencyKey:randomUUID()});
    const pr2=await reserveExtensionProof(pool,async()=>actor,{extensionId:ext2.extensionId,mimeType:"image/png",byteSize:12,key:"reserve-reject"});
    await admin.query("UPDATE ethn.extensions SET expires_at=clock_timestamp()+interval '10 minutes' WHERE id=$1",[ext2.extensionId]);
    const pending2=await submitExtensionProof(pool,async()=>actor,{extensionId:ext2.extensionId,proofId:pr2.proofId,key:"submit-reject",claimedReference:"claimed-456",claimedAmount:"50.00"},storage); assert.equal(pending2.status,"pending");
    const rejected=await rejectExtensionProof(pool,async()=>actor,{extensionId:ext2.extensionId,key:"reject",reason:"Proof mismatch"}); assert.equal(rejected.status,"rejected");
    assert.deepEqual(await rejectExtensionProof(pool,async()=>actor,{extensionId:ext2.extensionId,key:"reject",reason:"Proof mismatch"}),rejected);
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1",[bookingId])).rows[0].status,"confirmed");
    const ext3=await createExtensionHold(pool,async()=>actor,{bookingId,courtId:"1",date:operatingDate,start:new Date(end.getTime()+1800000).toISOString(),end:new Date(end.getTime()+3600000).toISOString(),settingsVersion:"1",idempotencyKey:randomUUID()});
    const pr3=await reserveExtensionProof(pool,async()=>actor,{extensionId:ext3.extensionId,mimeType:"image/png",byteSize:12,key:"reserve-late"});
    await admin.query("UPDATE ethn.extensions SET status='expired',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[ext3.extensionId]);
    await admin.query("UPDATE ethn.court_allocations SET state='held',expires_at=clock_timestamp()-interval '1 second' WHERE extension_item_id IN(SELECT id FROM ethn.extension_items WHERE extension_id=$1)",[ext3.extensionId]);
    const lateInput={extensionId:ext3.extensionId,proofId:pr3.proofId,key:"submit-late",claimedReference:"claimed-late",claimedAmount:"50.00"};
    const late=await submitExtensionProof(pool,async()=>actor,lateInput,storage); assert.equal(late.status,"exception");
    assert.deepEqual(await submitExtensionProof(pool,async()=>actor,lateInput,{...storage,inspect:async()=>{throw new Error("should not inspect replay");}}),late);
    await assert.rejects(submitExtensionProof(pool,async()=>actor,{...lateInput,claimedAmount:"51.00"},storage),/IDEMPOTENCY_MISMATCH/);
    assert.deepEqual((await admin.query("SELECT e.status,a.state,p.status AS payment_status,p.reviewed_at FROM ethn.extensions e JOIN ethn.extension_items i ON i.extension_id=e.id JOIN ethn.court_allocations a ON a.extension_item_id=i.id JOIN ethn.payments p ON p.extension_id=e.id WHERE e.id=$1",[ext3.extensionId])).rows[0],{status:"expired",state:"expired",payment_status:"exception",reviewed_at:null});
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1",[bookingId])).rows[0].status,"confirmed");
  } finally { await admin.query("DELETE FROM ethn.extensions WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash=$1)",[actor]).catch(()=>{}); await Promise.all([pool.end(),admin.end()]); }
});

test("extension proof schema exists on isolated full chain",{skip:!url},async()=>{
  const pool=new Pool({connectionString:url});
  try {
    const result=await pool.query("SELECT to_regclass('ethn.extension_proofs') AS proofs, (SELECT count(*) FROM pg_constraint WHERE conname='payments_extension_proof_fk') AS proof_fk");
    assert.ok(result.rows[0].proofs);
    assert.equal(Number(result.rows[0].proof_fk),1);
  } finally { await pool.end(); }
});
