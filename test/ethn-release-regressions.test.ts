import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
import { decidePayment } from "../src/lib/admin/ethn-payment-decision";
import { changeExpense } from "../src/lib/admin/ethn-finance";

const id = "123e4567-e89b-42d3-a456-426614174001";
const verify = async () => id;

function mock(query: (sql: string, args: unknown[]) => unknown[] | undefined) {
  const calls: string[] = [];
  const pool = { connect: async () => ({ release() {}, async query(sql: string, args: unknown[] = []) {
    calls.push(sql);
    const rows = query(sql, args) ?? [];
    return { rows, rowCount: rows.length };
  } }) } as never;
  return { pool, calls };
}

test("online approval allows screenshot-only review and rejects duplicate IDs when supplied", async () => {
  for (const { reference, duplicate, proof } of [
    { reference: undefined, duplicate: false, proof: true },
    { reference: undefined, duplicate: false, proof: false },
    { reference: " Transfer123 ", duplicate: false, proof: true },
    { reference: " Transfer123 ", duplicate: true, proof: true },
  ]) {
    let fingerprint: unknown;
    const db = mock((sql, args) => {
      if (sql.includes("FROM ethn.staff_access")) return [{ user_id: id }];
      if (sql.startsWith("INSERT INTO ethn.idempotency")) { fingerprint = args[2]; return [{ key: "approve" }]; }
      if (sql.startsWith("SELECT fingerprint")) return [{ fingerprint }];
      if (sql.includes("FROM ethn.bookings")) return [{ status: "pending", total: "500.00" }];
      if (sql.includes("status='unverified'")) return [{ method: "gcash", merchant_snapshot: "new instructions" }];
      if (sql.includes("FROM ethn.proof_reservations")) return proof ? [{}] : [];
      if (sql.includes("AS now")) return [{ now: new Date() }];
      if (sql.includes("AS ended")) return [{ ended: false }];
      if (sql.includes("lower(accepted_reference)")) { assert.ok(reference); assert.deepEqual(args, ["gcash", "Transfer123"]); return duplicate ? [{}] : []; }
      if (sql.startsWith("UPDATE ethn.payments")) assert.equal(args[1], reference?.trim() ?? null);
    });
    const approval = { bookingId: id, key: "approve", action: "approve" as const, paymentReceived: true as const, ...(reference === undefined ? {} : { acceptedReference: reference }) };
    await assert.rejects(decidePayment(db.pool, verify, { ...approval, acceptedReference: " " }), /INVALID_INPUT/);
    assert.equal(db.calls.length, 0);
    const decision = decidePayment(db.pool, verify, approval);
    if (!proof || duplicate) {
      await assert.rejects(decision, proof ? /REFERENCE_ALREADY_USED/ : /DECISION_INCOMPATIBLE/);
      assert.equal(db.calls.at(-1), "ROLLBACK");
      assert(!db.calls.some(sql => sql.startsWith("UPDATE ethn.payments")));
    } else {
      assert.equal((await decision).status, "confirmed");
      assert.equal(db.calls.at(-1), "COMMIT");
    }
  }
});

test("deleting a corrected expense rolls back without deleting the original or its history", async () => {
  const db = mock(sql => {
    if (sql.includes("FROM ethn.staff_access")) return [{}];
    if (sql.includes("FROM ethn.expenses")) return [{ revision: null }];
    if (sql.includes("FROM ethn.expense_corrections")) return [{ id }];
  });
  await assert.rejects(changeExpense(db.pool, verify, id, "delete", { revision: null, lastCorrectionId: id }), /EXPENSE_HAS_CORRECTIONS/);
  assert(!db.calls.some(sql => sql.startsWith("DELETE")));
  assert.equal(db.calls.at(-1), "ROLLBACK");
});

test("editing an expense to zero rolls back before updating it", async () => {
  const db = mock(sql => {
    if (sql.includes("FROM ethn.staff_access")) return [{}];
    if (sql.includes("FROM ethn.expenses")) return [{ revision: null, category: "Utilities" }];
    if (sql.includes("clock_timestamp()")) return [{ now: new Date("2026-11-20T08:00:00Z") }];
  });
  await assert.rejects(changeExpense(db.pool, verify, id, "edit", { revision: null, lastCorrectionId: null, title: "Utilities", category: "Utilities", amount: "0.00", paidDate: "2026-11-20" }), /INVALID_INPUT/);
  assert(!db.calls.some(sql => sql.startsWith("UPDATE")));
  assert.equal(db.calls.at(-1), "ROLLBACK");
});

test("both sales amount fields accept centavos and reject too many decimals", () => {
  const source = readFileSync(new URL("../src/app/admin/finance/sales.tsx", import.meta.url), "utf8");
  const patterns = [...source.matchAll(/pattern="([^"]+)"/g)];
  assert.equal(patterns.length, 2);
  for (const [, pattern] of patterns) {
    const amount = new RegExp(`^(?:${pattern})$`, "v");
    assert(amount.test("125"));
    assert(amount.test("125.50"));
    assert(!amount.test("125.500"));
  }
});
