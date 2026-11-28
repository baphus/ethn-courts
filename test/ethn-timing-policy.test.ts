import test from "node:test";import assert from "node:assert/strict";import {Pool} from "pg";import {randomUUID} from "node:crypto";import {getTimingPolicy,putTimingPolicy} from "../src/lib/admin/ethn-timing-policy";
const url=process.env.ETHN_TIMING_TEST_DATABASE_URL;

test("saving a timing change does not read or rewrite reservations", async () => {
 const calls: string[] = [];
 const pool = { connect: async () => ({
  query: async (sql: string) => {
   calls.push(sql);
   assert.doesNotMatch(sql, /ethn\.(bookings|booking_items|court_allocations)\b/);
   if (sql.includes("FROM ethn.staff_access")) return { rows: [{}] };
   if (sql.includes("FROM ethn.settings")) return { rows: [{ version: "1", interval_minutes: 30, minimum_minutes: 30, anchor_minutes: 420, horizon_days: 7, hold_minutes: 10 }] };
   if (sql.startsWith("UPDATE ethn.settings")) return { rows: [{ version: "2" }] };
   return { rows: [] };
  },
  release() {},
 }) } as unknown as Pick<Pool, "connect">;
 const saved = await putTimingPolicy(pool, async () => "00000000-0000-4000-8000-000000000051", {
  version: "1", intervalMinutes: 60, minimumMinutes: 120, anchorMinutes: 360, horizonDays: 1, holdMinutes: 12,
 });
 assert.deepEqual(saved, { version: "2" });
 assert.equal(calls.at(-1), "COMMIT");
});
test("owner can change timing settings while live inventory stays unchanged",{skip:!url},async()=>{const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:process.env.ETHN_TIMING_TEST_ADMIN_URL}),owner="00000000-0000-4000-8000-000000000051",staff="00000000-0000-4000-8000-000000000052",verify=async()=>owner;let courtId:string|undefined;
try{await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',false)",[owner,staff]);const original=await getTimingPolicy(pool,verify);assert.equal(original.intervalMinutes,30);await assert.rejects(getTimingPolicy(pool,async()=>staff),/FORBIDDEN/);await assert.rejects(putTimingPolicy(pool,async()=>staff,{...original,holdMinutes:11}),/FORBIDDEN/);
for(const change of [{intervalMinutes:45},{minimumMinutes:0},{minimumMinutes:31},{minimumMinutes:1441},{anchorMinutes:1440},{horizonDays:366},{holdMinutes:61},{unknown:true}])await assert.rejects(putTimingPolicy(pool,verify,{...original,...change}),/INVALID_INPUT/);
await assert.rejects(putTimingPolicy(pool,verify,{...original,version:"999"}),/STALE_VERSION/);
const saved=await putTimingPolicy(pool,verify,{...original,holdMinutes:11});assert.equal(saved.version,String(Number(original.version)+1));await assert.rejects(putTimingPolicy(pool,verify,{...original,holdMinutes:12}),/STALE_VERSION/);
const current=await getTimingPolicy(pool,verify),court=(await admin.query("SELECT id::text FROM ethn.courts ORDER BY id LIMIT 1")).rows[0];courtId=court.id;const bookingId=randomUUID(),itemId=randomUUID(),start=new Date(Date.now()+3600_000),end=new Date(start.getTime()+3600_000);await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES($1,'timing-fixture',current_date,'confirmed',clock_timestamp()+interval '1 hour',0,1)",[bookingId]);await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,$3,$4,$5,0,60,0,30,30)",[itemId,bookingId,courtId,start,end]);await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,$3,$4,$5,'confirmed')",[randomUUID(),itemId,courtId,start,end]);
 const readInventory=async()=> (await admin.query("SELECT to_jsonb(b) AS booking,to_jsonb(i) AS item,to_jsonb(a) AS allocation FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id WHERE b.id=$1",[bookingId])).rows;
 const inventory=await readInventory();assert.equal(inventory.length,1);
 await assert.rejects(putTimingPolicy(pool,verify,{...current,anchorMinutes:0}),/INVALID_SCHEDULE/);
 const next={...current,intervalMinutes:60,minimumMinutes:120,anchorMinutes:360,horizonDays:1,holdMinutes:12};
 const changed=await putTimingPolicy(pool,verify,next);assert.equal(changed.version,String(BigInt(current.version)+BigInt(1)));
 const unchanged={...next,version:changed.version};assert.deepEqual(await getTimingPolicy(pool,verify),unchanged);assert.deepEqual(await readInventory(),inventory);
 assert.equal((await putTimingPolicy(pool,verify,unchanged)).version,unchanged.version);
 const audit=await admin.query("SELECT count(*)::int n FROM ethn.audit WHERE actor=$1 AND action='timing.update'",[owner]);assert.equal(audit.rows[0].n,2);const grants=(await pool.query("SELECT has_column_privilege(current_user,'ethn.settings','interval_minutes','UPDATE') i,has_column_privilege(current_user,'ethn.settings','minimum_minutes','UPDATE') m,has_table_privilege(current_user,'ethn.settings','UPDATE') broad")).rows[0];assert.deepEqual(grants,{i:true,m:true,broad:false});
}finally{if(courtId){await admin.query("DELETE FROM ethn.court_allocations WHERE item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='timing-fixture'))");await admin.query("DELETE FROM ethn.booking_items WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='timing-fixture')");await admin.query("DELETE FROM ethn.bookings WHERE owner_hash='timing-fixture'");}await admin.query("DELETE FROM ethn.audit WHERE actor=$1 AND action='timing.update'",[owner]);await admin.query("DELETE FROM ethn.staff_access WHERE user_id=ANY($1::uuid[])",[[owner,staff]]);await pool.end();await admin.end();}});
