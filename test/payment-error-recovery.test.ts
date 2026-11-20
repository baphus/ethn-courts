import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/booking/payment-step.tsx", import.meta.url), "utf8");
const clearMatch = source.match(/if \(\[([^\]]+)\]\.includes\(e\.code \?\? ""\)\) \{\s*setProof\(null\);/);

test("submit preserves receipt for hold and slot failures, clearing only invalid proof", () => {
  assert.ok(clearMatch);
  const clearedCodes = clearMatch![1]!.match(/"[A-Z_]+"/g)!.map((code) => code.slice(1, -1));
  assert.deepEqual(clearedCodes, ["PROOF_NOT_FOUND", "PROOF_MISMATCH", "PROOF_ALREADY_USED", "PROOF_PATH_REJECTED", "PROOF_TYPE_REJECTED", "PROOF_TOO_LARGE"]);
  for (const code of ["HOLD_INVALID", "SLOT_TAKEN", "SLOT_INVALID", "SLOT_CLOSED", "RECLAIM_EXPIRED", "HOLD_NOT_FOUND"]) {
    assert.ok(!clearedCodes.includes(code));
  }
  assert.match(source, /\["SLOT_TAKEN", "SLOT_INVALID", "SLOT_CLOSED"\]\.includes\(e\.code \?\? ""\)\) onReselect\(\)/);
});
