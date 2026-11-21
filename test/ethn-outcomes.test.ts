import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { completeDueBookings, completeDueBookingsFromCron, setNoShow } from "../src/lib/admin/ethn-outcomes";

const url=process.env.ETHN_OUTCOMES_TEST_DATABASE_URL;
test("ETHN due completion and correctable no-show use staff transactions",{skip:!url},async()=>{
  const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:process.env.ETHN_OUTCOMES_TEST_ADMIN_URL});
  const owner="00000000-0000-4000-8000-000000000081",staff="00000000-0000-4000-8000-000000000082",outsider="00000000-0000-4000-8000-000000000083";
  const ids={due:randomUUID(),future:randomUUID(),pending:randomUUID(),notlast:randomUUID(),done:randomUUID()};
  async function booking(id:string,status:string,start:string,end:string) {
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES($1,'outcomes-fixture','2026-11-20',$2::text,clock_timestamp(),0,1)",[id,status]);
    const item=randomUUID(),court=(await admin.query("SELECT id FROM ethn.courts ORDER BY id LIMIT 1")).rows[0].id;
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,$3,$4,$5,0,EXTRACT(EPOCH FROM ($5::timestamptz-$4::timestamptz))::int/60,0,30,30)",[item,id,court,start,end]);
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) SELECT $1,id,court_id,starts_at,ends_at,$3::text FROM ethn.booking_items WHERE id=$2",[randomUUID(),item,status==='confirmed'?'confirmed':'pending']);
  }
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',true)",[owner,staff]);
    const past='2020-01-01T00:00:00Z',future='2027-01-01T00:00:00Z';
    await booking(ids.due,'confirmed','2020-01-01T00:00:00Z','2020-01-01T01:00:00Z'); await booking(ids.future,'confirmed','2026-12-31T00:00:00Z',future);
    await booking(ids.pending,'pending','2020-01-03T00:00:00Z','2020-01-03T01:00:00Z'); await booking(ids.notlast,'confirmed','2020-01-04T00:00:00Z','2020-01-04T01:00:00Z');
    const secondCourt=(await admin.query("INSERT INTO ethn.courts(name) VALUES('Outcomes fixture court') RETURNING id")).rows[0].id;
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) SELECT $1,$2,$3,starts_at,ends_at+interval '1 hour',0,EXTRACT(EPOCH FROM (ends_at+interval '1 hour'-starts_at))::int/60,0,30,30 FROM ethn.booking_items WHERE booking_id=$2",[randomUUID(),ids.notlast,secondCourt]);
    await booking(ids.done,'completed','2020-01-05T00:00:00Z','2020-01-05T01:00:00Z');
    assert.deepEqual((await completeDueBookings(pool,async()=>staff)).completed.sort(),[ids.due,ids.notlast].sort());
    const state=await admin.query("SELECT b.id,b.status,a.state FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id WHERE b.id=ANY($1::uuid[]) ORDER BY b.id",[Object.values(ids)]);
    assert.equal(state.rows.find(r=>r.id===ids.future).status,'confirmed');assert.equal(state.rows.find(r=>r.id===ids.pending).status,'pending');assert.equal(state.rows.find(r=>r.id===ids.notlast).status,'completed');
    assert.equal(state.rows.find(r=>r.id===ids.due).status,'completed');assert.equal(state.rows.find(r=>r.id===ids.due).state,'completed');
    await assert.rejects(completeDueBookings(pool,async()=>outsider),/FORBIDDEN/);
    const revoke=await admin.connect(); await revoke.query("BEGIN"); await revoke.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 FOR UPDATE",[staff]);
    const inFlight=completeDueBookings(pool,async()=>staff); await new Promise(resolve=>setTimeout(resolve,50)); await revoke.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1",[staff]); await revoke.query("COMMIT"); revoke.release();
    await assert.rejects(inFlight,/FORBIDDEN/); await admin.query("UPDATE ethn.staff_access SET enabled=true WHERE user_id=$1",[staff]);
    const cronResult=await completeDueBookingsFromCron(pool); assert.deepEqual(cronResult.completed,[]);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.audit WHERE booking_id=$1 AND action='booking_completed' AND actor='system:completion'",[ids.future])).rows[0].n,0);
    assert.equal((await setNoShow(pool,async()=>staff,ids.due,{noShow:true,expectedNoShow:false,reason:'Absent'})).changed,true);
    await assert.rejects(setNoShow(pool,async()=>staff,ids.due,{noShow:false,expectedNoShow:false,reason:'Stale'}),/STALE_OUTCOME/);
    assert.equal((await setNoShow(pool,async()=>staff,ids.due,{noShow:false,expectedNoShow:true,reason:'Corrected'})).changed,true);
    await assert.rejects(setNoShow(pool,async()=>staff,ids.future,{noShow:true,expectedNoShow:false,reason:'No'}),/NOT_COMPLETED/);
    await assert.rejects(setNoShow(pool,async()=>outsider,ids.due,{noShow:true,expectedNoShow:false,reason:'No'}),/FORBIDDEN/);
    const audits=await admin.query("SELECT detail FROM ethn.audit WHERE booking_id=$1 AND action='booking_no_show_changed' ORDER BY id",[ids.due]);
    assert.deepEqual(audits.rows.map(r=>r.detail),[{from:false,to:true,reason:'Absent'},{from:true,to:false,reason:'Corrected'}]);
    assert.equal((await admin.query("SELECT no_show FROM ethn.bookings WHERE id=$1",[ids.due])).rows[0].no_show,false);
  } finally {
    await admin.query("DELETE FROM ethn.audit WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='outcomes-fixture')");
    await admin.query("DELETE FROM ethn.court_allocations WHERE item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='outcomes-fixture'))");
    await admin.query("DELETE FROM ethn.booking_items WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='outcomes-fixture')");
    await admin.query("DELETE FROM ethn.bookings WHERE owner_hash='outcomes-fixture'");
    await admin.query("DELETE FROM ethn.staff_access WHERE user_id=ANY($1::uuid[])",[[owner,staff]]);await pool.end();await admin.end();
  }
});
