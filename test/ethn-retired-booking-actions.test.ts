import test from "node:test";
import assert from "node:assert/strict";
import { POST as refund } from "../src/app/api/ethn/admin/bookings/[id]/refund/route";
import { POST as hold } from "../src/app/api/ethn/admin/extensions/hold/route";
import { POST as confirm } from "../src/app/api/ethn/admin/extensions/confirm/route";
import { POST as expire } from "../src/app/api/ethn/admin/extensions/expire/route";
import { POST as approve } from "../src/app/api/ethn/admin/extensions/proofs/approve/route";
import { POST as reject } from "../src/app/api/ethn/admin/extensions/proofs/reject/route";
import { POST as reserve } from "../src/app/api/ethn/admin/extensions/proofs/reserve/route";
import { POST as sign } from "../src/app/api/ethn/admin/extensions/proofs/sign/route";
import { POST as submit } from "../src/app/api/ethn/admin/extensions/proofs/submit/route";

test("refund and extension writes are retired without request input or database access", async () => {
  for (const handler of [refund, hold, confirm, expire, approve, reject, reserve, sign, submit]) {
    const response = handler();
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "RETIRED" });
  }
});
