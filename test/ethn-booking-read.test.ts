import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {manilaDateStr} from '../src/lib/booking/slots';
import { ethnBookingDetail, ethnDashboard, searchEthnBookings } from "../src/lib/admin/ethn-booking-read";

const url = process.env.ETHN_ADMIN_BOOKING_READ_TEST_DATABASE_URL;
const adminUrl = process.env.ETHN_ADMIN_BOOKING_READ_TEST_ADMIN_URL;
const owner = "00000000-0000-4000-8000-000000000021", staff = "00000000-0000-4000-8000-000000000022", disabled = "00000000-0000-4000-8000-000000000023";
const uuid = () => randomUUID();

test("query validation rejects malformed or unbounded parameters", async () => {
  let connections = 0;
  const pool = { connect: async () => { connections++; throw new Error("unexpected DB access"); } };
  const verify = async () => staff;
  for (const query of ["q=x&q=y", "unknown=x", "status=held", "status=pending&status=held", "status=pending&status=rejected&status=confirmed&status=completed&status=expired&status=cancelled&status=refunded&status=pending", "archived=current", "archived=true&archived=all", "page=1001", "limit=0", "from=2026-02-30", "from=2026-01-02&to=2026-01-01"]) {
    await assert.rejects(searchEthnBookings(pool as never, verify, new URLSearchParams(query)), /INVALID_INPUT/);
  }
  assert.equal(connections, 0);
});

test("restricted staff dashboard and booking reads on disposable ETHN database", { skip: !url || !adminUrl }, async () => {
  const pool = new Pool({ connectionString: url }), admin = new Pool({ connectionString: adminUrl });
  const day = manilaDateStr(new Date(Date.now() - 7 * 60 * 60_000));
  const past = new Date(Date.now() - 30 * 60_000).toISOString(), future = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  let hour = 0;
  const nextStart = () => new Date(Date.parse(past) - 2 * 3_600_000 + hour++ * 3_600_000).toISOString();
  const booking = async (status: string, fields: Record<string, unknown> = {}) => {
    const id = uuid();
    await admin.query(`INSERT INTO ethn.bookings(id, owner_hash, operating_date, status, expires_at, total, guest_name, guest_email, guest_phone, tracking_code, tracking_hash, settings_version, created_at)
      VALUES($1,'OWNER_HASH_SECRET',$2,$3,clock_timestamp()+interval '1 hour',100,'Percent % Guest','p@example.test','09170000000',$4,$5,1,clock_timestamp())`, [id, day, status, `TC${id.replaceAll("-", "").slice(0, 10)}`, `TRACKING_HASH_SECRET_${id}`]);
    const item = uuid(), start = fields.start ?? nextStart();
    await admin.query(`INSERT INTO ethn.booking_items(id,booking_id,court_id,starts_at,ends_at,hourly_rate,duration_minutes,amount,interval_minutes,minimum_minutes) VALUES($1,$2,1,$3,$4,100,60,100,30,30)`, [item, id, start, new Date(Date.parse(String(start)) + 3600000).toISOString()]);
    if (status === "pending" || status === "confirmed" || status === "expired") await admin.query("INSERT INTO ethn.court_allocations(id,item_id,court_id,starts_at,ends_at,state,expires_at) VALUES($1,$2,1,$3,$4,$5,NULL)", [uuid(), item, start, new Date(Date.parse(String(start)) + 3600000).toISOString(), status]);
    return id;
  };
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'owner',true),($3,'staff',false)", [owner, staff, disabled]);
    const futurePending = await booking("pending", { start: future });
    const overduePending = await booking("pending");
    await booking("confirmed"); await booking("completed"); await booking("expired");
    const held = await booking("held");
    await admin.query("UPDATE ethn.bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [held]);
    const rejected = await booking("rejected");
    await admin.query(`INSERT INTO ethn.payments(id,booking_id,method,status,claimed_amount,claimed_reference,created_at) VALUES($1,$2,'gcash','exception',100,'R-1',clock_timestamp())`, [uuid(), overduePending]);
    await admin.query("UPDATE ethn.payments SET reviewed_at=clock_timestamp(),reviewed_by=$1,review_reason='late review' WHERE booking_id=$2", [owner, overduePending]);

    for (const auth of [null, disabled, "00000000-0000-4000-8000-000000000099"]) await assert.rejects(ethnDashboard(pool, async () => auth), /UNAUTHENTICATED|FORBIDDEN/);
    const dashboard = await ethnDashboard(pool, async () => owner);
    assert.equal(dashboard.counts.held, 0);
    assert.ok(dashboard.recentBookings.every(row => row.status !== "held"));
    assert.equal(dashboard.counts.pending, 2);
    assert.equal(dashboard.counts.pendingReviewOverdue, 1);
    assert.ok(dashboard.operatingDate === day || dashboard.operatingDate === new Date(Date.now() - 86400000).toISOString().slice(0, 10));
    assert.ok(!JSON.stringify(dashboard).includes("OWNER_HASH_SECRET"));

    const all = await searchEthnBookings(pool, async () => staff, new URLSearchParams());
    assert.equal(all.total, 6);
    assert.ok(all.rows.every(row => row.status !== "held"));

    const matching = await searchEthnBookings(pool, async () => staff, new URLSearchParams(`q=%25%20Guest&status=rejected&from=${day}&to=${day}&page=1&limit=1`));
    assert.equal(matching.total, 1); assert.equal(matching.rows[0].id, rejected);
    const tracking = await searchEthnBookings(pool, async () => staff, new URLSearchParams(`q=TC${rejected.replaceAll("-", "").slice(0, 10)}`));
    assert.equal(tracking.total, 1);
    const page = await searchEthnBookings(pool, async () => staff, new URLSearchParams("status=pending&limit=1&page=2"));
    assert.equal(page.rows.length, 1); assert.equal(page.total, 2);

    await admin.query("UPDATE ethn.bookings SET archived_at=clock_timestamp(), archived_by=$2 WHERE id=$1", [rejected, owner]);
    const query = "status=pending&status=rejected";
    const current = await searchEthnBookings(pool, async () => staff, new URLSearchParams(query));
    assert.equal(current.total, 2);
    assert.ok(current.rows.every(row => row.status === "pending" && !row.archived));
    const archived = await searchEthnBookings(pool, async () => staff, new URLSearchParams(`${query}&archived=true`));
    assert.equal(archived.total, 1);
    assert.equal(archived.rows[0].id, rejected);
    assert.equal(archived.rows[0].archived, true);
    const combined = await searchEthnBookings(pool, async () => staff, new URLSearchParams(`${query}&archived=all&limit=2`));
    assert.equal(combined.total, 3);
    assert.equal(combined.rows.length, 2);
    assert.equal(combined.rows[0].id, rejected);

    const included = await searchEthnBookings(pool, async () => staff, new URLSearchParams(`status=pending&archived=include&q=Guest&from=${day}&to=${day}`));
    assert.equal(included.total, 3);
    assert.deepEqual(new Set(included.rows.map(row => row.id)), new Set([futurePending, overduePending, rejected]));
    const noMatch = await searchEthnBookings(pool, async () => staff, new URLSearchParams("status=pending&archived=include&q=does-not-match"));
    assert.equal(noMatch.total, 0);
    const archivedOnly = await searchEthnBookings(pool, async () => staff, new URLSearchParams("archived=true"));
    assert.deepEqual(archivedOnly.rows.map(row => row.id), [rejected]);
    const legacyAll = await searchEthnBookings(pool, async () => staff, new URLSearchParams("status=pending&archived=all"));
    assert.equal(legacyAll.total, 2);

    const detail = await ethnBookingDetail(pool, async () => staff, overduePending);
    assert.ok(detail);
    assert.equal(detail.payments[0].claimedAmount, "100.00");
    const reviewedAt = detail.payments[0].reviewedAt;
    assert.ok(typeof reviewedAt === "string");
    assert.equal(reviewedAt, new Date(reviewedAt).toISOString());
    assert.deepEqual(Object.keys(detail.payments[0]).sort(), ["acceptedReference", "claimedAmount", "claimedReference", "collectedAmount", "id", "method", "proofAvailable", "receivedAt", "reviewReason", "reviewedAt", "status", "verifiedAt"].sort());
    assert.equal(detail.payments[0].proofAvailable, false);
    assert.ok(!JSON.stringify(detail).includes("OWNER_HASH_SECRET"));
    assert.ok(!JSON.stringify(detail).includes("TRACKING_HASH_SECRET_"));
    assert.equal(await ethnBookingDetail(pool, async () => staff, uuid()), null);
    await assert.rejects(ethnBookingDetail(pool, async () => staff, "invalid"), /INVALID_INPUT/);
    assert.equal((await admin.query("SELECT status FROM ethn.bookings WHERE id=$1", [futurePending])).rows[0].status, "pending");
  } finally { await pool.end(); await admin.end(); }
});
