import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { addExpense, changeExpense, getFinanceExport, getApprovalFinance, getFinance, listExpenses } from "../src/lib/admin/ethn-finance";

const url=process.env.ETHN_FINANCE_TEST_DATABASE_URL;
test("finance reads and immutable expense entries on fresh restricted database",{skip:!url},async()=>{
  const pool=new Pool({connectionString:url}),admin=new Pool({connectionString:process.env.ETHN_FINANCE_TEST_ADMIN_URL}); const owner="00000000-0000-4000-8000-000000000031",staff="00000000-0000-4000-8000-000000000032",verify=async()=>owner;
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',false)",[owner,staff]);
    await assert.rejects(addExpense(pool,async()=>staff,{title:"x",category:"Other",amount:"1.00",paidDate:"2026-11-20",idempotencyKey:"no"}),/FORBIDDEN/);
    for(const input of [{amount:"0.00"},{amount:"1.001"},{amount:"10000000000.00"},{paidDate:"2026-02-30"},{paidDate:"2099-01-01"},{extra:true}]) await assert.rejects(addExpense(pool,verify,{title:"Test",category:"Other",amount:"1.00",paidDate:"2026-11-20",idempotencyKey:"bad",...input}),/INVALID_INPUT/);
    const input={title:"  Utilities  ",category:"Utilities",amount:"100.25",paidDate:"2026-11-20",idempotencyKey:"finance-test-key"}; const saved=await addExpense(pool,verify,input); assert.equal(saved.amount,"100.25"); assert.deepEqual(await addExpense(pool,verify,input),saved); await assert.rejects(addExpense(pool,verify,{...input,amount:"100.26"}),/IDEMPOTENCY_MISMATCH/);
    const totals=await getFinance(pool,verify,"2026-11-20","2026-11-20"); const listed=await listExpenses(pool,verify,"2026-11-20","2026-11-20",1,50); assert.ok(BigInt(totals.totals.expenses.replace(".",""))>=BigInt(10025)); assert.ok(listed.rows.some(r=>r.id===saved.id));
     await assert.rejects(listExpenses(pool,verify,null,null,1,1001),/INVALID_INPUT/);
     await assert.rejects(listExpenses(pool,async()=>staff,null,null,1,50),/FORBIDDEN/);
     await assert.rejects(getFinance(pool,async()=>staff,null,null),/FORBIDDEN/);
    await assert.rejects(getFinance(pool,verify,"2026-11-20",null),/INVALID_INPUT/);
    assert.equal(totals.totals.net,"-100.25");
    assert.equal(totals.daily[0].net,"-100.25");
    for (const [method, amount, receivedAt, status] of [["cash","0.10","2026-11-19T16:00:00Z","accepted"],["gcash","0.20","2026-11-20T15:59:59Z","accepted"],["cash","900.00","2026-11-20T16:00:00Z","accepted"],["gcash","99999.99","2026-11-20T10:00:00Z","unverified"],["gcash","99999.99","2026-11-20T10:00:00Z","rejected"],["gcash","99999.99","2026-11-20T10:00:00Z","exception"]]) {
      const bookingId=randomUUID();
      await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES($1,'finance-fixture','2026-11-01','confirmed',clock_timestamp(),$2,1)",[bookingId,amount]);
      await admin.query("INSERT INTO ethn.payments(id,booking_id,method,status,merchant_snapshot,claimed_amount,accepted_reference,collected_amount,received_at,verified_at,verified_by,reviewed_at,reviewed_by,review_reason) VALUES($1,$2,$3,$4,'fixture merchant',$5,$6,$7,$8,$9,$10,$11,$12,$13)",[randomUUID(),bookingId,method,status,amount,status==='accepted'&&method==='gcash'?randomUUID():null,status==='accepted'?amount:null,status==='accepted'?receivedAt:null,status==='accepted'?'2026-11-21T00:00:00Z':null,status==='accepted'?owner:null,['rejected','exception'].includes(status)?'2026-11-21T00:00:00Z':null,['rejected','exception'].includes(status)?owner:null,['rejected','exception'].includes(status)?'fixture exclusion check':null]);
    }
    await assert.rejects(getApprovalFinance(pool,async()=>staff,"2026-11-20","2026-11-21"), /FORBIDDEN/);
    const approval = await getApprovalFinance(pool,verify,"2026-11-20","2026-11-21");
    assert.deepEqual(approval.days, [
      { date: "2026-11-20", revenueCents: 0, expenseCents: 10025, profitCents: -10025, bookings: 0 },
      { date: "2026-11-21", revenueCents: 90030, expenseCents: 0, profitCents: 90030, bookings: 3 },
    ]);
    await admin.query("UPDATE ethn.bookings SET status='completed',archived_at=now(),archived_by=$1 WHERE owner_hash='finance-fixture' AND total=0.10",[owner]);
    await admin.query("UPDATE ethn.bookings SET status='cancelled' WHERE owner_hash='finance-fixture' AND total=0.20");
    await admin.query("UPDATE ethn.bookings SET status='refunded' WHERE owner_hash='finance-fixture' AND total=900.00");
    await admin.query("UPDATE ethn.payments SET verified_at='2026-11-20T16:00:00Z' WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='finance-fixture' AND total=0.10)");
    const after = await getApprovalFinance(pool,verify,"2026-11-20","2026-11-21");
    assert.deepEqual(after.days.map(({date,revenueCents,bookings})=>({date,revenueCents,bookings})),[
      {date:"2026-11-20",revenueCents:0,bookings:0},
      {date:"2026-11-21",revenueCents:10,bookings:1},
    ]);
    const reconciled=await getFinance(pool,verify,"2026-11-20","2026-11-20");
    assert.deepEqual(reconciled.totals,{cash:"0.10",gcash:"0.20",other:'0.00',refunds:'0.00',collected:"0.30",expenses:"100.25",net:"-99.95"});
    assert.equal(reconciled.daily[0].collected,"0.30");
    const retryInput={...input,title:'Concurrent',amount:'0.05',idempotencyKey:randomUUID()};
    const retries=await Promise.all([addExpense(pool,verify,retryInput),addExpense(pool,verify,retryInput)]);
    assert.equal(retries[0].id,retries[1].id);
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.audit WHERE action='expense.create' AND detail->>'expenseId'=$1",[retries[0].id])).rows[0].n,1);
    assert.equal(reconciled.daily[0].bookingPayments, "0.30");
    assert.equal(reconciled.daily[0].otherSales, "0.00");
    const filtered = await listExpenses(pool, verify, "2026-11-20", "2026-11-20", 1, 20, "Utilities", "UTIL");
    const entry = filtered.rows.find(row => row.id === saved.id)!;
    assert.equal(entry.effectiveAmount, "100.25");
    const correction = randomUUID();
    await admin.query("INSERT INTO ethn.expense_corrections(id,expense_id,amount_delta,correction_date,reason,created_by) VALUES($1,$2,-0.25,'2026-11-21','fixture',$3)", [correction,saved.id,owner]);
    const saleId = randomUUID(), saleCorrectionId = randomUUID();
    await admin.query("INSERT INTO ethn.sales(id,description,amount,method,received_at,created_by) VALUES($1,'Not exported',25,'cash','2026-11-20T16:00:00Z',$2)", [saleId,owner]);
    await admin.query("INSERT INTO ethn.sale_corrections(id,sale_id,amount_delta,cash_delta,gcash_delta,reason,created_by,created_at) VALUES($1,$2,-5,-25,20,'Not exported',$3,'2026-11-20T17:00:00Z')", [saleCorrectionId,saleId,owner]);
    await admin.query("INSERT INTO ethn.booking_refunds(booking_id,payment_id,amount,method,reason,reference,recorded_by,recorded_at) SELECT p.booking_id,p.id,p.collected_amount,p.method,'Not exported','Private bank reference',$1,'2026-11-21T15:59:59Z' FROM ethn.payments p JOIN ethn.bookings b ON b.id=p.booking_id WHERE b.owner_hash='finance-fixture' AND b.total=900.00 AND p.status='accepted'", [owner]);
    await admin.query("UPDATE ethn.payments SET method='metrobank' WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='finance-fixture' AND total=900.00)");
    const { overview } = await getFinance(pool, verify, "2026-11-21", "2026-11-21", true);
    assert.ok(overview);
    assert.deepEqual(overview.paymentMethods.find(method => method.id === "metrobank"), { id: "metrobank", name: "Metrobank", amount: "900.00" });
    assert.deepEqual(overview.paymentMethods.find(method => method.id === "cash"), { id: "cash", name: "Cash", amount: "0.00" });
    assert.ok(!overview.paymentMethods.some(method => method.id === "other"));
    assert.deepEqual(overview.expenseCategories, [{ category: "Utilities", amount: "-0.25" }]);
    assert.deepEqual(overview.current, { bookingPayments: "900.00", otherSales: "20.00", expenses: "-0.25", refunds: "900.00", net: "20.25" });
    const workbook = await getFinanceExport(pool, verify, "2026-11-21", "2026-11-21");
    assert.deepEqual(workbook.totals, overview.current);
    assert.deepEqual(workbook.entries.map(({ kind, amount }) => [kind, amount]), [
      ["Booking receipt", "900.00"], ["Expense correction", "-0.25"], ["Other sale", "25.00"],
      ["Recorded refund", "900.00"], ["Sale correction", "-5.00"],
    ]);
    assert.ok(workbook.entries.every(row => row.date === "2026-11-21"));
    assert.equal(workbook.entries[0].method, "metrobank");
    assert.equal(workbook.entries[0].reference, workbook.entries[3].reference);
    assert.equal(workbook.entries[4].reference, saleId);
    assert.equal(workbook.entries[4].cashDelta, "-25.00");
    assert.equal(workbook.entries[4].gcashDelta, "20.00");
    assert.doesNotMatch(JSON.stringify(workbook), /Not exported|Private bank reference|customer|email|tracking/i);
    assert.deepEqual(overview.previous, { from: "2026-11-20", to: "2026-11-20", bookingPayments: "0.30", otherSales: "0.00", expenses: "100.30", refunds: "0.00", net: "-100.00" });
    assert.equal(overview.daily.length, 1);
    await assert.rejects(getFinanceExport(pool, async () => staff, "2026-11-20", "2026-11-21"), /FORBIDDEN/);
    const original = { revision: entry.revision, lastCorrectionId: correction };
    await changeExpense(pool, verify, saved.id, "edit", { ...original, title: "Utilities", category: "Utilities", amount: "12.30", paidDate: "2026-11-20", vendor: "Vendor" });
    await assert.rejects(changeExpense(pool, verify, saved.id, "delete", original), /STALE_CORRECTION/);
    const edited = (await listExpenses(pool, verify, "2026-11-20", "2026-11-20", 1, 20, "Utilities", "UTIL")).rows[0];
    assert.equal(edited.effectiveAmount, "12.30");
    assert.equal(edited.vendor, "Vendor");
    assert.equal(edited.lastCorrectionId, correction);
    assert.equal((await getFinance(pool, verify, "2026-11-21", "2026-11-21")).totals.expenses, "0.00");
    await changeExpense(pool, verify, saved.id, "delete", { revision: edited.revision, lastCorrectionId: edited.lastCorrectionId });
    assert.equal((await listExpenses(pool, verify, "2026-11-20", "2026-11-20", 1, 20, "Utilities", "UTIL")).total, 0);
  } finally { await admin.query("DELETE FROM ethn.booking_refunds WHERE recorded_by=$1",[owner]); await admin.query("DELETE FROM ethn.sale_corrections WHERE created_by=$1",[owner]); await admin.query("DELETE FROM ethn.sales WHERE created_by=$1",[owner]); await admin.query("DELETE FROM ethn.payments WHERE booking_id IN (SELECT id FROM ethn.bookings WHERE owner_hash='finance-fixture')"); await admin.query("DELETE FROM ethn.bookings WHERE owner_hash='finance-fixture'"); await admin.query("DELETE FROM ethn.audit WHERE actor=$1",[owner]); await admin.query("DELETE FROM ethn.expenses WHERE created_by=$1",[owner]); await admin.query("DELETE FROM ethn.idempotency WHERE owner_hash=$1 AND operation='expense.create'",[createHash("sha256").update(owner).digest("hex")]).catch(()=>{}); await admin.query("DELETE FROM ethn.staff_access WHERE user_id=ANY($1::uuid[])",[[owner,staff]]); await pool.end(); await admin.end(); }
});
