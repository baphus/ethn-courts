import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { putEthnHours } from "../src/lib/admin/ethn-hours";

const url = process.env.ETHN_HOURS_TEST_DATABASE_URL, adminUrl = process.env.ETHN_HOURS_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000001";
const proposal = (version: string) => ({ version, courts: [1, 2].map(id => ({ id: String(id), active: id === 1, hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: "07:00", closes: "20:00", hourly_rate: "150.00" })) })) });
async function snapshot(admin: Pool) {
  return (await admin.query("SELECT (SELECT json_agg(c ORDER BY id) FROM (SELECT id,active FROM ethn.courts) c) courts, (SELECT json_agg(h ORDER BY id) FROM (SELECT * FROM ethn.court_hours) h) hours, (SELECT version::text FROM ethn.settings) version, (SELECT count(*)::int FROM ethn.audit) audits")).rows[0];
}
test("owner changes hours without changing frozen item", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role) VALUES ($1,'owner')", [owner]);
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES ('00000000-0000-4000-8000-000000000010','test',current_date,'expired',now(),100,1)");
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010',1,now(),now()+interval '1 hour',100,60,100,30,30)");
    await assert.rejects(putEthnHours(pool, async () => owner, proposal("2")), /STALE_VERSION/);
    assert.deepEqual(await putEthnHours(pool, async () => owner, proposal("1")), { version: "2" });
    assert.deepEqual((await admin.query("SELECT id::text,active FROM ethn.courts ORDER BY id")).rows, [{ id: "1", active: true }, { id: "2", active: false }]);
    assert.equal((await admin.query("SELECT count(*)::int n FROM ethn.court_hours WHERE opens='07:00' AND closes='20:00' AND hourly_rate=150")).rows[0].n, 14);
    assert.equal((await admin.query("SELECT amount::text FROM ethn.booking_items")).rows[0].amount, "100.00");
    assert.deepEqual((await admin.query("SELECT actor,detail FROM ethn.audit WHERE action='hours.update'")).rows, [{ actor: owner, detail: { oldVersion: "1", newVersion: "2", courtIds: ["1", "2"] } }]);
  } finally { await pool.end(); await admin.end(); }
});
test("future pending allocation blocks changes atomically", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES ('00000000-0000-4000-8000-000000000020','test',current_date+2,'pending',now()+interval '1 hour',100,2)");
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020',1,now()+interval '2 days',now()+interval '2 days 1 hour',100,60,100,30,30)");
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state) SELECT '00000000-0000-4000-8000-000000000022',id,court_id,starts_at,ends_at,'pending' FROM ethn.booking_items WHERE id='00000000-0000-4000-8000-000000000021'");
    const before = await snapshot(admin), input = proposal("2"); input.courts[0].active = false;
    await assert.rejects(putEthnHours(pool, async () => owner, input), /HOURS_CONFLICT/);
    assert.deepEqual(await snapshot(admin), before);
  } finally { await pool.end(); await admin.end(); }
});
