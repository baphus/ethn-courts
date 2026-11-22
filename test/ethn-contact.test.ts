import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContact, putContact } from "../src/lib/admin/ethn-contact";

test("contact validation accepts blank fields and rejects unsafe links and headers", () => {
  assert.deepEqual(validateContact({ version: "1", facebook: " https://www.facebook.com/ethn ", phone: "+63 123", email: "owner@example.com" }), { version: "1", facebook: "https://www.facebook.com/ethn", phone: "+63 123", email: "owner@example.com" });
  for (const input of [{ facebook: "https://facebook.com.evil.test/" }, { facebook: "javascript:alert(1)" }, { email: "a@example.com\nBcc:x@y.com" }, { phone: "123<script>" }, { version: "0" }]) assert.throws(() => validateContact({ version: "1", facebook: "", phone: "", email: "", ...input }), /INVALID_INPUT/);
});

test("contact update rejects stale version without writing", async () => {
  const queries: string[] = [];
  const client = { query: async (sql: string) => { queries.push(sql); return { rows: sql.includes("staff_access") ? [{ user_id: "x" }] : sql.includes("SELECT version") ? [{ version: "2" }] : [] }; }, release: () => {} };
  await assert.rejects(putContact({ connect: async () => client } as never, async () => "12345678-1234-1234-1234-123456789abc", { version: "1", facebook: "", phone: "", email: "" }), /STALE_VERSION/);
  assert.ok(queries.includes("ROLLBACK")); assert.ok(!queries.some(q => q.startsWith("UPDATE")));
});
