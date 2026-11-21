import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";

export const trackingInput = z.union([
  z.object({ token: z.string().regex(/^[0-9a-f]{64}$/i) }).strict(),
  z.object({ code: z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i), email: z.string().trim().email().max(254) }).strict(),
]);

export async function trackBooking(pool: Pick<Pool, "connect">, input: unknown) {
  const parsed = trackingInput.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_INPUT");
  const credential = parsed.data;
  const token = "token" in credential;
  const values = token ? [createHash("sha256").update(credential.token.toLowerCase()).digest("hex")] : [credential.code.toUpperCase(), credential.email];
  const client = await pool.connect();
  try {
    const booking = (await client.query(`SELECT id, operating_date::text, status, total::text FROM ethn.bookings WHERE ${token ? "tracking_hash = $1" : "tracking_code = $1 AND lower(guest_email) = lower($2)"} AND status IN ('pending','confirmed','completed','rejected')`, values)).rows[0];
    if (!booking) return null;
    const items = (await client.query("SELECT c.name AS court, i.starts_at, i.ends_at, i.amount::text FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id WHERE i.booking_id = $1 UNION ALL SELECT c.name AS court, ei.starts_at, ei.ends_at, ei.amount::text FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id=ei.extension_id JOIN ethn.courts c ON c.id=ei.court_id WHERE e.booking_id=$1 AND e.status='confirmed' ORDER BY starts_at, court", [booking.id])).rows;
    const payments = (await client.query("SELECT method, status, claimed_amount::text, review_reason FROM ethn.payments WHERE booking_id = $1 ORDER BY method, status, claimed_amount", [booking.id])).rows;
    return { operatingDate: booking.operating_date, status: booking.status, total: booking.total, items: items.map(i => ({ court: i.court, startsAt: i.starts_at, endsAt: i.ends_at, amount: i.amount })), payments: payments.map(p => ({ method: p.method, status: p.status, claimedAmount: p.claimed_amount, ...(booking.status === "rejected" && p.status === "rejected" && typeof p.review_reason === "string" ? { reviewReason: p.review_reason } : {}) })) };
  } finally { client.release(); }
}
