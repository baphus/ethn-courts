import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { createCourt, listCourts } from "../src/lib/admin/ethn-venue";

const url=process.env.ETHN_VENUE_TEST_DATABASE_URL;
test("owner court creation is inactive, idempotent and least-privileged",{skip:!url},async()=>{
 const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:process.env.ETHN_VENUE_TEST_ADMIN_URL}),owner="00000000-0000-4000-8000-000000000041",staff="00000000-0000-4000-8000-000000000042",verify=async()=>owner;
 try {
  await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',true)",[owner,staff]);
  await assert.rejects(createCourt(pool,async()=>staff,{name:"Unauthorized",idempotencyKey:"denied"}),/FORBIDDEN/);
  await assert.rejects(listCourts(pool,async()=>staff),/FORBIDDEN/);
  for(const input of [{name:" "},{name:"x".repeat(101)},{name:"Good",description:"x".repeat(1001)},{name:"Good",extra:true},{name:"Good",idempotencyKey:"bad\nkey"}]) await assert.rejects(createCourt(pool,verify,{idempotencyKey:"invalid",...input}),/INVALID_INPUT/);
  const input={name:"  New Court  ",description:"  private facility  ",idempotencyKey:"court-create-test"};
  const saved=await createCourt(pool,verify,input); assert.deepEqual(saved,{id:saved.id,name:"New Court",description:"private facility",active:false});
  assert.deepEqual(await createCourt(pool,verify,input),saved);
  await assert.rejects(createCourt(pool,verify,{...input,name:"Changed"}),/IDEMPOTENCY_MISMATCH/);
  await assert.rejects(createCourt(pool,verify,{name:saved.name,idempotencyKey:"another-key"}),/NAME_COLLISION/);
  const listed=await listCourts(pool,verify); assert.ok(listed.some(c=>c.id===saved.id&&c.active===false));
  assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.court_hours WHERE court_id=$1",[saved.id])).rows[0].n,0);
  assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.court_allocations WHERE court_id=$1",[saved.id])).rows[0].n,0);
  assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.audit WHERE actor=$1 AND action='court.create' AND detail->>'courtId'=$2",[owner,saved.id])).rows[0].n,1);
  const grants=(await pool.query("SELECT has_table_privilege(current_user,'ethn.courts','UPDATE') u,has_table_privilege(current_user,'ethn.courts','DELETE') d,has_column_privilege(current_user,'ethn.courts','name','INSERT') n,has_column_privilege(current_user,'ethn.courts','description','INSERT') description,has_column_privilege(current_user,'ethn.courts','active','INSERT') active")).rows[0]; assert.deepEqual(grants,{u:false,d:false,n:true,description:true,active:true});
 } finally { await admin.query("DELETE FROM ethn.idempotency WHERE owner_hash=$1 AND operation='court.create'",[createHash("sha256").update(owner).digest("hex")]); await admin.query("DELETE FROM ethn.audit WHERE actor=$1 AND action='court.create'",[owner]); await admin.query("DELETE FROM ethn.courts WHERE name='New Court'"); await admin.query("DELETE FROM ethn.staff_access WHERE user_id=ANY($1::uuid[])",[[owner,staff]]); await pool.end(); await admin.end(); }
});
