import test from "node:test";
import assert from "node:assert/strict";
import { Client, Pool } from "pg";
import { addPushSubscription, drainPush, pushConfig, validEndpoint, validSubscription } from "../src/lib/admin/ethn-push.ts";

const url = process.env.ETHN_PUSH_TEST_DATABASE_URL;
const p256dh = Buffer.alloc(65, 1).toString("base64url");
const auth = Buffer.alloc(16, 2).toString("base64url");
const subscription = (suffix: string) => ({ endpoint: `https://fcm.googleapis.com/test/${suffix}?secret=never-log`, keys: { p256dh, auth } });
const vapid = { publicKey: Buffer.alloc(65, 3).toString("base64url"), privateKey: Buffer.alloc(32, 4).toString("base64url"), subject: "mailto:push@example.invalid" };

test("push config stays disabled unless complete and explicitly enabled", () => {
  assert.equal(pushConfig({} as NodeJS.ProcessEnv), null);
  assert.throws(() => pushConfig({ ETHN_WEB_PUSH_ENABLED: "1" } as unknown as NodeJS.ProcessEnv), /NOT_CONFIGURED/);
});

test("push subscription validation restricts provider endpoints and key shapes", () => {
  assert.equal(validEndpoint("https://fcm.googleapis.com/fcm/send/a?token=x"), true);
  assert.equal(validEndpoint("http://fcm.googleapis.com/a"), false);
  assert.equal(validEndpoint("https://fcm.googleapis.com.evil.test/a"), false);
  assert.equal(validEndpoint("https://user@fcm.googleapis.com/a"), false);
  assert.equal(validSubscription(subscription("a")), true);
  assert.equal(validSubscription({ ...subscription("a"), endpoint: "https://evil.test/a" }), false);
  assert.equal(validSubscription({ ...subscription("a"), keys: { ...subscription("a").keys, p256dh: `${p256dh}=` } }), false);
});

test("push migration grants only required writes", { skip: !url }, async () => {
  const admin = new Client({ connectionString: process.env.ETHN_PUSH_TEST_ADMIN_URL });
  await admin.connect();
  try {
    const r = await admin.query(`SELECT table_name,privilege_type,column_name FROM information_schema.column_privileges
      WHERE table_schema='ethn' AND grantee='ethn_checkout' AND table_name IN ('push_subscriptions','push_deliveries')`);
    const grants = new Set(r.rows.map(x => `${x.table_name}:${x.privilege_type}:${x.column_name}`));
    for (const [table,privilege,column] of [
      ["push_subscriptions","INSERT","user_id"],["push_subscriptions","INSERT","endpoint"],["push_subscriptions","SELECT","p256dh"],
      ["push_subscriptions","UPDATE","p256dh"],["push_subscriptions","UPDATE","disabled_at"],
      ["push_deliveries","INSERT","notification_id"],["push_deliveries","UPDATE","status"],["push_deliveries","UPDATE","claimed_at"],
    ]) assert.ok(grants.has(`${table}:${privilege}:${column}`), `${table}:${privilege}:${column}`);
    for (const denied of ["push_subscriptions:UPDATE:user_id","push_subscriptions:UPDATE:endpoint","push_deliveries:DELETE:"]) assert.equal(grants.has(denied), false, denied);
  } finally { await admin.end(); }
});

test("push ownership, recipient isolation, dedupe, concurrent claims, retry and 410 cleanup", { skip: !url }, async () => {
  const admin = new Client({ connectionString: process.env.ETHN_PUSH_TEST_ADMIN_URL });
  const staff = new Pool({ connectionString: url });
  const db = { connect: () => staff.connect() };
  await admin.connect();
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const n1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", n2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", n3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const verifyA = async () => a;
  const env = { NODE_ENV: "test", ETHN_WEB_PUSH_ENABLED: "1", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: vapid.subject } as NodeJS.ProcessEnv;
  const subIds: string[] = [];
  try {
    await admin.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES($1,'owner',true),($2,'staff',true)", [a,b]);
    const created = await addPushSubscription(db, verifyA, subscription("a"));
    subIds.push(created.subscriptionId);
    const same = await addPushSubscription(db, verifyA, subscription("a"));
    assert.equal(same.subscriptionId, created.subscriptionId);
    await assert.rejects(addPushSubscription(db, async () => b, subscription("a")), /SUBSCRIPTION_IN_USE/);
    subIds.push((await addPushSubscription(db, verifyA, subscription("b"))).subscriptionId);
    for (const [id,user,key] of [[n1,a,"push-1"],[n2,a,"push-2"],[n3,b,"push-3"]]) await admin.query(
      "INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link) VALUES($1,$2,$3,'Pending payment','Generic review notice.','/admin/bookings/cccccccc-cccc-4ccc-8ccc-cccccccccccc')", [id,user,key]);

    const sent: { payload: string; endpoint: string }[] = [];
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(r => release = r), reached = new Promise<void>(r => entered = r);
    const sender = async (s: { endpoint: string }, payload: string) => { sent.push({ endpoint: s.endpoint, payload }); entered(); await gate; };
    const first = drainPush(db, vapid, sender);
    await Promise.race([reached, new Promise((_, reject) => setTimeout(() => reject(new Error("push sender was not reached")), 5000))]);
    assert.equal((await drainPush(db, vapid, async () => { throw new Error("duplicate claim"); })).processed, 0);
    release();
    assert.equal((await first).sent, 4);
    assert.equal(sent.length, 4);
    assert.ok(sent.every(x => [subscription("a").endpoint,subscription("b").endpoint].includes(x.endpoint)));
    assert.ok(sent.every(x => Object.keys(JSON.parse(x.payload)).sort().join() === "id,link"));
    assert.ok(sent.every(x => !x.payload.includes("never-log")));
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.push_deliveries WHERE notification_id=$1", [n1])).rows[0].n, 2);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.push_deliveries WHERE notification_id=$1", [n2])).rows[0].n, 2);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.push_deliveries WHERE notification_id=$1", [n3])).rows[0].n, 0);

    const retryId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await admin.query("INSERT INTO ethn.notifications(id,recipient,event_key,title,body,link) VALUES($1,$2,'push-retry','Private PII title','Private body','/admin/bookings/cccccccc-cccc-4ccc-8ccc-cccccccccccc')", [retryId,a]);
    await drainPush(db, vapid, async () => { throw Object.assign(new Error("temporary"), { statusCode: 503 }); });
    const retry = await admin.query("SELECT status,attempts,claimed_at FROM ethn.push_deliveries WHERE notification_id=$1", [retryId]);
    assert.equal(retry.rows.length, 2);
    assert.ok(retry.rows.every(x => x.status === "pending" && x.attempts === 1 && x.claimed_at === null));
    await admin.query("UPDATE ethn.push_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE notification_id=$1", [retryId]);
    await drainPush(db, vapid, async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); });
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM ethn.push_subscriptions WHERE disabled_at IS NOT NULL AND user_id=$1", [a])).rows[0].n, 2);
    assert.ok(env.ETHN_WEB_PUSH_ENABLED);
  } finally {
    await admin.query("DELETE FROM ethn.push_subscriptions WHERE user_id IN ($1,$2)", [a,b]);
    await admin.query("DELETE FROM ethn.notifications WHERE id IN ($1,$2,$3,$4)", [n1,n2,n3,"ffffffff-ffff-4fff-8fff-ffffffffffff"]);
    await admin.query("DELETE FROM ethn.staff_access WHERE user_id IN ($1,$2)", [a,b]);
    await staff.end(); await admin.end();
  }
});
