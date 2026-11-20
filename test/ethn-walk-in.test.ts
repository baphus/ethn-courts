import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCheckout } from "../src/lib/booking/checkout";
import { createWalkIn } from "../src/lib/admin/ethn-walk-ins";

const url = process.env.ETHN_WALK_IN_TEST_DATABASE_URL, adminUrl = process.env.ETHN_WALK_IN_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000021", staff = "00000000-0000-4000-8000-000000000022", disabled = "00000000-0000-4000-8000-000000000023";
const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const at = (hour: number, slot = 0) => { const start = new Date(`${day}T00:00:00.000Z`); start.setUTCHours(hour - 8, slot * 30); return start; };

test("prepaid walk-in on fresh restricted local database", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  const walkIn = (over: Record<string, unknown> = {}, actor = staff) => createWalkIn(pool, async () => actor, { courtId: "1", date: day, start: at(10, 0).toISOString(), end: at(11, 0).toISOString(), guestName: "  Desk Guest  ", guestPhone: "0917 000 0000", method: "cash", ...over });
  try {
    await admin.query("INSERT INTO ethn.court_hours(court_id,weekday,opens,closes,hourly_rate) VALUES (1,0,'08:00','17:00',200)");
    await admin.query("UPDATE ethn.settings SET merchant='ETHN GCash 0917-000-0000'");
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true),($2,'staff',true),($3,'staff',false)", [owner, staff, disabled]);

    await assert.rejects(walkIn({}, null as unknown as string), /UNAUTHENTICATED/);
    await assert.rejects(walkIn({}, disabled), /FORBIDDEN/);
    await assert.rejects(walkIn({}, "00000000-0000-4000-8000-000000000099"), /FORBIDDEN/);
    await assert.rejects(walkIn({ guestName: "   " }), /INVALID_INPUT/);
    await assert.rejects(walkIn({ guestName: "x".repeat(101) }), /INVALID_INPUT/);
    await assert.rejects(walkIn({ guestPhone: "abc" }), /INVALID_INPUT/);
    await assert.rejects(walkIn({ method: "card" }), /INVALID_INPUT/);
    await assert.rejects(walkIn({ start: at(11, 0).toISOString(), end: at(10, 0).toISOString() }), /INVALID_INPUT/);
    await assert.rejects(walkIn({ courtId: "999" }), /COURT_UNAVAILABLE/);
    await assert.rejects(walkIn({ start: at(4, 0).toISOString(), end: at(5, 0).toISOString() }), /INVALID_SCHEDULE|CLOSED/);

    const cash = await walkIn();
    assert.equal(cash.total, "200.00");
    assert.equal(cash.method, "cash");
    const row = (await admin.query(`SELECT b.status, b.total::text, b.guest_name, b.guest_phone, b.merchant_snapshot,
        a.state AS allocation, i.hourly_rate::text, i.amount::text,
        p.status AS payment_status, p.method, p.accepted_reference, p.collected_amount::text, p.received_at, p.verified_at, p.verified_by
      FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id JOIN ethn.court_allocations a ON a.item_id=i.id JOIN ethn.payments p ON p.booking_id=b.id
      WHERE b.id=$1`, [cash.bookingId])).rows[0];
    assert.deepEqual(row, { status: "confirmed", total: "200.00", guest_name: "Desk Guest", guest_phone: "0917 000 0000", merchant_snapshot: "ETHN GCash 0917-000-0000", allocation: "confirmed", hourly_rate: "200.00", amount: "200.00", payment_status: "accepted", method: "cash", accepted_reference: null, collected_amount: "200.00", received_at: row.received_at, verified_at: row.verified_at, verified_by: staff });
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.audit WHERE booking_id=$1 AND action='walkin.create'", [cash.bookingId])).rows[0].n, 1);
    await assert.rejects(walkIn(), /SLOT_TAKEN/);

    await admin.query("UPDATE ethn.settings SET merchant=NULL");
    await assert.rejects(walkIn({ method: "gcash", reference: "GC-1", start: at(12, 0).toISOString(), end: at(13, 0).toISOString() }), /NOT_CONFIGURED/);
    await admin.query("UPDATE ethn.settings SET merchant='ETHN GCash 0917-000-0000'");
    await assert.rejects(walkIn({ method: "gcash", start: at(12, 0).toISOString(), end: at(13, 0).toISOString() }), /INVALID_INPUT/);

    const gcash = await walkIn({ method: "gcash", reference: "  GC-123  ", start: at(12, 0).toISOString(), end: at(13, 30).toISOString() });
    assert.equal(gcash.total, "300.00");
    assert.deepEqual((await admin.query("SELECT status, method, accepted_reference, claimed_reference, collected_amount::text AS collected, merchant_snapshot FROM ethn.payments WHERE booking_id=$1", [gcash.bookingId])).rows[0], { status: "accepted", method: "gcash", accepted_reference: "GC-123", claimed_reference: null, collected: "300.00", merchant_snapshot: "ETHN GCash 0917-000-0000" });
    await assert.rejects(walkIn({ method: "gcash", reference: "GC-123", start: at(12, 30).toISOString(), end: at(13, 0).toISOString() }), /REFERENCE_TAKEN/);

    await admin.query("DELETE FROM ethn.court_hours WHERE court_id=1");
    await assert.rejects(walkIn({ start: at(14, 0).toISOString(), end: at(15, 0).toISOString() }), /INVALID_RATE/);
    await admin.query("INSERT INTO ethn.court_hours(court_id,weekday,opens,closes,hourly_rate) VALUES (1,0,'08:00','17:00',200)");

    const stale = at(15, 0);
    const hold = await createCheckout(pool, { ownerToken: randomUUID(), idempotencyKey: randomUUID(), date: day, ranges: [{ courtId: "1", start: stale.toISOString(), end: new Date(stale.getTime() + 3600000).toISOString() }], displayedTotal: "200.00", displayedVersion: "1" });
    await assert.rejects(walkIn({ start: stale.toISOString(), end: new Date(stale.getTime() + 3600000).toISOString() }), /SLOT_TAKEN/);
    await admin.query("UPDATE ethn.bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [hold.checkoutId]);
    const reused = await walkIn({ start: stale.toISOString(), end: new Date(stale.getTime() + 3600000).toISOString() });
    assert.equal(reused.total, "200.00");
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1", [hold.checkoutId])).rows[0].status, "expired");

    await admin.query("REVOKE INSERT ON ethn.payments FROM ethn_checkout");
    try { await assert.rejects(walkIn({ start: at(17, 0).toISOString(), end: at(18, 0).toISOString() }), /WALK_IN_UNAVAILABLE/); }
    finally { await admin.query("GRANT INSERT ON ethn.payments TO ethn_checkout"); }
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.bookings WHERE guest_name='Desk Guest'")).rows[0].n, 4);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id=b.id WHERE i.starts_at=$1", [at(17, 0).toISOString()])).rows[0].n, 0);
  } finally { await pool.end(); await admin.end(); }
});
