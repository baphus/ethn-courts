import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { ethnAuditDateForTest, getEthnAuditRead, projectEthnAuditRow } from "../src/lib/admin/ethn-audit-read";

const actor = "00000000-0000-4000-8000-000000000041";
test("audit projection allowlists fields, actions and actor identity", () => {
  const hostile = { id:"9007199254740993", created_at:new Date("2026-11-21T00:00:00Z"), action:"checkout", actor:"secret-owner-hash", booking_id:actor, detail:{total:"125.50",settingsVersion:"7",ownerHash:"leak",trackingToken:"leak"} };
  const row = projectEthnAuditRow(hostile, new Set());
  assert.deepEqual(row, { id:"9007199254740993",occurredAt:"2026-11-21T00:00:00.000Z",action:"checkout",label:"Booking checkout",actorLabel:"Customer",actorId:null,bookingId:actor,summary:"Booking checkout created",detail:{total:"125.50",settingsVersion:"7"} });
  const unknown = projectEthnAuditRow({...hostile,action:"future.secret",detail:{secret:"leak"}}, new Set([actor]));
  assert.equal(unknown.action,"unknown"); assert.equal(unknown.actorLabel,"System"); assert.equal(unknown.actorId,null);
});
test("audit projection distinguishes historical staff, customer and unknown actors", () => {
  const row = {id:"1",created_at:new Date(0),action:"walkin.create",actor,booking_id:null,detail:{courtId:"1",total:"900",method:"GCash"}};
  assert.equal(projectEthnAuditRow(row,new Set([actor])).actorLabel,"Staff");
  assert.deepEqual(projectEthnAuditRow(row,new Set()).detail,{courtId:"1"});
  assert.equal(projectEthnAuditRow({...row,actor:"customerhash"},new Set()).actorLabel,"System");
});
test("date parser rejects impossible dates and resolves Manila midnight", () => {
  assert.equal(ethnAuditDateForTest("2026-11-21").toISOString(),"2026-11-20T16:00:00.000Z");
  assert.throws(()=>ethnAuditDateForTest("2026-02-30"),/INVALID_INPUT/);
});

const url=process.env.ETHN_AUDIT_READ_TEST_DATABASE_URL, adminUrl=process.env.ETHN_AUDIT_READ_TEST_ADMIN_URL;
test("audit owner read contract and restricted DB grants",{skip:!url||!adminUrl},async()=>{
  const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:adminUrl});
  const owner=randomUUID(),staff=randomUUID(),disabled=randomUUID(),booking=randomUUID();let inserted=false;
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',true),($3,'owner',false)",[owner,staff,disabled]);
    const privileges=(await admin.query("SELECT has_column_privilege('ethn_checkout','ethn.audit','detail','SELECT') AS detail,has_table_privilege('ethn_checkout','ethn.audit','UPDATE') AS upd,has_table_privilege('ethn_checkout','ethn.audit','DELETE') AS del,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='ethn_checkout'")).rows[0];assert.deepEqual(privileges,{detail:true,upd:false,del:false,rolsuper:false,rolbypassrls:false});
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES($1,'audit-test','2026-11-21','held',clock_timestamp()+interval '10 minutes',10,1)",[booking]);
    await admin.query("INSERT INTO ethn.audit(booking_id,actor,action,detail,created_at) VALUES($1,$2,'checkout',$3::jsonb,'2026-11-20T16:00:00Z'),($1,'customerhash','future.secret','{\"secret\":\"hidden\"}','2026-11-21T15:59:59Z')",[booking,owner,JSON.stringify({total:"10.00",settingsVersion:"1",hash:"no"})]);inserted=true;
    const service={connect:()=>pool.connect()},verifier=async()=>owner;
    const result=await getEthnAuditRead(service,verifier,new URL("http://local/api?from=2026-11-21&to=2026-11-21"));
    assert.equal(result.total,2);const checkout=result.rows.find(row=>row.action==='checkout')!;assert.equal(checkout.actorLabel,"Staff");assert.equal(checkout.actorId,owner);assert.deepEqual(checkout.detail,{total:"10.00",settingsVersion:"1"});
    await assert.rejects(getEthnAuditRead(service,async()=>staff,new URL("http://local/api")),/FORBIDDEN/);await assert.rejects(getEthnAuditRead(service,async()=>disabled,new URL("http://local/api")),/FORBIDDEN/);await assert.rejects(getEthnAuditRead(service,async()=>null,new URL("http://local/api")),/UNAUTHENTICATED/);
    await assert.rejects(getEthnAuditRead(service,verifier,new URL("http://local/api?page=1001")),/INVALID_INPUT/);
    await assert.rejects(getEthnAuditRead(service,verifier,new URL("http://local/api?q=future.secret")),/INVALID_INPUT/);
    const filtered=await getEthnAuditRead(service,verifier,new URL("http://local/api?action=checkout"));assert.equal(filtered.total,1);assert.equal(filtered.rows[0].action,"checkout");
    const unknown=result.rows.find(row=>row.action==='unknown')!;assert.deepEqual(unknown.detail,{});
  } finally {
    if(inserted) await admin.query("DELETE FROM ethn.audit WHERE booking_id=$1",[booking]);
    await admin.query("DELETE FROM ethn.bookings WHERE id=$1",[booking]);await admin.query("DELETE FROM ethn.staff_access WHERE user_id=ANY($1::uuid[])",[[owner,staff,disabled]]);await pool.end();await admin.end();
  }
});
