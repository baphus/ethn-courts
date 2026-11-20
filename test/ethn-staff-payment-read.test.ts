import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { getStaff, paymentQueue, paymentDetail, paymentProof } from "../src/lib/admin/ethn-payments";

const url = process.env.ETHN_STAFF_TEST_DATABASE_URL;
test("staff payment reads enforce identity and binding on restricted role", { skip: !url }, async () => {
  const pool = new Pool({ connectionString: url });
  const staff = "00000000-0000-4000-8000-000000000001";
  const disabled = "00000000-0000-4000-8000-000000000002";
  const booking = "10000000-0000-4000-8000-000000000001";
  try {
    await assert.rejects(getStaff(pool, async () => null), /UNAUTHENTICATED/);
    await assert.rejects(getStaff(pool, async () => "invalid"), /UNAUTHENTICATED/);
    await assert.rejects(getStaff(pool, async () => disabled), /FORBIDDEN/);
    await assert.rejects(getStaff(pool, async () => "00000000-0000-4000-8000-000000000003"), /FORBIDDEN/);
    assert.equal((await getStaff(pool, async () => staff)).role, "owner");
    const queue = await paymentQueue(pool, async () => staff);
    assert.deepEqual(queue.map(b => b.bookingId), [booking]);
    const detail = await paymentDetail(pool, async () => staff, booking);
    assert.equal(detail?.guestEmail, "guest@example.test");
    assert.equal(detail?.total, "125.00");
    assert.equal(detail?.payments[0].claimedReference, "reference");
    assert.equal(detail?.payments[0].proofAvailable, true);
    assert.doesNotMatch(JSON.stringify(detail), /owner-secret|tracking-secret|private\/proof/);
    let args: unknown[] = [];
    assert.deepEqual(await paymentProof(pool, async () => staff, booking, async (...input) => { args = input; return "https://example.test/signed"; }), { signedUrl: "https://example.test/signed", expiresIn: 300 });
    assert.deepEqual(args, ["private/proof", 300]);
    assert.equal(await paymentProof(pool, async () => staff, "10000000-0000-4000-8000-000000000002", async () => { throw new Error("must not sign"); }), null);
    await assert.rejects(paymentProof(pool, async () => disabled, booking, async () => { throw new Error("must not sign"); }), /FORBIDDEN/);
  } finally { await pool.end(); }
});
