import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("expense mutation checks origin and bounds streamed JSON before service", () => {
  const source = readFileSync(new URL("../src/app/api/ethn/admin/expenses/route.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("hasValidOrigin(request)") < source.indexOf("await addExpense("));
  assert.match(source, /request\.body\?\.getReader\(\)/);
  assert.match(source, /size>4096/);
  assert.match(source, /await reader\.cancel\(\)/);
  assert.doesNotMatch(source, /request\.text\(\)/);
});
