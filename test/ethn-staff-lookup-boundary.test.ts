import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { listOwners, putOwnerAccess } from "../src/lib/admin/ethn-owner-access";
import { GET, PUT } from "../src/app/api/ethn/admin/staff/route";

const ownerId = "00000000-0000-4000-8000-000000000001";

test("Owner Access has no role input and the retired Staff API returns 410", async () => {
  const pool = { connect: async () => assert.fail("invalid role input reached database") } as unknown as Pick<Pool, "connect">;
  for (const role of ["staff", "owner"]) {
    await assert.rejects(putOwnerAccess(pool, async () => ownerId, async () => true, { userId: ownerId, role, enabled: true }), /INVALID_INPUT/);
  }
  for (const handler of [GET, PUT]) {
    const response = handler();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("Owner Access listing requests only Owner memberships", async () => {
  const queries: string[] = [];
  const pool = { connect: async () => ({
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: [{ user_id: ownerId, enabled: true }] };
    },
    release() {},
  }) } as unknown as Pick<Pool, "connect">;
  assert.deepEqual(await listOwners(pool, async () => ownerId), { owners: [{ userId: ownerId, enabled: true }] });
  assert.match(queries[2], /WHERE role='owner'/);
});

test("staff caller is denied before target Auth-user lookup", async () => {
  let lookedUp = false;
  const pool = { connect: async () => ({ query: async () => ({ rows: [{ role: "staff" }] }), release() {} }) } as unknown as Pick<Pool, "connect">;
  await assert.rejects(putOwnerAccess(pool, async () => "00000000-0000-4000-8000-000000000001", async () => { lookedUp = true; return true; }, { userId: "00000000-0000-4000-8000-000000000002", enabled: true }), /FORBIDDEN/);
  assert.equal(lookedUp, false);
});
