import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { reconcileInbox } from "../src/lib/admin/ethn-notifications";
import type { Pool } from "pg";

test("late-payment review routes and navigation are removed", () => {
  for (const path of [
    "src/app/admin/exceptions/page.tsx",
    "src/app/api/ethn/admin/exceptions/route.ts",
    "src/app/api/ethn/admin/exceptions/[paymentId]/route.ts",
    "src/app/api/ethn/admin/exceptions/[paymentId]/review/route.ts",
    "src/lib/admin/ethn-exceptions.ts",
  ]) assert.equal(existsSync(path), false, path);
  assert.doesNotMatch(readFileSync("src/components/admin/admin-sidebar.tsx", "utf8"), /\/admin\/exceptions/);
});

test("inbox reconciliation no longer queries or creates late-payment exceptions", async () => {
  const queries: string[] = [];
  const pool = { connect: async () => ({
    query: async (sql: string) => {
      queries.push(sql);
      return { rows: sql.includes("staff_access") ? [{ role: "staff", user_id: "00000000-0000-4000-8000-000000000001" }] : [] };
    },
    release() {},
  }) } as unknown as Pick<Pool, "connect">;
  assert.deepEqual(await reconcileInbox(pool, async () => "00000000-0000-4000-8000-000000000001"), { created: 0 });
  assert.doesNotMatch(queries.join("\n"), /exception/);
  assert.ok(queries.includes("COMMIT"));
});
