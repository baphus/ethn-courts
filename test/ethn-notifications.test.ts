import test from "node:test";
import assert from "node:assert/strict";
import { Client, Pool } from "pg";
import { getSidebarCounts, listInbox, markAllInboxRead, markInboxRead } from "../src/lib/admin/ethn-notifications";
import { lockBookingAlertOwners, recordNewBookingAlerts } from "../src/lib/booking/ethn-booking-alerts";

test("sidebar counts and bulk read reject unauthenticated requests without a database connection", async () => {
  const pool = { connect: async () => assert.fail("must authenticate before accessing the database") };
  await assert.rejects(getSidebarCounts(pool, async () => null), /UNAUTHENTICATED/);
  await assert.rejects(markAllInboxRead(pool, async () => null), /UNAUTHENTICATED/);
});

const url = process.env.ETHN_NOTIFICATIONS_TEST_DATABASE_URL;
test("persistent notifications isolate recipients, deduplicate booking alerts and persist read state", { skip: !url }, async () => {
  const admin = new Client({ connectionString: process.env.ETHN_NOTIFICATIONS_TEST_ADMIN_URL });
  const staff = new Pool({ connectionString: url });
  const connect = () => staff.connect();
  await admin.connect();
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", booking = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'owner',true)", [a,b]);
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES($1,'h',current_date,'pending',now()+interval '1 hour',10,1)", [booking]);
    const verify = async () => a;
    const client = await staff.connect();
    try {
      await client.query("BEGIN");
      const owners = await lockBookingAlertOwners(client);
      await recordNewBookingAlerts(client, booking, "online", owners);
      await recordNewBookingAlerts(client, booking, "online", owners);
      await client.query("COMMIT");
    } finally { client.release(); }
    const rows = await listInbox({ connect }, verify);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "Payment proof submitted");
    assert.equal(rows[0].kind, "proof_submitted");
    assert.deepEqual(rows[0].booking && { ...rows[0].booking }, { customerName: "Customer name unavailable", reference: booking, slots: [], amount: "10.00", amountKind: "booking_total" });
    const { rows: emails } = await admin.query("SELECT payload FROM ethn.email_outbox WHERE booking_id=$1 AND kind='booking_owner_alert' ORDER BY payload->>'ownerId'", [booking]);
    assert.deepEqual(emails.map(row => row.payload), [a, b].map(ownerId => ({ ownerId, source: "online" })));
    assert.ok(rows.every(r => r.link === `/admin/bookings/${booking}`));
    await admin.query("INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link) VALUES(gen_random_uuid(),$1,'exception:retired','Late payment exception','Retired review notice.','/admin/exceptions')", [a]);
    assert.deepEqual(await listInbox({ connect }, verify), rows);
    const grants = await admin.query(`SELECT privilege_type, column_name FROM information_schema.column_privileges WHERE table_schema='ethn' AND table_name='notifications' AND grantee='ethn_checkout'`);
    assert.deepEqual(grants.rows.map(r => `${r.privilege_type}:${r.column_name}`).sort(), ["INSERT:body", "INSERT:event_key", "INSERT:id", "INSERT:link", "INSERT:recipient", "INSERT:title", "SELECT:body", "SELECT:created_at", "SELECT:event_key", "SELECT:id", "SELECT:link", "SELECT:read_at", "SELECT:recipient", "SELECT:title", "UPDATE:read_at"].sort());
    assert.equal(rows.some(r => /owner_hash|trackingToken|guest_email|guest_phone|proof_id/i.test(JSON.stringify(r))), false);
    const id = rows[0].id;
    const firstRead = await markInboxRead({ connect }, verify, id);
    assert.ok(firstRead);
    assert.equal((await markInboxRead({ connect }, verify, id))!.id, id);
    assert.equal((await listInbox({ connect }, verify, true)).length, 0);
    assert.equal(await markInboxRead({ connect }, async () => b, id), null);
    await admin.query("INSERT INTO ethn.bookings(id,owner_hash,operating_date,status,expires_at,total,settings_version) VALUES(gen_random_uuid(),'held',current_date,'held',now()+interval '1 hour',10,1)");
    await admin.query(`INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link)
      SELECT gen_random_uuid(),$1,'extra:' || n,'Test','Test',$2 FROM generate_series(1,51) AS n`, [a, `/admin/bookings/${booking}`]);
    assert.equal((await listInbox({ connect }, verify, true)).length, 50);
    assert.deepEqual(await getSidebarCounts({ connect }, verify), { pendingBookings: 1, unreadNotifications: 51 });
    const other = await getSidebarCounts({ connect }, async () => b);
    assert.ok(other.unreadNotifications > 0);
    assert.deepEqual(await markAllInboxRead({ connect }, verify), { markedRead: 51 });
    assert.deepEqual(await markAllInboxRead({ connect }, verify), { markedRead: 0 });
    assert.deepEqual(await getSidebarCounts({ connect }, verify), { pendingBookings: 1, unreadNotifications: 0 });
    assert.deepEqual(await getSidebarCounts({ connect }, async () => b), other);
    assert.deepEqual(await listInbox({ connect }, verify, true), []);
    assert.equal((await admin.query("SELECT read_at FROM ethn.notifications WHERE recipient=$1 AND event_key='exception:retired'", [a])).rows[0].read_at, null);
    assert.deepEqual(await markInboxRead({ connect }, verify, id), firstRead);
    await admin.query("UPDATE ethn.staff_access SET enabled=false WHERE user_id=$1", [a]);
    await assert.rejects(getSidebarCounts({ connect }, verify), /FORBIDDEN/);
    await assert.rejects(markAllInboxRead({ connect }, verify), /FORBIDDEN/);
    await assert.rejects(listInbox({ connect }, verify), /FORBIDDEN/);
  } finally { await staff.end(); await admin.end(); }
});
