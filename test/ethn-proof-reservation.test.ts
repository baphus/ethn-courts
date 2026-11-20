import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { reserveProof } from "../src/lib/booking/proof-reservation";
const input = { checkoutId: "123e4567-e89b-42d3-a456-426614174001", ownerToken: "123e4567-e89b-42d3-a456-426614174000", idempotencyKey: "key", mimeType: "image/png", byteSize: 123 };
function fake(options: { missing?: boolean; expired?: boolean; unack?: boolean; replay?: object; mismatch?: boolean; incomplete?: boolean; fail?: string; rollbackFail?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = []; let fingerprint = "", discarded = false;
  const client = { release(value: boolean) { discarded = value; }, async query(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    if (sql === options.fail || (sql === "ROLLBACK" && options.rollbackFail)) throw new Error("failure");
    if (sql.startsWith("INSERT INTO ethn.idempotency")) { fingerprint = params[2] as string; return { rows: options.replay || options.incomplete ? [] : [{}] }; }
    if (sql.startsWith("SELECT fingerprint")) return { rows: [{ fingerprint: options.mismatch ? "different" : fingerprint, result: options.replay ?? null }] };
    if (sql.startsWith("SELECT status")) return { rows: options.missing ? [] : [{ status: "held", expires_at: new Date(options.expired ? 0 : 200000), total: "100.00", price_acknowledged: !options.unack }] };
    if (sql.startsWith("SELECT clock_timestamp")) return { rows: [{ now: new Date(100000) }] };
    return { rows: [] };
  } };
  return { pool: { connect: async () => client } as unknown as Pick<Pool, "connect">, calls, discarded: () => discarded };
}
test("reservation binds owner, metadata and completed result", async () => {
  const f = fake({ unack: true }); const result = await reserveProof(f.pool, { ...input, acknowledgedTotal: "100.00" });
  assert.match(result.objectPath, /^incoming\/[0-9a-f]{64}\.png$/); assert.equal(result.state, "reserved");
  const insert = f.calls.find(c => c.sql.startsWith("INSERT INTO ethn.proof_reservations"))!;
  assert.deepEqual(insert.params, [result.reservationId, input.checkoutId, createHash("sha256").update(input.ownerToken).digest("hex"), result.objectPath, input.mimeType, input.byteSize]);
  assert(f.calls.some(c => c.sql.startsWith("UPDATE ethn.bookings SET price_acknowledged")));
  assert.deepEqual(JSON.parse(f.calls.find(c => c.sql.startsWith("UPDATE ethn.idempotency"))!.params[3] as string), result);
});
test("fail closed, replay and transaction failures", async () => {
  for (const [options, value, error] of [[{ unack: true }, input, /ACKNOWLEDGEMENT_REQUIRED/], [{ unack: true }, { ...input, acknowledgedTotal: "99.00" }, /ACKNOWLEDGEMENT_REQUIRED/], [{ missing: true }, input, /CHECKOUT_UNAVAILABLE/], [{ expired: true }, input, /CHECKOUT_UNAVAILABLE/], [{ mismatch: true }, input, /IDEMPOTENCY_MISMATCH/], [{ incomplete: true }, input, /IDEMPOTENCY_INCOMPLETE/]] as const) { const f = fake(options); await assert.rejects(reserveProof(f.pool, value), error); assert(f.calls.some(c => c.sql === "ROLLBACK")); }
  const replay = { reservationId: "old", objectPath: "old" }; const f = fake({ replay }); assert.deepEqual(await reserveProof(f.pool, input), replay); assert(!f.calls.some(c => c.sql.startsWith("SELECT status")));
  for (const options of [{ fail: "COMMIT" }, { fail: "SELECT id FROM ethn.courts ORDER BY id FOR UPDATE", rollbackFail: true }]) { const f = fake(options); await assert.rejects(reserveProof(f.pool, input), /failure/); assert(f.discarded()); }
});
