import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { formatDisplayDate } from "../display-date";
import { gridSlotCount, invoiceMoney, invoiceSlotRate, invoiceTimeRange } from "../booking/invoice-format";
import { parsePesos } from "../booking/core";
import { VENUE_ADDRESS, VENUE_MAP_LINK } from "../venue";
import { isEthnMailAddress } from "./ethn-address";

type Config = { from: string; appUrl: string; bookingId: string; allowLocalHttp?: boolean; ownerEmail?: (id: string) => Promise<string | null> };
type Transport = { sendMail(message: { from: string; to: string; subject: string; text: string; html?: string; messageId: string }): Promise<unknown> };
const notices: Record<string, { title: string; status: string; amount?: string }> = {
  booking_submission: { title: "Payment proof received", status: "Your payment proof is pending review. Your booking is not confirmed yet.", amount: "Booking total" },
  booking_approved: { title: "Booking confirmed", status: "Your booking is confirmed and fully paid.", amount: "Total paid" },
  booking_rejected: { title: "Booking not confirmed", status: "We could not verify your payment proof. Your court is not booked." },
  booking_cancelled: { title: "Booking cancelled", status: "Your court time was released. No refund was recorded for this cancellation." },
  booking_refunded: { title: "Booking refund recorded", status: "Your booking is no longer active. ETHN Courts recorded a refund made outside the booking website.", amount: "Refund recorded" },
};
const manilaDate = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
const manilaTime = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

function scheduleLine({ court, starts_at: start, ends_at: end }: { court: string; starts_at: Date; ends_at: Date }) {
  const day = manilaDate.format(start), endDay = manilaDate.format(end);
  return `${court}: ${day}, ${manilaTime.format(start)} – ${day === endDay ? "" : `${endDay}, `}${manilaTime.format(end)}`;
}
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateEthnOutboxConfig(config: Config) {
  let origin: URL;
  try {
    if (!config || !isEthnMailAddress(config.from) || typeof config.bookingId !== "string" || !uuid.test(config.bookingId)) throw new Error();
    origin = new URL(config.appUrl);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || (origin.protocol !== "https:" && !(config.allowLocalHttp === true && origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) throw new Error();
  } catch { throw new Error("INVALID_OUTBOX_CONFIG"); }
  return origin;
}

export async function drainEthnOutbox(pool: Pick<Pool, "connect">, transport: Transport, config: Config) {
  const origin = validateEthnOutboxConfig(config);
  const client = await pool.connect();
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    const rows = (await client.query(`SELECT id, kind, payload, attempts FROM ethn.email_outbox
      WHERE booking_id = $1 AND ((status = 'pending' AND available_at <= now()) OR (status = 'sending' AND claimed_at < now() - interval '15 minutes'))
      ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 10`, [config.bookingId])).rows;
    const claims: { id: string; kind: string; payload: unknown; attempts: number; token: string }[] = [];
    for (const row of rows) {
      const token = randomUUID();
      if (row.attempts >= 8) {
        await client.query("UPDATE ethn.email_outbox SET status = 'dead', claim_token = $2 WHERE id = $1", [row.id, token]);
      } else {
        await client.query("UPDATE ethn.email_outbox SET status = 'sending', attempts = attempts + 1, claimed_at = now(), claim_token = $2 WHERE id = $1", [row.id, token]);
        claims.push({ ...row, attempts: row.attempts + 1, token });
      }
    }
    const schedule = claims.length ? (await client.query(`SELECT c.name AS court, i.starts_at, i.ends_at
      FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id
      WHERE i.booking_id = $1 ORDER BY i.starts_at, c.name, i.ends_at`, [config.bookingId])).rows.map(scheduleLine) : [];
    const invoice = claims.some(row => row.kind === "booking_approved") ? (await client.query<{
      court: string; starts_at: Date; ends_at: Date; duration_minutes: number; interval_minutes: number;
      hourly_rate: string; amount: string; booking_date: string; method_name: string | null;
    }>(`SELECT c.name AS court, i.starts_at, i.ends_at, i.duration_minutes, i.interval_minutes,
        i.hourly_rate::text, i.amount::text, b.operating_date::text AS booking_date,
        COALESCE(m.value->>'name', pm.name, CASE p.method WHEN 'cash' THEN 'Cash' WHEN 'gcash' THEN 'GCash' ELSE p.method END) AS method_name
      FROM ethn.booking_items i JOIN ethn.bookings b ON b.id = i.booking_id JOIN ethn.courts c ON c.id = i.court_id
      LEFT JOIN LATERAL (SELECT method FROM ethn.payments WHERE booking_id = b.id AND extension_id IS NULL
        AND status = 'accepted' ORDER BY id LIMIT 1) p ON true
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(b.payment_methods_snapshot) WHERE value->>'id' = p.method LIMIT 1) m ON true
      LEFT JOIN ethn.payment_methods pm ON pm.id = p.method
      WHERE b.id = $1 ORDER BY i.starts_at, c.name, i.ends_at`, [config.bookingId])).rows : [];
    committing = true; await client.query("COMMIT"); committing = false; transaction = false;
    const contact = `Contact ETHN Courts: ${new URL("/contact", origin).href}`;
    for (const row of claims) {
      const p = row.payload as Record<string, unknown> | null;
      const notice = Object.hasOwn(notices, row.kind) ? notices[row.kind] : undefined;
      const submission = row.kind === "booking_submission", approved = row.kind === "booking_approved", rejected = row.kind === "booking_rejected";
      const code = typeof p?.code === "string" && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(p.code) ? p.code : undefined;
      const token = typeof p?.trackingToken === "string" && /^[0-9a-f]{64}$/.test(p.trackingToken) ? p.trackingToken : undefined;
      let valid = !!notice && !!p && (p.code === undefined || !!code) && (!!code || (p.staff === true && !submission && !rejected && !token)) &&
        (!!token || (!submission && p.trackingToken === undefined)) && typeof p.total === "string" &&
        (!rejected || (typeof p.reason === "string" && p.reason.trim().length > 0 && p.reason.length <= 500));
      if (valid) { try { parsePesos(p!.total as string); } catch { valid = false; } }
      let status: "sent" | "pending" | "dead" = "dead";
      if (row.kind === "booking_owner_alert" && typeof p?.ownerId === "string" && uuid.test(p.ownerId) && (p.source === "online" || p.source === "internal")) {
        try {
          if (!config.ownerEmail) throw new Error("OWNER_LOOKUP_UNAVAILABLE");
          const enabled = (await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [p.ownerId])).rows.length > 0;
          const email = enabled ? await config.ownerEmail(p.ownerId) : null;
          if (isEthnMailAddress(email)) {
            const text = [
              p.source === "online" ? "A customer submitted a booking. Payment needs review." : "Staff added a confirmed booking.",
              ...schedule, "", `View booking: ${new URL(`/admin/bookings/${config.bookingId}`, origin).href}`,
            ].join("\n");
            await transport.sendMail({ from: config.from, to: email, subject: "New booking | ETHN Courts", text: `${text}\n`, messageId: `<${row.id}@${origin.hostname.replace(/^\[|\]$/g, "")}>` });
            status = "sent";
          }
        } catch { status = row.attempts >= 8 ? "dead" : "pending"; }
      } else if (valid && notice && p && isEthnMailAddress(p.email)) {
        try {
          const tracking = token ? `Track booking: ${new URL(`/checkout/track/${token}`, origin).href}` : code ? `Track with your code and email: ${new URL("/track", origin).href}` : null;
          const invoiceLines = approved && invoice.length ? [
            "Booking invoice", `Booking date: ${formatDisplayDate(invoice[0].booking_date)}`, "",
            ...invoice.map(item => `${item.court} · ${invoiceTimeRange(item.booking_date, item.starts_at, item.ends_at)} · ${invoiceSlotRate(item.duration_minutes, item.interval_minutes, item.hourly_rate)} · ${invoiceMoney(item.amount)}`),
            "", `Total slots: ${invoice.reduce((total, item) => total + (gridSlotCount(item.duration_minutes, item.interval_minutes) ?? 0), 0)}`,
            invoice[0].method_name ? `Payment method: ${invoice[0].method_name}` : null,
            `Total paid: ${invoiceMoney(p.total as string)}`,
          ] : [];
          const text = [
            notice.status, rejected ? `Reason: ${p.reason}` : null, "",
            code ? `Booking code: ${code}` : null,
            ...invoiceLines,
            ...(!approved && schedule.length ? ["Court schedule:", ...schedule] : []),
            !invoiceLines.length && notice.amount ? `${notice.amount}: PHP ${p.total}` : null, "",
            tracking, tracking ? "" : null, "ETHN Courts", VENUE_ADDRESS,
            approved ? `Directions: ${VENUE_MAP_LINK}` : null, contact,
          ].filter(line => line !== null).join("\n");
          await transport.sendMail({ from: config.from, to: p.email, subject: `${notice.title} | ETHN Courts`, text: `${text}\n`, ...(invoiceLines.length ? { html: `<div style="font:16px/1.5 Arial,sans-serif;color:#17252e">${text.split("\n\n").map(block => `<p>${escapeHtml(block).replaceAll("\n", "<br>")}</p>`).join("")}</div>` } : {}), messageId: `<${row.id}@${origin.hostname.replace(/^\[|\]$/g, "")}>` });
          status = "sent";
        } catch { status = row.attempts >= 8 ? "dead" : "pending"; }
      }
      await client.query("UPDATE ethn.email_outbox SET status = $3, available_at = CASE WHEN $3 = 'pending' THEN now() + ($4 * interval '1 second') ELSE available_at END WHERE id = $1 AND claim_token = $2 AND status = 'sending'", [row.id, row.token, status, Math.min(3600, 60 * 2 ** (row.attempts - 1))]);
    }
    return { claimed: claims.length };
  } catch {
    if (committing) discard = true;
    else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    throw new Error("OUTBOX_UNAVAILABLE");
  } finally { client.release(discard); }
}
