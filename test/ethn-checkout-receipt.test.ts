import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { Pool } from "pg";
import { POST } from "../src/app/api/checkout/receipt/route";
import { readCheckoutReceipt } from "../src/lib/booking/ethn-receipt";

const input = {
  ownerToken: "AAAAAAAA-AAAA-4AAA-AAAA-AAAAAAAAAAAA",
  checkoutId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  submitKey: "cccccccc-cccc-4ccc-accc-cccccccccccc",
};

function poolReturning(rows: object[]) {
  return { query: async (sql: string, params: unknown[]) => {
    assert.match(sql, /s\.operation='submission' AND s\.key=\$3/);
    assert.match(sql, /s\.result->>'checkoutId'=b\.id::text/);
    assert.match(sql, /WHERE b\.id=\$1 AND b\.owner_hash=\$2 AND b\.walk_in_actor IS NULL/);
    assert.deepEqual(params, [input.checkoutId, createHash("sha256").update(input.ownerToken.toLowerCase()).digest("hex"), input.submitKey]);
    return { rows };
  } } as Pick<Pool, "query">;
}

test("owned receipt returns live status and only intended receipt fields", async () => {
  const token = "a".repeat(64);
  const items = [{ court: "Court 2", startsAt: "2026-11-24T15:00:00Z", endsAt: "2026-11-24T17:00:00Z", amount: "800.00" }];
  const pool = poolReturning([{ booked: true, status: "confirmed", guest_name: "Test Guest", guest_email: "guest@example.test", guest_phone: "private", proof_id: "private", payment_method: "GCash", operating_date: "2026-11-24", total: "800.00", tracking_token: token, tracking_code: "ABCDE", items }]);
  assert.deepEqual(await readCheckoutReceipt(pool, input), {
    booked: true, trackingToken: token, code: "ABCDE", receipt: { status: "confirmed", customerName: "Test Guest", maskedEmail: "g•••@example.test", operatingDate: "2026-11-24", total: "800.00", paymentMethod: "GCash", items },
  });
});

test("late proof restores only Not booked; no owner match has no receipt", async () => {
  assert.deepEqual(await readCheckoutReceipt(poolReturning([{ booked: false, id: input.checkoutId, guest_name: "private" }]), input), { booked: false, checkoutId: input.checkoutId });
  assert.equal(await readCheckoutReceipt(poolReturning([]), input), null);
});

test("receipt route rejects a tracking token and cross-origin requests before DB access", async () => {
  const url = "https://ethn.example/api/checkout/receipt";
  const request = (origin: string, input: unknown) => new Request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const tokenOnly = await POST(request("https://ethn.example", { token: "a".repeat(64) }));
  assert.equal(tokenOnly.status, 400);
  assert.equal(tokenOnly.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await POST(request("https://other.example", input))).status, 403);
});
