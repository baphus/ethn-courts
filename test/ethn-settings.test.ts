import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { getSettings, putSettings } from "../src/lib/admin/ethn-settings";

const url = process.env.ETHN_SETTINGS_TEST_DATABASE_URL, adminUrl = process.env.ETHN_SETTINGS_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000001", staff = "00000000-0000-4000-8000-000000000002", disabled = "00000000-0000-4000-8000-000000000003";
test("owner pricing on disposable restricted database", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true),($2,'staff',false),($3,'owner',false)", [owner, staff, disabled]);
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,merchant_snapshot,settings_version) VALUES ('00000000-0000-4000-8000-000000000010','test',current_date,'held',now()+interval '1 hour',100,'old merchant',1)");
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010',1,now(),now()+interval '1 hour',100,60,100,30,30)");
    const before = await getSettings(pool, async () => owner);
    const input = { version: before.version, merchant: " new merchant ", courts: before.courts.map((c: { id: string; name: string; hours: { id: string }[] }) => ({ id: c.id, name: c.name, rates: c.hours.map(h => ({ hoursId: h.id, hourlyRate: null as string | null })) })) };
    await assert.rejects(getSettings(pool, async () => staff), /FORBIDDEN/);
    await assert.rejects(putSettings(pool, async () => disabled, input), /FORBIDDEN/);
    await assert.rejects(putSettings(pool, async () => owner, { ...input, version: "2" }), /STALE_VERSION/);
    await assert.rejects(putSettings(pool, async () => owner, { ...input, courts: input.courts.slice(1) }), /INVALID_INPUT/);
    const unknown = structuredClone(input); unknown.courts[0].rates[0].hoursId = "999999";
    await assert.rejects(putSettings(pool, async () => owner, unknown), /INVALID_INPUT/);
    assert.equal((await getSettings(pool, async () => owner)).version, "1");
    [input.courts[0].name, input.courts[1].name] = [input.courts[1].name, input.courts[0].name];
    input.courts[0].rates[0].hourlyRate = "9999999999.99";
    assert.deepEqual(await putSettings(pool, async () => owner, input), { version: "2" });
    const after = await getSettings(pool, async () => owner);
    assert.equal(after.merchant, "new merchant"); assert.equal(after.courts[0].name, "Court 2");
    assert.equal(after.courts[0].hours[0].hourlyRate, "9999999999.99"); assert.equal(after.courts[0].hours[1].hourlyRate, null);
    assert.deepEqual((await admin.query("SELECT b.merchant_snapshot, i.hourly_rate::text FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id")).rows[0], { merchant_snapshot: "old merchant", hourly_rate: "100.00" });
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.audit WHERE action='settings.update'")).rows[0].n, 1);
  } finally { await pool.end(); await admin.end(); }
});
