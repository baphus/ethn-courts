import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createOpenPlay, editOpenPlay, listPublicOpenPlays, removeOpenPlay } from "../src/lib/admin/ethn-open-plays";

const url=process.env.ETHN_OPEN_PLAYS_TEST_DATABASE_URL;
test("open plays atomically allocate multiple courts and expose only public event data",{skip:!url},async()=>{
  const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:process.env.ETHN_OPEN_PLAYS_TEST_ADMIN_URL});
  const owner="00000000-0000-4000-8000-000000000091",staff="00000000-0000-4000-8000-000000000092";
  const start=new Date(Date.now()+2*86400000);start.setUTCHours(10,0,0,0);const end=new Date(start.getTime()+3600000);
  const input={courtIds:["1","2"],title:"Open play",description:"Community play",fee:"0.00",startsAt:start.toISOString(),endsAt:end.toISOString()};
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'owner',true)",[owner,staff]);
    await admin.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1",[staff]);
    await assert.rejects(createOpenPlay(pool,async()=>staff,input),/FORBIDDEN/);
    await admin.query("UPDATE ethn.staff_access SET enabled=true WHERE user_id=$1",[staff]);
    for(const bad of [{...input,courtIds:[]},{...input,fee:"-1"},{...input,startsAt:"invalid"},{...input,extra:true}]) await assert.rejects(createOpenPlay(pool,async()=>owner,bad),/INVALID_INPUT/);
    const created=await createOpenPlay(pool,async()=>owner,input);assert.equal(created.fee,"0.00");
    const events=await listPublicOpenPlays(pool);assert.ok(events.some(e=>e.id===created.id));assert.deepEqual(Object.keys(events.find(e=>e.id===created.id)!).sort(),["courtIds","courtNames","description","endsAt","fee","id","startsAt","title","version"]);
    await admin.query("UPDATE ethn.open_plays SET starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[created.id]);
    assert.ok((await listPublicOpenPlays(pool)).some(e=>e.id===created.id));
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.court_allocations WHERE block_id IN (SELECT id FROM ethn.court_blocks WHERE open_play_id=$1) AND state='confirmed'",[created.id])).rows[0].n,2);
    assert.deepEqual(events.find(e=>e.id===created.id)!.courtIds,["1","2"]);assert.equal(events.find(e=>e.id===created.id)!.version,1);
    const edited=await editOpenPlay(pool,async()=>owner,created.id,{...input,title:"Edited open play",expectedVersion:1});assert.equal(edited.version,2);
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.court_allocations WHERE block_id IN (SELECT id FROM ethn.court_blocks WHERE open_play_id=$1) AND state='released'",[created.id])).rows[0].n,2);
    await assert.rejects(editOpenPlay(pool,async()=>owner,created.id,{...input,expectedVersion:1}),/STALE_OPEN_PLAY/);
    const before=(await admin.query("SELECT title,version FROM ethn.open_plays WHERE id=$1",[created.id])).rows[0];
    const conflict=await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES($1,'open-play-conflict','2026-11-21','confirmed',clock_timestamp(),0,1) RETURNING id",[randomUUID()]);
    const conflictStart=new Date(start.getTime()+2*3600000),conflictEnd=new Date(conflictStart.getTime()+3600000);
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,1,$3,$4,0,60,0,30,30)",[randomUUID(),conflict.rows[0].id,conflictStart,conflictEnd]);
    const bookingItem=(await admin.query("SELECT id FROM ethn.booking_items WHERE booking_id=$1",[conflict.rows[0].id])).rows[0].id;
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) VALUES($1,$2,1,$3,$4,'confirmed')",[randomUUID(),bookingItem,conflictStart,conflictEnd]);
    await assert.rejects(editOpenPlay(pool,async()=>owner,created.id,{...input,startsAt:conflictStart.toISOString(),endsAt:conflictEnd.toISOString(),title:"Should roll back",expectedVersion:2}),/SLOT_TAKEN/);
    assert.deepEqual((await admin.query("SELECT title,version FROM ethn.open_plays WHERE id=$1",[created.id])).rows[0],before);
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.court_allocations WHERE item_id=$1 AND state='confirmed'",[bookingItem])).rows[0].n,1);
    await admin.query("DELETE FROM ethn.court_allocations WHERE item_id=$1",[bookingItem]);await admin.query("DELETE FROM ethn.booking_items WHERE id=$1",[bookingItem]);await admin.query("DELETE FROM ethn.bookings WHERE id=$1",[conflict.rows[0].id]);
    await removeOpenPlay(pool,async()=>owner,created.id);await removeOpenPlay(pool,async()=>owner,created.id);
    assert.ok(!(await listPublicOpenPlays(pool)).some(e=>e.id===created.id));
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.court_allocations WHERE block_id IN (SELECT id FROM ethn.court_blocks WHERE open_play_id=$1) AND state='released'",[created.id])).rows[0].n,4);
    const grants=(await pool.query("SELECT has_table_privilege(current_user,'ethn.open_plays','DELETE') d,has_column_privilege(current_user,'ethn.open_plays','created_by','SELECT') s,has_column_privilege(current_user,'ethn.open_plays','version','UPDATE') v")).rows[0];
    assert.equal(grants.d,false);assert.equal(grants.s,false);assert.equal(grants.v,true);
  } finally {
    await admin.query("DELETE FROM ethn.audit WHERE actor=$1",[owner]);
    await admin.query("DELETE FROM ethn.court_allocations WHERE block_id IN (SELECT id FROM ethn.court_blocks WHERE created_by=ANY($1::uuid[]))",[[owner,staff]]);
    await admin.query("DELETE FROM ethn.court_blocks WHERE created_by=ANY($1::uuid[])",[[owner,staff]]);
    await admin.query("DELETE FROM ethn.open_plays WHERE created_by=ANY($1::uuid[])",[[owner,staff]]);
    await admin.query("DELETE FROM ethn.staff_access WHERE user_id=$1",[staff]);
    await admin.query("DELETE FROM ethn.staff_access WHERE user_id=$1",[owner]);await pool.end();await admin.end();
  }
});
