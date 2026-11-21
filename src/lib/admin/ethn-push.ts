import type { Pool } from "pg";
import * as webpush from "web-push";
import { getStaff, type StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
type Keys = { publicKey: string; privateKey: string; subject: string };
type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64 = (s: string, bytes: number) => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return false;
  try { const b = Buffer.from(s, "base64url"); return b.length === bytes && b.toString("base64url") === s; } catch { return false; }
};
export function pushConfig(env: NodeJS.ProcessEnv = process.env): Keys | null {
  if (env.ETHN_WEB_PUSH_ENABLED !== "1") return null;
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env;
  if (!publicKey || !privateKey || !subject || !/^https:\/\//.test(subject) && !/^mailto:[^\s@]+@[^\s@]+$/.test(subject)) throw new Error("NOT_CONFIGURED");
  if (!b64(publicKey, 65) || !b64(privateKey, 32)) throw new Error("NOT_CONFIGURED");
  return { publicKey, privateKey, subject };
}
export function validEndpoint(value: string) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && u.port === "" && !u.hash && u.href.length <= 2048 &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" || host.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export function validSubscription(v: unknown): v is Subscription {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const x = v as Record<string, unknown>;
  if (Object.keys(x).sort().join(",") !== "endpoint,keys" || typeof x.endpoint !== "string" || !validEndpoint(x.endpoint) || !x.keys || typeof x.keys !== "object" || Array.isArray(x.keys)) return false;
  const k = x.keys as Record<string, unknown>;
  return Object.keys(k).sort().join(",") === "auth,p256dh" && typeof k.auth === "string" && b64(k.auth, 16) && typeof k.p256dh === "string" && b64(k.p256dh, 65);
}
export async function addPushSubscription(pool: Db, verify: StaffVerifier, sub: Subscription) {
  if (!validSubscription(sub)) throw new Error("INVALID_INPUT");
  const { userId } = await getStaff(pool, verify);
  const c = await pool.connect();
  let discarded = false;
  let committing = false;
  try {
    await c.query("BEGIN");
    const staff = await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role IN ('owner','staff') FOR UPDATE", [userId]);
    if (!staff.rows[0]) throw new Error("FORBIDDEN");
    const r = await c.query(`INSERT INTO ethn.push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,disabled_at=NULL
      WHERE ethn.push_subscriptions.user_id=EXCLUDED.user_id RETURNING id`, [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]);
    if (!r.rows[0]) throw new Error("SUBSCRIPTION_IN_USE");
    committing = true;
    await c.query("COMMIT");
    return { subscriptionId: r.rows[0].id as string };
  } catch (e) {
    if (committing) discarded = true;
    else try { await c.query("ROLLBACK"); } catch { discarded = true; }
    throw e;
  } finally { c.release(discarded); }
}
export async function removePushSubscription(pool: Db, verify: StaffVerifier, id: string) {
  const { userId } = await getStaff(pool, verify);
  if (!uuid.test(id)) throw new Error("INVALID_INPUT");
  const c = await pool.connect();
  try { await c.query("UPDATE ethn.push_subscriptions SET disabled_at=clock_timestamp() WHERE id=$1 AND user_id=$2 AND disabled_at IS NULL", [id, userId]); }
  finally { c.release(); }
}
export async function pushSettings(pool: Db, verify: StaffVerifier, env = process.env) {
  const { userId } = await getStaff(pool, verify);
  const config = pushConfig(env);
  if (!config) return { configured: false, publicKey: null, subscriptionId: null };
  const c = await pool.connect();
  try {
    const r = await c.query("SELECT id FROM ethn.push_subscriptions WHERE user_id=$1 AND disabled_at IS NULL ORDER BY created_at DESC LIMIT 1", [userId]);
    return { configured: true, publicKey: config.publicKey, subscriptionId: (r.rows[0]?.id as string | undefined) ?? null };
  } finally { c.release(); }
}
type Sender = (subscription: Subscription, payload: string, options: Record<string, unknown>) => Promise<unknown>;
const send: Sender = (s, p, o) => webpush.sendNotification(s, p, o);
export async function drainPush(pool: Db, config: Keys, sender: Sender = send) {
  const c = await pool.connect();
  let claimed: { notification_id: string; subscription_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; link: string }[] = [];
  let discarded = false;
  let committing = false;
  try {
    await c.query("BEGIN");
    await c.query(`INSERT INTO ethn.push_deliveries(notification_id,subscription_id)
      SELECT n.id,s.id FROM ethn.notifications n JOIN ethn.push_subscriptions s ON s.user_id=n.recipient AND s.disabled_at IS NULL
      JOIN ethn.staff_access a ON a.user_id=s.user_id AND a.enabled AND a.role IN ('owner','staff')
      WHERE n.read_at IS NULL AND n.created_at >= clock_timestamp()-interval '24 hours' AND n.created_at >= s.created_at
      ON CONFLICT DO NOTHING`);
    const r = await c.query(`WITH due AS (SELECT d.notification_id,d.subscription_id FROM ethn.push_deliveries d
      WHERE d.status='pending' AND d.attempts<5 AND d.next_attempt_at<=clock_timestamp() AND (d.claimed_at IS NULL OR d.claimed_at<clock_timestamp()-interval '2 minutes')
      ORDER BY d.next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED)
      UPDATE ethn.push_deliveries d SET claimed_at=clock_timestamp() FROM due x WHERE d.notification_id=x.notification_id AND d.subscription_id=x.subscription_id
      RETURNING d.notification_id,d.subscription_id`);
    for (const row of r.rows) {
      const item = await c.query(`SELECT d.notification_id,d.subscription_id,s.endpoint,s.p256dh,s.auth,n.title,n.body,n.link
        FROM ethn.push_deliveries d JOIN ethn.push_subscriptions s ON s.id=d.subscription_id JOIN ethn.notifications n ON n.id=d.notification_id
        JOIN ethn.staff_access a ON a.user_id=s.user_id AND a.enabled AND a.role IN ('owner','staff')
        WHERE d.notification_id=$1 AND d.subscription_id=$2 AND s.disabled_at IS NULL AND n.read_at IS NULL`, [row.notification_id,row.subscription_id]);
      if (item.rows[0]) claimed.push(item.rows[0]);
    }
    committing = true;
    await c.query("COMMIT");
  } catch (e) {
    if (committing) discarded = true;
    else try { await c.query("ROLLBACK"); } catch { discarded = true; }
    throw e;
  } finally { c.release(discarded); }
  let sent = 0;
  for (const x of claimed) {
    try {
      const check = await pool.connect();
      let eligible = false;
      try { eligible = (await check.query(`SELECT 1 FROM ethn.push_deliveries d JOIN ethn.push_subscriptions s ON s.id=d.subscription_id
        JOIN ethn.notifications n ON n.id=d.notification_id JOIN ethn.staff_access a ON a.user_id=s.user_id
        WHERE d.notification_id=$1 AND d.subscription_id=$2 AND d.status='pending' AND s.disabled_at IS NULL
          AND n.read_at IS NULL AND a.enabled AND a.role IN ('owner','staff')`, [x.notification_id,x.subscription_id])).rows.length > 0; }
      finally { check.release(); }
      if (!eligible) continue;
      try { await sender({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, JSON.stringify({ id: x.notification_id, link: x.link }), { TTL: 300, timeout: 5000, vapidDetails: config, topic: x.notification_id.replaceAll("-", "").slice(0, 32) }); }
      catch (e) { if (e && typeof e === "object") Object.defineProperty(e, "pushSendFailure", { value: true }); throw e; }
      await pool.connect().then(async q => { try { await q.query("UPDATE ethn.push_deliveries SET status='sent',claimed_at=NULL WHERE notification_id=$1 AND subscription_id=$2", [x.notification_id,x.subscription_id]); } finally { q.release(); } }); sent++;
    } catch (e) {
      if (!e || typeof e !== "object" || !("pushSendFailure" in e)) throw e;
      const status = (e as { statusCode?: number })?.statusCode;
      const q = await pool.connect();
      try {
        if (status === 404 || status === 410) {
          await q.query("UPDATE ethn.push_subscriptions SET disabled_at=clock_timestamp() WHERE id=$1", [x.subscription_id]);
          await q.query("UPDATE ethn.push_deliveries SET status='dead',claimed_at=NULL WHERE notification_id=$1 AND subscription_id=$2", [x.notification_id,x.subscription_id]);
        } else await q.query(`UPDATE ethn.push_deliveries SET attempts=LEAST(attempts+1,5),status=CASE WHEN attempts>=4 THEN 'dead' ELSE 'pending' END,
          next_attempt_at=clock_timestamp()+make_interval(secs=>LEAST(3600,30*(2^LEAST(attempts,6))::int)),claimed_at=NULL WHERE notification_id=$1 AND subscription_id=$2`, [x.notification_id,x.subscription_id]);
      } finally { q.release(); }
    }
  }
  return { processed: claimed.length, sent };
}
