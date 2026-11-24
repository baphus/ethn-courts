import test from "node:test";
import assert from "node:assert/strict";
import { readAdminJson } from "../src/lib/admin/ethn-json";

test("expense JSON permits metadata within the limit and rejects oversized input", async () => {
  const request = (body: string) => new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const values = { description: "a".repeat(2000), notes: "b".repeat(2000), vendor: "c".repeat(160) };
  assert.deepEqual(await readAdminJson(request(JSON.stringify(values)), 32768), values);
  await assert.rejects(readAdminJson(request(JSON.stringify({ notes: "x".repeat(32768) })), 32768), /INVALID_INPUT/);
});
