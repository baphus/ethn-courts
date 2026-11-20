import test from "node:test";
import assert from "node:assert/strict";
import { getStaff } from "../src/lib/admin/ethn-payments";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";

test("password sign-in uses current staff access rather than legacy metadata", async () => {
  const subject = "00000000-0000-4000-8000-000000000001";
  let released = 0;
  const pool = { connect: async () => ({ query: async (_sql: string, values: string[]) => { assert.deepEqual(values, [subject]); return { rows: [{ role: "staff" }] }; }, release: () => { released++; } }) } as unknown as Pick<Pool, "connect">;
  assert.deepEqual(await getStaff(pool, async () => subject), { userId: subject, role: "staff" });
  assert.equal(released, 1);
  const denied = { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) } as unknown as Pick<Pool, "connect">;
  await assert.rejects(getStaff(denied, async () => subject), /FORBIDDEN/);
  const route = readFileSync("src/app/api/auth/login/route.ts", "utf8");
  assert.match(route, /getStaff\(staffPool, async \(\) => user\.id\)/);
  assert.doesNotMatch(route, /isAdmin\(/);
  assert.match(route, /supabase\.auth\.signOut\(\)/);
});
