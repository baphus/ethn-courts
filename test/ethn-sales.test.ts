import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { saleReceivedFields } from "../src/lib/admin/sale-details";
import { changeSale, createSale, listSales } from "../src/lib/admin/ethn-sales";
import { getFinance } from "../src/lib/admin/ethn-finance";

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
  const id = "00000000-0000-4000-8000-000000000044";
  const verify = async () => assert.fail("should not authorize invalid input");
  await assert.rejects(changeSale(pool, verify, id, "DELETE", { revision: "invalid" }), /INVALID_INPUT/);
  await assert.rejects(changeSale(pool, verify, id, "PATCH", { ...fields, revision: null }), /INVALID_INPUT/);
  for (const filters of [{ page: 1001 }, { limit: 0 }, { method: "card" }, { category: "unknown" }, { q: "x".repeat(101) }, { q: "\0" }]) {
   await assert.rejects(listSales(pool, async () => assert.fail("should not authorize invalid input"), null, null, filters), /INVALID_INPUT/);
  }
 } finally { await pool.end(); }
});

const url=process.env.ETHN_SALES_TEST_DATABASE_URL;
test("sales CRUD preserves old corrections and updates finance on restricted database",{skip:!url},async()=>{
 const pool=new Pool({connectionString:url}), admin=new Pool({connectionString:process.env.ETHN_SALES_TEST_ADMIN_URL});const owner="00000000-0000-4000-8000-000000000041",staff="00000000-0000-4000-8000-000000000042",now=new Date().toISOString();
 try{
  await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',false)",[owner,staff]);
  const sale=await createSale(pool,async()=>owner,{itemName:" Court snacks ",category:"Food & Drinks",description:null,note:null,amount:"100.05",method:"cash",receivedAt:now,idempotencyKey:"sale-create-1"});assert.equal(sale.amount,"100.05");assert.deepEqual(await createSale(pool,async()=>owner,{itemName:"Court snacks",category:"Food & Drinks",description:null,note:null,amount:"100.05",method:"cash",receivedAt:now,idempotencyKey:"sale-create-1"}),sale);
  await assert.rejects(createSale(pool,async()=>owner,{itemName:"x",category:"Other",description:null,note:null,amount:"0.00",method:"cash",receivedAt:now,idempotencyKey:"bad"}),/INVALID_INPUT/);
  await assert.rejects(createSale(pool,async()=>owner,{itemName:"x",category:"Other",description:null,note:null,amount:"1.001",method:"cash",receivedAt:now,idempotencyKey:"bad"}),/INVALID_INPUT/);
  await assert.rejects(listSales(pool,async()=>staff), /FORBIDDEN/);
  await admin.query(`INSERT INTO ethn.sale_corrections(id,sale_id,amount_delta,cash_delta,gcash_delta,reason,created_by)
    VALUES(gen_random_uuid(),$1,-79.95,-100.05,20.10,'Historical correction fixture',$2)`, [sale.id, owner]);
  const ownerRows=await listSales(pool,async()=>owner,null,null,{method:"gcash",category:"Food & Drinks",q:" COURT SNACKS ",limit:1});assert.equal(ownerRows?.total,1);assert.equal(ownerRows?.rows[0].amount,"20.10");assert.equal(ownerRows?.rows[0].itemName,"Court snacks");assert.equal(ownerRows?.rows[0].category,"Food & Drinks");assert.equal(ownerRows?.rows[0].description,null);
  const nextPage=await listSales(pool,async()=>owner,null,null,{method:"gcash",q:"court snacks",page:2,limit:1});assert.equal(nextPage?.total,1);assert.deepEqual(nextPage?.rows,[]);
  const wrongMethod=await listSales(pool,async()=>owner,null,null,{method:"cash",q:"court snacks"});assert.equal(wrongMethod?.total,0);
   const verify = async () => owner;
   const date = saleReceivedFields(new Date(now)).date;
   const edit = { itemName: "Updated sale", category: "Other", description: null, note: null, amount: "35.00", method: "cash", receivedAt: now, revision: null };
   await assert.rejects(changeSale(pool, async () => staff, sale.id, "DELETE", { revision: null }), /FORBIDDEN/);
   await changeSale(pool, verify, sale.id, "PATCH", edit);
   await assert.rejects(changeSale(pool, verify, sale.id, "DELETE", { revision: null }), /SALE_STALE/);
   const updated = (await listSales(pool, verify, null, null, { q: "Updated sale" }))?.rows[0];
   assert.equal(updated?.amount, "35.00");
   assert.equal(updated?.method, "cash");
   assert.ok(updated?.revision);
   assert.equal((await getFinance(pool, verify, date, date)).components.manualSalesAfterCorrections, "35.00");
   await changeSale(pool, verify, sale.id, "DELETE", { revision: updated.revision });
   assert.equal((await listSales(pool, verify, null, null, { q: "Updated sale" }))?.total, 0);
   assert.equal((await getFinance(pool, verify, date, date)).components.manualSalesAfterCorrections, "0.00");
   assert.equal((await admin.query("SELECT count(*)::int AS count FROM ethn.sale_corrections WHERE sale_id=$1", [sale.id])).rows[0].count, 1);
   assert.deepEqual((await admin.query("SELECT action FROM ethn.audit WHERE detail->>'saleId'=$1 AND action IN ('sale.edit','sale.delete') ORDER BY id", [sale.id])).rows.map(row => row.action), ["sale.edit", "sale.delete"]);
  const grants=await pool.query("SELECT has_table_privilege(current_user,'ethn.sales','UPDATE') can_update,has_table_privilege(current_user,'ethn.sale_corrections','UPDATE') correction_update");assert.equal(grants.rows[0].can_update,false);assert.equal(grants.rows[0].correction_update,false);
 }finally{await pool.end();await admin.end();}
});
