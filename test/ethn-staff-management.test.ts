import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { listOwners, putOwnerAccess } from "../src/lib/admin/ethn-owner-access";
import { getSettings, putSettings } from "../src/lib/admin/ethn-settings";

const url = process.env.ETHN_STAFF_MANAGEMENT_TEST_DATABASE_URL, adminUrl = process.env.ETHN_STAFF_MANAGEMENT_TEST_ADMIN_URL;
const owner1 = "00000000-0000-4000-8000-000000000001", owner2 = "00000000-0000-4000-8000-000000000002";
const staff1 = "00000000-0000-4000-8000-000000000003", disabled = "00000000-0000-4000-8000-000000000004";
const absent = "00000000-0000-4000-8000-000000000005";
const exists = async (id: string) => id !== absent;
const audits = async (admin: Pool, target?: string) => (await admin.query("SELECT actor, detail FROM ethn.audit WHERE action='staff.update' AND ($1::text IS NULL OR detail->>'userId'=$1) ORDER BY id", [target ?? null])).rows;

test("owner staff management on disposable restricted database", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true),($2,'owner',true),($3,'staff',false),($4,'owner',false)", [owner1, owner2, staff1, disabled]);
    await assert.rejects(listOwners(pool, async () => null), /UNAUTHENTICATED/);
    await assert.rejects(listOwners(pool, async () => "invalid"), /UNAUTHENTICATED/);
    for (const actor of [staff1, disabled, absent]) await assert.rejects(listOwners(pool, async () => actor), /FORBIDDEN/);
    const list = await listOwners(pool, async () => owner1);
    assert.deepEqual(list.owners, [{ userId: owner1, enabled: true }, { userId: owner2, enabled: true }, { userId: disabled, enabled: false }]);
    assert.doesNotMatch(JSON.stringify(list), /email|guest|merchant/i);

    const put = (actor: string, body: unknown, lookup = exists) => putOwnerAccess(pool, async () => actor, lookup, body);
    for (const body of [null, {}, { userId: owner1 }, { userId: owner1, enabled: true, extra: 1 }, { userId: "nope", enabled: true }, { userId: owner1, role: "admin", enabled: true }, { userId: owner1, enabled: 1 }]) await assert.rejects(put(owner1, body), /INVALID_INPUT/);
    await assert.rejects(put(absent, { userId: absent, enabled: true }), /FORBIDDEN/);
    await assert.rejects(put(staff1, { userId: staff1, enabled: true }), /FORBIDDEN/);
    await assert.rejects(put(owner1, { userId: staff1, role: "staff", enabled: true }), /INVALID_INPUT/);
    await assert.rejects(put(owner1, { userId: absent, enabled: true }), /TARGET_NOT_FOUND/);
    const access = (actor: string, target: string, enabled: boolean) => put(actor, { userId: target, enabled });
    await assert.rejects(access(owner1, staff1, false), /TARGET_NOT_FOUND/);
    await assert.rejects(admin.query("UPDATE ethn.staff_access SET enabled=true WHERE user_id=$1", [staff1]), { code: "23514" });
    await access(owner1, staff1, true);
    assert.deepEqual((await audits(admin, staff1)).map(row => row.detail), [{ userId: staff1, oldRole: "staff", oldEnabled: false, newRole: "owner", newEnabled: true }]);
    await access(owner1, staff1, false);
    const race = await Promise.allSettled([access(owner1, owner1, false), access(owner2, owner2, false)]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    assert.match(String((race.find(result => result.status === "rejected") as PromiseRejectedResult).reason), /LAST_OWNER/);

    // Pricing (staff row then settings) and membership edits overlap without leaving zero owners.
    for (let i = 0; i < 8; i++) {
      const ownerId = (await admin.query("SELECT user_id FROM ethn.staff_access WHERE role='owner' AND enabled LIMIT 1")).rows[0].user_id;
      await put(ownerId, { userId: owner1, enabled: true });
      await put(ownerId, { userId: owner2, enabled: true });
      const snapshot = await getSettings(pool, async () => owner1);
      const input = { version: snapshot.version, merchant: `race ${i}`, courts: snapshot.courts.map((c: { id: string; name: string; hours: { id: string }[] }) => ({ id: c.id, name: c.name, rates: c.hours.map(h => ({ hoursId: h.id, hourlyRate: null as string | null })) })) };
      const [pricing, membership] = await Promise.allSettled([putSettings(pool, async () => owner1, input), put(owner1, { userId: owner1, enabled: false })]);
      assert.equal(membership.status, "fulfilled");
      if (pricing.status === "rejected") assert.match(String(pricing.reason), /FORBIDDEN/);
      assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.staff_access WHERE role='owner' AND enabled")).rows[0].n, 1);
    }
  } finally { await pool.end(); await admin.end(); }
});

test("cutover blocks an unreviewed promotion but accepts a revoked or explicitly regranted membership", { skip: !url || !adminUrl }, async () => {
  const admin = new Pool({ connectionString: adminUrl });
  const client = await admin.connect();
  const sql = readFileSync(new URL("../db/ethn-migrations/0008_owner_access_cutover.sql", import.meta.url), "utf8");
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true)", [absent]);
    await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES ('migration','owner.cutover',jsonb_build_object('userId',$1::text,'oldRole','staff','newRole','owner'))", [absent]);
    await client.query("SAVEPOINT before_cutover");
    await assert.rejects(client.query(sql), { code: "P0001", message: "ETHN_OWNER_ROSTER_REVIEW_REQUIRED" });
    await client.query("ROLLBACK TO SAVEPOINT before_cutover");
    await client.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1", [absent]);
    await client.query(sql);
    await client.query("UPDATE ethn.staff_access SET enabled=true WHERE user_id=$1", [absent]);
    await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES ($1,'staff.update',jsonb_build_object('userId',$2::text,'oldEnabled',false,'newEnabled',true,'newRole','owner'))", [owner1, absent]);
    await client.query(sql);
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); await admin.end(); }
  }
});
