import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { listStaff, putStaff } from "../src/lib/admin/ethn-staff-management";
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
    await assert.rejects(listStaff(pool, async () => null), /UNAUTHENTICATED/);
    await assert.rejects(listStaff(pool, async () => "invalid"), /UNAUTHENTICATED/);
    for (const actor of [staff1, disabled, absent]) await assert.rejects(listStaff(pool, async () => actor), /FORBIDDEN/);
    const list = await listStaff(pool, async () => owner1);
    assert.deepEqual(list.staff.map(row => Object.keys(row).sort()), [["enabled", "role", "userId"], ["enabled", "role", "userId"], ["enabled", "role", "userId"], ["enabled", "role", "userId"]]);
    assert.deepEqual(list.staff.find(row => row.userId === staff1), { userId: staff1, role: "staff", enabled: false });
    assert.doesNotMatch(JSON.stringify(list), /email|guest|merchant/i);

    const put = (actor: string, body: unknown, lookup = exists) => putStaff(pool, async () => actor, lookup, body);
    for (const body of [null, {}, { userId: owner1, role: "owner" }, { userId: owner1, role: "owner", enabled: true, extra: 1 }, { userId: "nope", role: "owner", enabled: true }, { userId: owner1, role: "admin", enabled: true }, { userId: owner1, role: "owner", enabled: 1 }]) await assert.rejects(put(owner1, body), /INVALID_INPUT/);
    await assert.rejects(put(absent, { userId: absent, role: "owner", enabled: true }), /FORBIDDEN/);
    await assert.rejects(put(staff1, { userId: staff1, role: "owner", enabled: true }), /FORBIDDEN/);
    await assert.rejects(put(owner1, { userId: staff1, role: "staff", enabled: true }), /INVALID_INPUT/);
    await assert.rejects(put(owner1, { userId: absent, role: "owner", enabled: true }), /TARGET_NOT_FOUND/);
    const access = (actor: string, target: string, enabled: boolean) => put(actor, { userId: target, role: "owner", enabled });
    await access(owner1, staff1, true);
    assert.deepEqual((await audits(admin, staff1)).map(row => row.detail), [{ userId: staff1, oldRole: "staff", oldEnabled: false, newRole: "owner", newEnabled: true }]);
    await access(owner1, staff1, false);
    const race = await Promise.allSettled([access(owner1, owner1, false), access(owner2, owner2, false)]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    assert.match(String((race.find(result => result.status === "rejected") as PromiseRejectedResult).reason), /LAST_OWNER/);

    // Pricing (staff row then settings) and membership edits overlap without leaving zero owners.
    for (let i = 0; i < 8; i++) {
      const ownerId = (await admin.query("SELECT user_id FROM ethn.staff_access WHERE role='owner' AND enabled LIMIT 1")).rows[0].user_id;
      await put(ownerId, { userId: owner1, role: "owner", enabled: true });
      await put(ownerId, { userId: owner2, role: "owner", enabled: true });
      const snapshot = await getSettings(pool, async () => owner1);
      const input = { version: snapshot.version, merchant: `race ${i}`, courts: snapshot.courts.map((c: { id: string; name: string; hours: { id: string }[] }) => ({ id: c.id, name: c.name, rates: c.hours.map(h => ({ hoursId: h.id, hourlyRate: null as string | null })) })) };
      const [pricing, membership] = await Promise.allSettled([putSettings(pool, async () => owner1, input), put(owner1, { userId: owner1, role: "owner", enabled: false })]);
      assert.equal(membership.status, "fulfilled");
      if (pricing.status === "rejected") assert.match(String(pricing.reason), /FORBIDDEN/);
      assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.staff_access WHERE role='owner' AND enabled")).rows[0].n, 1);
    }
  } finally { await pool.end(); await admin.end(); }
});
