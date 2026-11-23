import { test } from "node:test";
import assert from "node:assert/strict";

test("fresh-target preflight refuses existing schema, missing or elevated runtime roles", async () => {
  const { assertFreshTarget } = await import("../scripts/ethn-migrations.mjs");
  const runtime = { rolname: "ethn_checkout", rolcanlogin: true, rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, memberships: false };
  const roles = [{ rolname: "anon" }, { rolname: "authenticated" }, runtime];
  assert.doesNotThrow(() => assertFreshTarget([], roles));
  for (const schema of ["ethn", "ethn_migrations"]) assert.throws(() => assertFreshTarget([schema], roles), /Fresh migration requires/);
  assert.throws(() => assertFreshTarget([], []), /Provision/);
  for (const field of ["rolsuper", "rolbypassrls", "rolcreaterole", "rolcreatedb", "memberships"]) assert.throws(() => assertFreshTarget([], [...roles.slice(0, 2), { ...runtime, [field]: true }]), /restricted login/);
});
