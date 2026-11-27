import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { saleReceivedFields } from "../src/lib/admin/sale-details";
import { createSale, listSales, correctSale } from "../src/lib/admin/ethn-sales";

test("received fields roll over together at Manila midnight", () => {
 assert.deepEqual(saleReceivedFields(new Date("2026-11-27T15:59:59Z")), { date: "2026-11-27", time: "23:59" });
 assert.deepEqual(saleReceivedFields(new Date("2026-11-27T16:00:00Z")), { date: "2026-11-28", time: "00:00" });
});

test("sales rejects invalid list parameters before opening a database connection", async () => {
 const pool = new Pool();
 try {
  const fields = { itemName: "Snacks", category: "Food & Drinks", description: null, note: null, amount: "50.00", method: "cash", receivedAt: "2026-11-27T10:00:00.000Z", idempotencyKey: "test" };
  for (const patch of [{ itemName: "   " }, { category: "unknown" }, { description: "x".repeat(161) }]) {
   await assert.rejects(createSale(pool, async () => assert.fail("should not authorize invalid input"), { ...fields, ...patch }), /INVALID_INPUT/);
  }
  for (const filters of [{ page: 1001 }, { limit: 0 }, { method: "card" }, { category: "unknown" }, { q: "x".repeat(101) }, { q: "\0" }]) {
   await assert.rejects(listSales(pool, async () => assert.fail("should not authorize invalid input"), null, null, filters), /INVALID_INPUT/);
  }
 } finally { await pool.end(); }
});

const url=process.env.ETHN_SALES_TEST_DATABASE_URL;
test("paid sales and immutable dated owner corrections on restricted database",{skip:!url},async()=>{
 const pool=new Pool({connectionString:url}), admin=new Pool({connectionString:process.env.ETHN_SALES_TEST_ADMIN_URL});const owner="00000000-0000-4000-8000-000000000041",staff="00000000-0000-4000-8000-000000000042",now=new Date().toISOString();
 try{
  await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',false)",[owner,staff]);
  const sale=await createSale(pool,async()=>owner,{itemName:" Court snacks ",category:"Food & Drinks",description:null,note:null,amount:"100.05",method:"cash",receivedAt:now,idempotencyKey:"sale-create-1"});assert.equal(sale.amount,"100.05");assert.deepEqual(await createSale(pool,async()=>owner,{itemName:"Court snacks",category:"Food & Drinks",description:null,note:null,amount:"100.05",method:"cash",receivedAt:now,idempotencyKey:"sale-create-1"}),sale);
  await assert.rejects(createSale(pool,async()=>owner,{itemName:"x",category:"Other",description:null,note:null,amount:"0.00",method:"cash",receivedAt:now,idempotencyKey:"bad"}),/INVALID_INPUT/);
  await assert.rejects(createSale(pool,async()=>owner,{itemName:"x",category:"Other",description:null,note:null,amount:"1.001",method:"cash",receivedAt:now,idempotencyKey:"bad"}),/INVALID_INPUT/);
  await assert.rejects(listSales(pool,async()=>staff), /FORBIDDEN/);
  const c1=await correctSale(pool,async()=>owner,sale.id,{amount:"95.00",method:"gcash",reason:"Entered method and amount wrong",expectedCorrectionId:null,idempotencyKey:"correction-1"});assert.equal(c1.amountDelta,"-5.05");assert.equal(c1.cashDelta,"-100.05");assert.equal(c1.gcashDelta,"95.00");assert.match(c1.createdAt,/Z$/);
  await assert.rejects(correctSale(pool,async()=>staff,sale.id,{amount:null,method:null,reason:"void",expectedCorrectionId:c1.id,idempotencyKey:"staff-correction"}),/FORBIDDEN/);
  await assert.rejects(correctSale(pool,async()=>owner,sale.id,{amount:null,method:null,reason:"stale",expectedCorrectionId:null,idempotencyKey:"correction-stale"}),/CORRECTION_CONFLICT/);
  const c2=await correctSale(pool,async()=>owner,sale.id,{amount:null,method:null,reason:"Duplicate entry, not cash movement",expectedCorrectionId:c1.id,idempotencyKey:"correction-2"});assert.equal(c2.amountDelta,"-95.00");assert.equal(c2.gcashDelta,"-95.00");
  const c3=await correctSale(pool,async()=>owner,sale.id,{amount:"20.10",method:"cash",reason:"Restore incorrect void as corrected record",expectedCorrectionId:c2.id,idempotencyKey:"correction-3"});assert.equal(c3.amountDelta,"20.10");assert.equal(c3.cashDelta,"20.10");assert.equal(c3.gcashDelta,"0.00");
  const c4=await correctSale(pool,async()=>owner,sale.id,{amount:"20.10",method:"gcash",reason:"Method alone was incorrect",expectedCorrectionId:c3.id,idempotencyKey:"correction-4"});assert.equal(c4.amountDelta,"0.00");assert.equal(c4.cashDelta,"-20.10");assert.equal(c4.gcashDelta,"20.10");
  const ownerRows=await listSales(pool,async()=>owner,null,null,{method:"cash",category:"Food & Drinks",q:" COURT SNACKS ",limit:1});assert.equal(ownerRows?.total,1);assert.equal(ownerRows?.rows[0].corrections.length,4);assert.equal(ownerRows?.rows[0].amount,"100.05");assert.equal(ownerRows?.rows[0].itemName,"Court snacks");assert.equal(ownerRows?.rows[0].category,"Food & Drinks");assert.equal(ownerRows?.rows[0].description,null);
  const nextPage=await listSales(pool,async()=>owner,null,null,{method:"cash",q:"court snacks",page:2,limit:1});assert.equal(nextPage?.total,1);assert.deepEqual(nextPage?.rows,[]);
  const wrongMethod=await listSales(pool,async()=>owner,null,null,{method:"gcash",q:"court snacks"});assert.equal(wrongMethod?.total,0);
  const grants=await pool.query("SELECT has_table_privilege(current_user,'ethn.sales','UPDATE') can_update,has_table_privilege(current_user,'ethn.sale_corrections','UPDATE') correction_update");assert.equal(grants.rows[0].can_update,false);assert.equal(grants.rows[0].correction_update,false);
 }finally{await pool.end();await admin.end();}
});
