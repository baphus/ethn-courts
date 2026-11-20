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
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true),($2,'owner',true),($3,'staff',true),($4,'owner',false)", [owner1, owner2, staff1, disabled]);
    await assert.rejects(listStaff(pool, async () => null), /UNAUTHENTICATED/);
    await assert.rejects(listStaff(pool, async () => "invalid"), /UNAUTHENTICATED/);
    for (const actor of [staff1, disabled, absent]) await assert.rejects(listStaff(pool, async () => actor), /FORBIDDEN/);
    const list = await listStaff(pool, async () => owner1);
    assert.deepEqual(list.staff.map(row => Object.keys(row).sort()), [["enabled", "role", "userId"], ["enabled", "role", "userId"], ["enabled", "role", "userId"], ["enabled", "role", "userId"]]);
    assert.deepEqual(list.staff.find(row => row.userId === staff1), { userId: staff1, role: "staff", enabled: true });
    assert.doesNotMatch(JSON.stringify(list), /email|guest|merchant/i);

    const put = (actor: string, body: unknown, lookup = exists) => putStaff(pool, async () => actor, lookup, body);
    for (const body of [null, {}, { userId: owner1, role: "owner" }, { userId: owner1, role: "owner", enabled: true, extra: 1 }, { userId: "nope", role: "owner", enabled: true }, { userId: owner1, role: "admin", enabled: true }, { userId: owner1, role: "owner", enabled: 1 }]) await assert.rejects(put(owner1, body), /INVALID_INPUT/);
    await assert.rejects(put(absent, { userId: absent, role: "staff", enabled: true }, async () => { throw new Error("must not query Auth for unauthorized caller"); }), /FORBIDDEN/);
    await assert.rejects(put(staff1, { userId: staff1, role: "staff", enabled: true }), /FORBIDDEN/);
    await assert.rejects(put(disabled, { userId: disabled, role: "owner", enabled: true }), /FORBIDDEN/);
    await assert.rejects(put(owner1, { userId: absent, role: "staff", enabled: true }, async () => false), /TARGET_NOT_FOUND/);

    assert.deepEqual(await put(owner1, { userId: staff1, role: "staff", enabled: true }), { userId: staff1, role: "staff", enabled: true });
    assert.equal((await audits(admin)).length, 0);
    assert.deepEqual(await put(owner1, { userId: staff1, role: "owner", enabled: true }), { userId: staff1, role: "owner", enabled: true });
    assert.deepEqual((await audits(admin, staff1)).map(row => row.detail), [{ userId: staff1, oldRole: "staff", oldEnabled: true, newRole: "owner", newEnabled: true }]);
    await put(owner1, { userId: staff1, role: "owner", enabled: true });
    assert.equal((await audits(admin, staff1)).length, 1);

    // Self change is allowed only while another enabled owner remains.
    assert.deepEqual(await put(owner1, { userId: owner1, role: "staff", enabled: true }), { userId: owner1, role: "staff", enabled: true });
    await assert.rejects(put(owner1, { userId: owner1, role: "staff", enabled: false }), /FORBIDDEN/);
    await put(staff1, { userId: owner2, role: "staff", enabled: true });
    await assert.rejects(put(staff1, { userId: staff1, role: "staff", enabled: false }), /LAST_OWNER/);
    await put(staff1, { userId: owner1, role: "owner", enabled: true });
    await put(staff1, { userId: owner2, role: "owner", enabled: true });

    // Inserts use the same route and produce one audit row without PII.
    assert.deepEqual(await put(owner1, { userId: absent, role: "staff", enabled: true }, async () => true), { userId: absent, role: "staff", enabled: true });
    assert.deepEqual((await audits(admin, absent)).map(row => row.detail), [{ userId: absent, oldRole: null, oldEnabled: null, newRole: "staff", newEnabled: true }]);
    assert.deepEqual((await listStaff(pool, async () => owner1)).staff.find(row => row.userId === absent), { userId: absent, role: "staff", enabled: true });

    // Two simultaneous self-demotions of the two remaining owners cannot commit both.
    await put(owner1, { userId: staff1, role: "staff", enabled: true });
    const before = (await audits(admin)).length;
    const demote = (actor: string, target: string) => put(actor, { userId: target, role: "staff", enabled: true });
    const race = await Promise.allSettled([demote(owner1, owner1), demote(owner2, owner2)]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    assert.match(String((race.find(result => result.status === "rejected") as PromiseRejectedResult).reason), /LAST_OWNER/);
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.staff_access WHERE role='owner' AND enabled")).rows[0].n, 1);
    assert.equal((await audits(admin)).length, before + 1);

    // Pricing (staff row then settings) and membership edits overlap without leaving zero owners.
    for (let i = 0; i < 8; i++) {
      const ownerId = (await admin.query("SELECT user_id FROM ethn.staff_access WHERE role='owner' AND enabled LIMIT 1")).rows[0].user_id;
      await put(ownerId, { userId: owner1, role: "owner", enabled: true });
      await put(ownerId, { userId: owner2, role: "owner", enabled: true });
      const snapshot = await getSettings(pool, async () => owner1);
      const input = { version: snapshot.version, merchant: `race ${i}`, courts: snapshot.courts.map((c: { id: string; name: string; hours: { id: string }[] }) => ({ id: c.id, name: c.name, rates: c.hours.map(h => ({ hoursId: h.id, hourlyRate: null as string | null })) })) };
      const [pricing, membership] = await Promise.allSettled([putSettings(pool, async () => owner1, input), put(owner1, { userId: owner1, role: "staff", enabled: true })]);
      assert.equal(membership.status, "fulfilled");
      if (pricing.status === "rejected") assert.match(String(pricing.reason), /FORBIDDEN/);
      assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.staff_access WHERE role='owner' AND enabled")).rows[0].n, 1);
    }
  } finally { await pool.end(); await admin.end(); }
});
