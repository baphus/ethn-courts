import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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
