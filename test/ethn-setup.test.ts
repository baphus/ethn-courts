import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { checkSetupKey, createFirstOwner, firstOwnerAvailable } from "../src/lib/admin/ethn-setup";

const key = "a".repeat(48);
const body = { email: "Owner@example.com", password: "long-password-123", setupKey: key };
function database(initiallyClosed = false, failInsert = false) {
  let closed = initiallyClosed, claimed = false, tail = Promise.resolve();
  const queries: string[] = [];
  const pool = { async connect() {
    let unlock: (() => void) | undefined;
    return {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes("settings WHERE")) {
          const before = tail; tail = new Promise<void>(resolve => { unlock = resolve; });
          await before;
          return { rows: [{ version: "1" }] };
        }
        if (sql.startsWith("SELECT EXISTS")) return { rows: [{ closed }] };
        if (sql.startsWith("INSERT INTO ethn.staff_access")) {
          if (failInsert) throw new Error("private SQL details");
          claimed = true;
        }
        if (sql === "COMMIT") { closed ||= claimed; unlock?.(); }
        if (sql === "ROLLBACK") { claimed = false; unlock?.(); }
        return { rows: [] };
      },
      release() {},
    };
  } } as unknown as Pick<Pool, "connect">;
  return { pool, queries };
}

test("setup key fails closed and input validation prevents account creation", async () => {
  assert.throws(() => checkSetupKey(undefined, key), /SETUP_UNAVAILABLE/);
  assert.throws(() => checkSetupKey("short", "short"), /SETUP_UNAVAILABLE/);
  assert.throws(() => checkSetupKey(key, "wrong"), /INVALID_SETUP_KEY/);
  const { pool, queries } = database();
  for (const input of [{ ...body, email: "bad" }, { ...body, password: "short" }, { ...body, role: "owner" }]) {
    await assert.rejects(createFirstOwner(pool, async () => { throw new Error("must not run"); }, key, input), /INVALID_INPUT/);
  }
  assert.equal(queries.length, 0);
});

test("first owner claim serializes requests and closes setup", async () => {
  const { pool, queries } = database();
  let accounts = 0;
  assert.equal(await firstOwnerAvailable(pool), true);
  const create = async (email: string) => { assert.equal(email, "owner@example.com"); accounts++; return "00000000-0000-4000-8000-000000000001"; };
  const results = await Promise.allSettled([createFirstOwner(pool, create, key, body), createFirstOwner(pool, create, key, body)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(accounts, 1);
  assert.equal(await firstOwnerAvailable(pool), false);
  assert.ok(queries.some(sql => sql.includes("owner.bootstrap")));
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.match(rejected.reason.message, /SETUP_CLOSED/);
});

test("existing staff or bootstrap marker blocks claim, including disabled owner", async () => {
  const { pool } = database(true);
  await assert.rejects(createFirstOwner(pool, async () => { throw new Error("must not create"); }, key, body), /SETUP_CLOSED/);
});

test("SQL and Auth failures roll back without leaking details", async () => {
  const { pool, queries } = database(false, true);
  await assert.rejects(createFirstOwner(pool, async () => "00000000-0000-4000-8000-000000000001", key, body), /^Error: SETUP_UNAVAILABLE$/);
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(await firstOwnerAvailable(pool), true);
  await assert.rejects(createFirstOwner(database().pool, async () => { throw new Error("ACCOUNT_UNAVAILABLE"); }, key, body), /ACCOUNT_UNAVAILABLE/);
});
