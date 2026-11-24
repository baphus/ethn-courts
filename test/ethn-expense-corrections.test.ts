import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { correctExpense, listExpenseCorrections } from "../src/lib/admin/ethn-expense-corrections";
import { manilaDateStr } from "../src/lib/booking/slots";

const url=process.env.ETHN_FINANCE_TEST_DATABASE_URL;
test("append-only owner expense corrections, optimistic concurrency and idempotency",{skip:!url},async()=>{
 const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:process.env.ETHN_FINANCE_TEST_ADMIN_URL}); const owner="00000000-0000-4000-8000-000000000041",staff="00000000-0000-4000-8000-000000000042",verify=async()=>owner;
 let expenseId="";
 try {
  await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',false)",[owner,staff]); expenseId=randomUUID();
  await admin.query("INSERT INTO ethn.expenses(id,title,category,amount,paid_date,created_by) VALUES($1,'Correction test','Other',10,(now() at time zone 'Asia/Manila')::date,$2)",[expenseId,owner]);
  const base={amountDelta:"-0.05",reason:"Receipt total typo",correctionDate:manilaDateStr(new Date()),expectedPreviousCorrectionId:null,idempotencyKey:"correction-1"};
  await assert.rejects(correctExpense(pool,async()=>staff,expenseId,{...base,idempotencyKey:"staff"}),/FORBIDDEN/);
  const first=await correctExpense(pool,verify,expenseId,base); assert.equal(first.amountDelta,"-0.05"); assert.deepEqual(await correctExpense(pool,verify,expenseId,base),first);
  await assert.rejects(correctExpense(pool,verify,expenseId,{...base,reason:"different"}),/IDEMPOTENCY_MISMATCH/);
  await assert.rejects(correctExpense(pool,verify,expenseId,{...base,idempotencyKey:"stale",expectedPreviousCorrectionId:null}),/STALE_CORRECTION/);
  const second=await correctExpense(pool,verify,expenseId,{...base,idempotencyKey:"correction-2",expectedPreviousCorrectionId:first.id});
  const third=await correctExpense(pool,verify,expenseId,{...base,amountDelta:"0.10",idempotencyKey:"correction-3",expectedPreviousCorrectionId:second.id});
  assert.equal(third.previousCorrectionId,second.id);
  const rows=await listExpenseCorrections(pool,verify,expenseId); assert.deepEqual(rows.map(r=>r.amountDelta),["-0.05","-0.05","0.10"]);
  const races=await Promise.allSettled(["race-a","race-b"].map(idempotencyKey=>correctExpense(pool,verify,expenseId,{...base,idempotencyKey,expectedPreviousCorrectionId:third.id})));
  assert.equal(races.filter(r=>r.status==="fulfilled").length,1); assert.equal(races.filter(r=>r.status==="rejected").length,1);
  for(const input of [{amountDelta:"0.00"},{amountDelta:"-11.00"},{correctionDate:"2026-02-30"},{reason:""}]) await assert.rejects(correctExpense(pool,verify,expenseId,{...base,idempotencyKey:randomUUID(),expectedPreviousCorrectionId:(await listExpenseCorrections(pool,verify,expenseId)).at(-1)!.id,...input}),/INVALID_INPUT/);
  await assert.rejects(correctExpense(pool,verify,expenseId,{...base,idempotencyKey:randomUUID(),correctionDate:"2026-02-28",expectedPreviousCorrectionId:(await listExpenseCorrections(pool,verify,expenseId)).at(-1)!.id}),/INVALID_INPUT/);
  await assert.rejects(pool.query("UPDATE ethn.expense_corrections SET reason='x' WHERE id=$1",[first.id])); await assert.rejects(pool.query("DELETE FROM ethn.expense_corrections WHERE id=$1",[first.id]));
  assert.equal((await admin.query("SELECT title,amount::text,paid_date::text FROM ethn.expenses WHERE id=$1",[expenseId])).rows[0].amount,"10.00");
 } finally { if(expenseId) await admin.query("DELETE FROM ethn.expense_corrections WHERE expense_id=$1",[expenseId]); await admin.query("DELETE FROM ethn.expenses WHERE id=$1",[expenseId]); await admin.query("DELETE FROM ethn.staff_access WHERE user_id IN ($1,$2)",[owner,staff]); await pool.end(); await admin.end(); }
});
