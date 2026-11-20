import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { trackBooking } from "../src/lib/booking/ethn-tracking";

test("uppercase tokens hash as lowercase", async () => {
  const pool = { connect: async () => ({ query: async (_sql: string, values: string[]) => {
    assert.equal(values[0], createHash("sha256").update("a".repeat(64)).digest("hex"));
    return { rows: [] };
  }, release() {} }) };
  assert.equal(await trackBooking(pool as never, { token: "A".repeat(64) }), null);
});
