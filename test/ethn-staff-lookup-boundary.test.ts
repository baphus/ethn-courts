import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { putStaff } from "../src/lib/admin/ethn-staff-management";

test("staff caller is denied before target Auth-user lookup", async () => {
  let lookedUp = false;
  const pool = { connect: async () => ({ query: async () => ({ rows: [{ role: "staff" }] }), release() {} }) } as unknown as Pick<Pool, "connect">;
  await assert.rejects(putStaff(pool, async () => "00000000-0000-4000-8000-000000000001", async () => { lookedUp = true; return true; }, { userId: "00000000-0000-4000-8000-000000000002", role: "owner", enabled: true }), /FORBIDDEN/);
  assert.equal(lookedUp, false);
});
