import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { createEthnBlock, createEthnBlocks } from "../src/lib/admin/ethn-calendar";

const actor="00000000-0000-4000-8000-000000000031";
const input={courtIds:["1","2"],startsAt:"2026-11-23T02:00:00.000Z",endsAt:"2026-11-23T03:00:00.000Z",reason:" Maintenance ",kind:"maintenance"};
function database(options:{conflict?:boolean;inactive?:boolean;failSecond?:boolean}={}) {
  const queries:{sql:string;values:unknown[]}[]=[];
  let inserts=0;
  const client={
    async query(sql:string,values:unknown[]=[]) {
      queries.push({sql,values});
      if(sql.startsWith("SELECT user_id")) return {rows:[{user_id:actor}]};
      if(sql.startsWith("SELECT anchor_minutes")) return {rows:[{anchor_minutes:420,horizon_days:30}]};
      if(sql.startsWith("SELECT active")) return {rows:(values[0] as string[]).map(()=>({active:!options.inactive}))};
      if(sql.startsWith("SELECT clock_timestamp")) return {rows:[{now:new Date("2026-11-22T01:00:00.000Z")}]};
      if(sql.startsWith("SELECT 1 FROM ethn.court_allocations")) return {rows:options.conflict?[{}]:[]};
      if(sql.startsWith("INSERT INTO ethn.court_blocks")&&++inserts===2&&options.failSecond) throw {code:"23P01"};
      return {rows:[]};
    },
    release() {},
  };
  return {pool:{connect:async()=>client} as unknown as Pick<Pool,"connect">,queries};
}

test("multi-court closures create allocations and audit rows in one transaction",async()=>{
  const db=database();
  const result=await createEthnBlocks(db.pool,async()=>actor,input);
  assert.deepEqual(result.blocks.map(b=>b.courtId),["1","2"]);
  assert.ok(result.blocks.every(b=>b.reason==="Maintenance"));
  assert.equal(new Set(result.blocks.map(b=>b.id)).size,2);
  assert.equal(db.queries.filter(q=>q.sql.startsWith("INSERT INTO ethn.court_allocations")).length,2);
  assert.equal(db.queries.filter(q=>q.sql.startsWith("INSERT INTO ethn.audit")).length,2);
  assert.deepEqual(db.queries.find(q=>q.sql.startsWith("SELECT 1 FROM ethn.court_allocations"))?.values[0],["1","2"]);
  assert.equal(db.queries.at(-1)?.sql,"COMMIT");
});

test("conflicting or inactive court rejects entire closure before inserts",async()=>{
  for(const options of [{conflict:true},{inactive:true}]) {
    const db=database(options);
    await assert.rejects(createEthnBlocks(db.pool,async()=>actor,input),options.conflict?/SLOT_TAKEN/:/COURT_NOT_FOUND/);
    assert.equal(db.queries.at(-1)?.sql,"ROLLBACK");
    assert.equal(db.queries.some(q=>q.sql.startsWith("INSERT")),false);
  }
});

test("late exclusion failure rolls back previous court inserts",async()=>{
  const db=database({failSecond:true});
  await assert.rejects(createEthnBlocks(db.pool,async()=>actor,input),/SLOT_TAKEN/);
  assert.equal(db.queries.at(-1)?.sql,"ROLLBACK");
  assert.equal(db.queries.some(q=>q.sql==="COMMIT"),false);
});

test("multi-court closure rejects malformed court lists before database access",async()=>{
  const db=database();
  for(const courtIds of [[],["1","1"],["0"],["9223372036854775808"],[1],Array.from({length:101},(_,i)=>String(i+1)),"1"]) {
    await assert.rejects(createEthnBlocks(db.pool,async()=>actor,{...input,courtIds}),/INVALID_INPUT/);
  }
  await assert.rejects(createEthnBlocks(db.pool,async()=>actor,{...input,courtId:"1"}),/INVALID_INPUT/);
  assert.equal(db.queries.length,0);
});

test("single-court closure callers keep original response shape",async()=>{
  const db=database();
  const {courtIds,...fields}=input;
  const result=await createEthnBlock(db.pool,async()=>actor,{...fields,courtId:courtIds[0]});
  assert.deepEqual(Object.keys(result).sort(),["id","courtId","startsAt","endsAt","reason","kind"].sort());
  assert.equal(result.courtId,"1");
  assert.equal(db.queries.at(-1)?.sql,"COMMIT");
});
