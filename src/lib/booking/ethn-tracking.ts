import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";

const codeCredential = z.object({ code: z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i), email: z.string().trim().email().max(254) }).strict();
export const trackingInput = z.union([
  z.object({ token: z.string().regex(/^[0-9a-f]{64}$/i) }).strict(),
  codeCredential,
]);
export const openPlayDetails = z.object({
  title: z.string().trim().min(1).max(100).refine(value => !value.includes("\0")),
  description: z.string().trim().max(500).refine(value => !value.includes("\0")),
  eventUrl: z.string().trim().max(256).regex(/^https:\/\/reclub\.co\/m\/[A-Za-z0-9_-]+$/),
}).strict();
export const openPlayUpdate = codeCredential.extend({ listing: openPlayDetails.nullable() });

export async function trackBooking(pool: Pick<Pool, "connect">, input: unknown, update = false) {
  const mutation = update ? openPlayUpdate.safeParse(input) : undefined;
  const parsed = mutation ?? trackingInput.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const credential = parsed.data;
  const token = "token" in credential;
  const values = token ? [createHash("sha256").update(credential.token.toLowerCase()).digest("hex")] : [credential.code.toUpperCase(), credential.email];
  const client = await pool.connect();
  let committing = false, discard = false;
  try {
    if (update) await client.query("BEGIN");
    const booking = (await client.query(`SELECT id, operating_date::text, status, total::text FROM ethn.bookings WHERE ${token ? "tracking_hash = $1" : "tracking_code = $1 AND lower(guest_email) = lower($2)"} AND status IN ('pending','confirmed','completed','rejected','cancelled','refunded')${update ? " FOR UPDATE" : ""}`, values)).rows[0];
    if (!booking) {
      if (update) await client.query("ROLLBACK");
      return null;
    }
    let openPlay;
    if (!token) {
      const active = booking.status === "pending" || booking.status === "confirmed";
      const editable = active && Boolean((await client.query("SELECT 1 FROM ethn.booking_open_play_sessions WHERE booking_id=$1 AND starts_at > clock_timestamp()", [booking.id])).rows.length);
      if (mutation?.success) {
        if (!editable) throw new Error("OPEN_PLAY_NOT_EDITABLE");
        const listing = mutation.data.listing;
        if (listing) await client.query(`INSERT INTO ethn.booking_open_plays (booking_id,title,description,event_url) VALUES ($1,$2,$3,$4)
          ON CONFLICT (booking_id) DO UPDATE SET title=excluded.title,description=excluded.description,event_url=excluded.event_url,removed=false`, [booking.id, listing.title, listing.description, listing.eventUrl]);
        else await client.query("UPDATE ethn.booking_open_plays SET removed=true WHERE booking_id=$1", [booking.id]);
      }
      const listing = (await client.query('SELECT title,description,event_url AS "eventUrl",hidden FROM ethn.booking_open_plays WHERE booking_id=$1 AND NOT removed', [booking.id])).rows[0];
      if (editable || listing) openPlay = { editable, listing: listing ?? null };
    }
    const items = (await client.query("SELECT c.name AS court, i.starts_at, i.ends_at, i.amount::text, i.duration_minutes, i.interval_minutes, i.hourly_rate::text, false AS is_extension FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id WHERE i.booking_id = $1 UNION ALL SELECT c.name AS court, ei.starts_at, ei.ends_at, ei.amount::text, ei.duration_minutes, ei.interval_minutes, ei.hourly_rate::text, true FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id JOIN ethn.courts c ON c.id=ei.court_id WHERE e.booking_id=$1 AND e.status='confirmed' ORDER BY starts_at, court", [booking.id])).rows;
    const payments = (await client.query("SELECT method, status, claimed_amount::text, review_reason FROM ethn.payments WHERE booking_id = $1 ORDER BY method, status, claimed_amount", [booking.id])).rows;
    if (update) { committing = true; await client.query("COMMIT"); }
    return { ...(openPlay ? { openPlay } : {}), operatingDate: booking.operating_date, status: booking.status, total: booking.total, items: items.map(i => ({ court: i.court, startsAt: i.starts_at, endsAt: i.ends_at, amount: i.amount, durationMinutes: i.duration_minutes, intervalMinutes: i.interval_minutes, hourlyRate: i.hourly_rate, isExtension: i.is_extension })), payments: payments.map(p => ({ method: p.method, status: p.status, claimedAmount: p.claimed_amount, ...(booking.status === "rejected" && p.status === "rejected" && typeof p.review_reason === "string" ? { reviewReason: p.review_reason } : {}) })) };
  } catch (error) {
    if (committing) discard = true;
    else if (update) try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
