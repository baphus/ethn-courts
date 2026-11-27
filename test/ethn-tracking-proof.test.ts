import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { findTrackingProof } from "../src/lib/booking/ethn-tracking-proof";

test("tracking proof requires a matching private token and attached original proof", async () => {
  const token = "a".repeat(64);
  const proof = { object_path: `incoming/${"b".repeat(64)}.png`, mime_type: "image/png" };
  let queries = 0;
  const pool = { async query(sql: string, values: string[]) {
    queries++;
    assert.match(sql, /b\.tracking_hash = \$1/);
    assert.match(sql, /r\.id = p\.proof_id AND r\.booking_id = b\.id AND r\.owner_hash = b\.owner_hash/);
    assert.match(sql, /p\.extension_id IS NULL AND r\.state = 'attached'/);
    assert.equal(values.length, 1);
    return { rows: values[0] === createHash("sha256").update(token).digest("hex") ? [proof] : [] };
  } };
  assert.equal(await findTrackingProof(pool as never, "ABCDE"), null);
  assert.equal(queries, 0);
  assert.equal(await findTrackingProof(pool as never, "c".repeat(64)), null);
  assert.deepEqual(await findTrackingProof(pool as never, token.toUpperCase()), proof);
});
