import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const legacy = await readFile(new URL("../src/app/api/submit/route.ts", import.meta.url), "utf8");
const service = await readFile(new URL("../src/lib/booking/submission.ts", import.meta.url), "utf8");

test("retired submit cannot delete receipts or invoke legacy booking writes", () => {
  assert.match(legacy, /POST = retiredResponse/);
  assert.doesNotMatch(legacy, /discardProofObject|\.rpc\(|getDb/);
  assert.doesNotMatch(service, /discardProofObject|\.remove\(/);
});

test("ETHN submission replays committed result before proof preflight and checks locked deadline", () => {
  const replay = service.indexOf('SELECT fingerprint, result FROM ethn.idempotency');
  const proof = service.indexOf('SELECT state, object_path, mime_type, byte_size FROM ethn.proof_reservations');
  assert.ok(replay >= 0 && proof > replay);
  assert.ok(service.indexOf('FOR UPDATE') < service.indexOf('SELECT clock_timestamp() AS now'));
  assert.match(service, /now\.getTime\(\) < new Date\(booking\.expires_at\)\.getTime\(\)/);
});
