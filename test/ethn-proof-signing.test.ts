import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { signReservedProof } from "../src/lib/booking/proof-signing";

const input = { ownerToken: "123e4567-e89b-42d3-a456-426614174000", checkoutId: "123e4567-e89b-42d3-a456-426614174001", reservationId: "123e4567-e89b-42d3-a456-426614174002" };
const path = `incoming/${"a".repeat(64)}.png`;
const row = { object_path: path, mime_type: "image/png", byte_size: 100, expires_at: new Date("2030-01-01T00:00:00Z") };
function fixture(rows: (typeof row | null)[]) {
  let calls = 0, releases = 0, signs = 0;
  const pool = { connect: async () => ({ query: async (_sql: string, params: unknown[]) => { assert.equal(params[0], input.checkoutId); assert.equal(params[2], input.reservationId); const r = rows[calls++]; return { rows: r ? [r] : [] }; }, release: () => { releases++; } }) } as unknown as Pick<Pool, "connect">;
  const storage = { sign: async (p: string) => { signs++; return { signedUrl: "url", token: "token", path: p }; } };
  return { pool, storage, counts: () => ({ calls, releases, signs }) };
}
test("signs only authorized server path and rechecks before returning", async () => {
  const f = fixture([row, row]);
  assert.deepEqual(await signReservedProof(f.pool, input, f.storage), { signedUrl: "url", token: "token", path, expiresAt: row.expires_at.toISOString() });
  assert.deepEqual(f.counts(), { calls: 2, releases: 2, signs: 1 });
});
test("unavailable or invalid metadata never reaches signer", async () => {
  for (const r of [null, { ...row, object_path: "incoming/bad.png" }, { ...row, mime_type: "image/jpeg" }, { ...row, byte_size: 0 }]) {
    const f = fixture([r]); await assert.rejects(signReservedProof(f.pool, input, f.storage), /CHECKOUT_UNAVAILABLE/); assert.equal(f.counts().signs, 0); assert.equal(f.counts().releases, 1);
  }
});
test("SDK errors and postcheck failure return no signature", async () => {
  const f = fixture([row]); await assert.rejects(signReservedProof(f.pool, input, { sign: async () => { throw new Error("private provider error"); } }), /^Error: STORAGE_UNAVAILABLE$/); assert.equal(f.counts().releases, 1);
  const g = fixture([row, null]); await assert.rejects(signReservedProof(g.pool, input, g.storage), /CHECKOUT_UNAVAILABLE/); assert.deepEqual(g.counts(), { calls: 2, releases: 2, signs: 1 });
});
