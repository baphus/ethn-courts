import assert from "node:assert/strict";
import test from "node:test";
import { profilePatchSchema } from "../src/lib/admin/validation";

test("staff profile accepts a trimmed display name and rejects all other account changes", () => {
  assert.deepEqual(profilePatchSchema.parse({ name: "  María Santos  " }), { name: "María Santos" });
  for (const input of [
    null,
    { name: " " },
    { name: "x".repeat(101) },
    { name: "Maria", email: "other@example.com" },
    { name: "Maria", userId: "another-account" },
    { name: "Maria", role: "owner" },
  ]) {
    assert.equal(profilePatchSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});
