import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { putEthnHours } from "../src/lib/admin/ethn-hours";
import { getSettings } from "../src/lib/admin/ethn-settings";
import { createCheckout } from "../src/lib/booking/checkout";

const url = process.env.ETHN_HOURS_TEST_DATABASE_URL, adminUrl = process.env.ETHN_HOURS_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000001";
const proposal = (version: string, closes = "20:00") => ({ version, courts: [1, 2].map(id => ({ id: String(id), active: true, hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: "07:00", closes, hourly_rate: "150.00" })) })) });

test("owner authorization, hold expiry, and checkout serialization", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  try {
    const staff = randomUUID(), disabled = randomUUID();
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'staff',false),($2,'owner',false)", [staff, disabled]);
    for (const actor of [staff, disabled]) {
      await assert.rejects(getSettings(pool, async () => actor), /FORBIDDEN/);
      await assert.rejects(putEthnHours(pool, async () => actor, proposal("2")), /FORBIDDEN/);
    }
    const state = await getSettings(pool, async () => owner);
    assert.equal(state.version, "2");
    await admin.query("UPDATE ethn.court_allocations SET state='expired' WHERE state='pending'");
    const booking = randomUUID(), item = randomUUID();
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES ($1,'test',current_date+2,'held',now()+interval '1 hour',100,2)", [booking]);
    await admin.query("INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES ($1,$2,1,now()+interval '2 days',now()+interval '2 days 1 hour',100,60,100,30,30)", [item, booking]);
    await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state,expires_at) SELECT $1,id,court_id,starts_at,ends_at,'held',now()+interval '1 hour' FROM ethn.booking_items WHERE id=$2", [randomUUID(), item]);
    const invalid = proposal("2"); invalid.courts[0].active = false;
    await assert.rejects(putEthnHours(pool, async () => owner, invalid), /HOURS_CONFLICT/);
    await admin.query("UPDATE ethn.bookings SET expires_at=now()-interval '1 second' WHERE id=$1", [booking]);
    assert.deepEqual(await putEthnHours(pool, async () => owner, invalid), { version: "3" });
    await admin.query("UPDATE ethn.court_allocations SET state='expired' WHERE item_id=$1", [item]);
    await admin.query("UPDATE ethn.settings SET merchant='test' WHERE singleton");
    for (let i = 0; i < 4; i++) {
      const version = (await admin.query("SELECT version::text FROM ethn.settings")).rows[0].version;
      const reset = await putEthnHours(pool, async () => owner, proposal(version));
      const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      const start = new Date(`${date}T10:00:00.000Z`), end = new Date(`${date}T10:30:00.000Z`);
      const checkout = { ownerToken: randomUUID(), idempotencyKey: randomUUID(), date, ranges: [{ courtId: "1", start: start.toISOString(), end: end.toISOString() }], displayedTotal: "75.00", displayedVersion: reset.version };
      const [book, edit] = await Promise.allSettled([createCheckout(pool, checkout), putEthnHours(pool, async () => owner, proposal(reset.version, "17:00"))]);
      if (book.status === "fulfilled") { assert.equal(edit.status, "rejected"); assert.match(String(edit.reason), /HOURS_CONFLICT/); }
      else { assert.equal(edit.status, "fulfilled"); assert.match(String(book.reason), /CLOSED|INVALID_INPUT/); }
      const outside = await admin.query("SELECT count(*)::int n FROM ethn.court_allocations a JOIN ethn.booking_items i ON i.id=a.item_id JOIN ethn.bookings b ON b.id=i.booking_id WHERE a.state='held' AND b.expires_at>now() AND NOT EXISTS (SELECT 1 FROM ethn.court_hours h WHERE h.court_id=a.court_id AND h.weekday=extract(dow from b.operating_date) AND (a.starts_at AT TIME ZONE 'Asia/Manila')::time >= h.opens AND (a.ends_at AT TIME ZONE 'Asia/Manila')::time <= h.closes)");
      assert.equal(outside.rows[0].n, 0);
      await admin.query("UPDATE ethn.court_allocations SET state='expired' WHERE state='held'");
    }
  } finally { await pool.end(); await admin.end(); }
});
