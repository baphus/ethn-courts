import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { parsePesos, priceItems } from "./core";
import { resolveSchedule } from "./schedule";
import { expireExtensionHolds } from './extension-expiry';

type CheckoutInput = {
  ownerToken: string; idempotencyKey: string; date: string;
  ranges: { courtId: string; start: string; end: string }[];
  displayedTotal: string; displayedVersion: string;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const pesos = (value: bigint) => `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, "0")}`;

export async function createCheckout(pool: Pick<Pool, "connect">, input: CheckoutInput) {
  if (!input || typeof input.ownerToken !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.ownerToken) || typeof input.idempotencyKey !== "string" || !/^[\x21-\x7e]{1,200}$/.test(input.idempotencyKey) || typeof input.date !== "string" || !Array.isArray(input.ranges) || !input.ranges.length || input.ranges.length > 100 || typeof input.displayedTotal !== "string" || typeof input.displayedVersion !== "string" || !/^[1-9]\d*$/.test(input.displayedVersion) || BigInt(input.displayedVersion) > BigInt("9223372036854775807")) throw new Error("INVALID_INPUT");
  let displayedTotal: string;
  try { displayedTotal = pesos(parsePesos(input.displayedTotal)); } catch { throw new Error("INVALID_INPUT"); }
  const ranges = input.ranges.map(r => {
    if (!r || typeof r.courtId !== "string" || !/^[1-9]\d*$/.test(r.courtId) || BigInt(r.courtId) > BigInt("9223372036854775807") || typeof r.start !== "string" || typeof r.end !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.start) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.end)) throw new Error("INVALID_INPUT");
    const start = new Date(r.start), end = new Date(r.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.toISOString() !== r.start || end.toISOString() !== r.end || end <= start) throw new Error("INVALID_INPUT");
    return { courtId: r.courtId, start: r.start, end: r.end };
  }).sort((a, b) => BigInt(a.courtId) < BigInt(b.courtId) ? -1 : BigInt(a.courtId) > BigInt(b.courtId) ? 1 : a.start.localeCompare(b.start));
  if (ranges.some((r, i) => i > 0 && r.courtId === ranges[i - 1].courtId && r.start < ranges[i - 1].end)) throw new Error("INVALID_INPUT");
  const ownerHash = hash(input.ownerToken.toLowerCase());
  const fingerprint = hash(JSON.stringify({ date: input.date, ranges, displayedTotal, displayedVersion: input.displayedVersion }));
  const client = await pool.connect();
  let committing = false;
  let discard = false;
  try {
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO ethn.idempotency (owner_hash, operation, key, fingerprint, result) VALUES ($1, 'checkout', $2, $3, NULL) ON CONFLICT DO NOTHING RETURNING key", [ownerHash, input.idempotencyKey, fingerprint]);
    const existing = await client.query("SELECT fingerprint, result FROM ethn.idempotency WHERE owner_hash = $1 AND operation = 'checkout' AND key = $2 FOR UPDATE", [ownerHash, input.idempotencyKey]);
    const row = existing.rows[0];
    if (!row || row.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (!inserted.rows.length) {
      if (row.result == null) throw new Error("IDEMPOTENCY_INCOMPLETE");
      committing = true;
      await client.query("COMMIT");
      return row.result;
    }
    const settings = (await client.query("SELECT version::text, interval_minutes, minimum_minutes, anchor_minutes, horizon_days, hold_minutes, merchant FROM ethn.settings WHERE singleton = true FOR UPDATE")).rows[0];
    if (!settings) throw new Error("NOT_CONFIGURED");
    const paymentMethods = (await client.query('SELECT id,name,instructions,(qr IS NOT NULL) AS "qrAvailable",version::text FROM ethn.payment_methods WHERE enabled ORDER BY name,id')).rows;
    if (!paymentMethods.length) throw new Error('NOT_CONFIGURED');
    // shortcut: all-court lock serializes small venue inventory; revisit on measured contention.
    const courts = (await client.query("SELECT id::text, active FROM ethn.courts ORDER BY id FOR UPDATE")).rows;
    await expireExtensionHolds(client);
    const hours = (await client.query("SELECT court_id::text, weekday, opens::text, closes::text, hourly_rate::text FROM ethn.court_hours")).rows;
    const candidates = (await client.query("SELECT DISTINCT b.id FROM ethn.bookings b JOIN ethn.booking_items i ON i.booking_id = b.id JOIN ethn.court_allocations a ON a.item_id = i.id JOIN unnest($1::bigint[], $2::timestamptz[], $3::timestamptz[]) AS r(court_id, starts_at, ends_at) ON r.court_id = a.court_id AND tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(a.starts_at, a.ends_at, '[)') WHERE b.status = 'held' AND a.state = 'held' ORDER BY b.id", [ranges.map(r => r.courtId), ranges.map(r => r.start), ranges.map(r => r.end)])).rows.map(r => r.id);
    await client.query("SELECT id FROM ethn.bookings WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [candidates]);
    const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
    const expired = (await client.query("UPDATE ethn.bookings SET status = 'expired' WHERE id = ANY($1::uuid[]) AND status = 'held' AND expires_at <= $2 RETURNING id", [candidates, now])).rows.map(r => r.id);
    await client.query("UPDATE ethn.court_allocations SET state = 'expired' WHERE state = 'held' AND item_id IN (SELECT id FROM ethn.booking_items WHERE booking_id = ANY($1::uuid[]))", [expired]);
    const resolved = resolveSchedule({ date: input.date, now, anchorMinutes: settings.anchor_minutes, interval: settings.interval_minutes, minimum: settings.minimum_minutes, horizonDays: settings.horizon_days, courts, hours, requests: ranges.map(r => ({ courtId: r.courtId, start: new Date(r.start), end: new Date(r.end) })) });
    if ("error" in resolved) throw new Error(resolved.error);
    const total = pesos(priceItems(resolved.ranges));
    const changed = total !== displayedTotal || settings.version !== input.displayedVersion;
    const deadline = (await client.query("SELECT clock_timestamp() + $1::integer * interval '1 minute' AS expires_at", [settings.hold_minutes])).rows[0].expires_at as Date;
    const bookingId = randomUUID();
    const items = resolved.ranges.map(r => ({ courtId: r.courtId, start: r.start.toISOString(), end: r.end.toISOString(), rate: pesos(parsePesos(r.rate)), minutes: r.minutes, amount: pesos(priceItems([r])) }));
    const result = { checkoutId: bookingId, items, total, intervalMinutes: settings.interval_minutes as number, expiresAt: deadline.toISOString(), settingsVersion: settings.version as string, merchant: settings.merchant as string, paymentMethods, priceChanged: changed, acknowledgementRequired: changed };
    await client.query("INSERT INTO ethn.bookings (id, owner_hash, operating_date, status, expires_at, total, price_acknowledged, merchant_snapshot, settings_version,payment_methods_snapshot) VALUES ($1, $2, $3, 'held', $4, $5, $6, $7, $8,$9::jsonb)", [bookingId, ownerHash, input.date, deadline, total, !changed, settings.merchant, settings.version,JSON.stringify(paymentMethods)]);
    for (const item of items) {
      const itemId = randomUUID();
      await client.query("INSERT INTO ethn.booking_items (id, booking_id, court_id, starts_at, ends_at, hourly_rate, duration_minutes, amount, interval_minutes, minimum_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [itemId, bookingId, item.courtId, item.start, item.end, item.rate, item.minutes, item.amount, settings.interval_minutes, settings.minimum_minutes]);
      await client.query("INSERT INTO ethn.court_allocations (id, item_id, court_id, starts_at, ends_at, state, expires_at) VALUES ($1,$2,$3,$4,$5,'held',$6)", [randomUUID(), itemId, item.courtId, item.start, item.end, deadline]);
    }
    await client.query("INSERT INTO ethn.audit (booking_id, actor, action, detail) VALUES ($1,$2,'checkout', $3::jsonb)", [bookingId, ownerHash, JSON.stringify({ total, settingsVersion: settings.version })]);
    await client.query("UPDATE ethn.idempotency SET result = $4::jsonb WHERE owner_hash = $1 AND operation = 'checkout' AND key = $2 AND fingerprint = $3", [ownerHash, input.idempotencyKey, fingerprint, JSON.stringify(result)]);
    committing = true;
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (committing) discard = true;
    else { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (!committing && typeof error === "object" && error !== null && "code" in error && error.code === "23P01") throw new Error("SLOT_TAKEN", { cause: error });
    throw error;
  } finally { client.release(discard); }
}
