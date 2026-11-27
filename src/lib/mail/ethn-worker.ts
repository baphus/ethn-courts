import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import QRCode from "qrcode";
import { formatScheduleRange } from "../booking/schedule-label";
import { formatDisplayDate } from "../display-date";
import { gridSlotCount, invoiceMoney, invoiceSlotRate, invoiceTimeRange } from "../booking/invoice-format";
import { parsePesos } from "../booking/core";
import { VENUE_ADDRESS, VENUE_MAP_LINK } from "../venue";
import { isEthnMailAddress } from "./ethn-address";
import { renderEthnEmailHtml } from "./ethn-email-layout";

type Config = { from: string; appUrl: string; bookingId: string; allowLocalHttp?: boolean; ownerEmail?: (id: string) => Promise<string | null> };
type InlineImage = { filename: string; cid: string; content: Buffer; contentType: "image/png" };
type Transport = { sendMail(message: { from: string; to: string; subject: string; text: string; html: string; messageId: string; attachments: InlineImage[] }): Promise<unknown> };
const notices: Record<string, { title: string; preheader: string; status: string; amount?: string }> = {
  booking_submission: { title: "Booking submitted!", preheader: "Your booking isn’t confirmed yet.", status: "We’ll review your payment before confirming your booking.", amount: "Booking total" },
  open_play_submitted: { title: "Booking submitted!", preheader: "Your booking isn’t confirmed yet.", status: "We’ll review your payment before confirming your booking. Your Open Play listing stays private until your booking is confirmed.", amount: "Booking total" },
  open_play_added: { title: "Open Play added to your booking", preheader: "Your Open Play details are saved.", status: "Your Open Play details are saved. An eligible listing appears on the site once your booking is confirmed." },
  booking_approved: { title: "You’re booked at ETHN Courts", preheader: "Your court time is confirmed and paid in full.", status: "Your payment has been verified and your court time is confirmed.", amount: "Total paid" },
  booking_rejected: { title: "Your booking wasn’t confirmed", preheader: "We couldn’t verify your payment proof.", status: "We couldn’t verify your payment proof, so your court time isn’t booked. See the reason below. If you believe you already paid, contact us before paying again." },
  booking_cancelled: { title: "Booking cancelled", preheader: "Your court time has been released.", status: "Your booking was cancelled and your court time was released. No refund has been recorded for this booking." },
  booking_refunded: { title: "Refund recorded", preheader: "Your booking is no longer active.", status: "Your booking is no longer active. Our team recorded a refund made outside the booking site. The recorded amount is below.", amount: "Refund recorded" },
};

type ScheduleItem = { court: string; starts_at: Date; ends_at: Date };

function scheduleLine({ court, starts_at: start, ends_at: end }: ScheduleItem) {
  return `${court}: ${formatScheduleRange(start, end)}`;
}
function googleCalendarLink(items: ScheduleItem[]) {
  if (!items.length) return null;
  const start = new Date(Math.min(...items.map(item => item.starts_at.getTime())));
  const end = new Date(Math.max(...items.map(item => item.ends_at.getTime())));
  const stamp = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({
    action: "TEMPLATE", text: "ETHN Courts booking", dates: `${stamp(start)}/${stamp(end)}`, location: VENUE_ADDRESS,
    details: ["This event spans the booking window. Actual court times:", ...items.map(scheduleLine)].join("\n"),
  }).toString();
  return { label: "Add to Google Calendar", href: url.href };
}

function slotPrice(item: { interval_minutes: number; hourly_rate: string; amount: string }, count?: number) {
  if (!count) return "";
  const raw = parsePesos(item.hourly_rate) * BigInt(item.interval_minutes);
  const rounded = (raw + BigInt(30)) / BigInt(60);
  const approximate = raw % BigInt(60) !== BigInt(0) || rounded * BigInt(count) !== parsePesos(item.amount);
  return ` · ${approximate ? "approx. " : ""}${invoiceMoney((Number(rounded) / 100).toFixed(2))}/slot`;
}

type EmailContent = Parameters<typeof renderEthnEmailHtml>[0];

let logoImage: Promise<Buffer | null> | undefined;

async function renderEmail(email: EmailContent, subject = `${email.title} — ETHN Courts`, privateTrackingUrl?: string) {
  const { status, sections, action, links, footer } = email;
  const attachments: InlineImage[] = [];
  const logo = await (logoImage ??= readFile(join(process.cwd(), "public", "ethn-courts-email-mark.png")).catch(() => null));
  if (logo) {
    email.logoCid = "ethn-logo@ethn-courts";
    attachments.push({ filename: "ethn-courts.png", cid: email.logoCid, content: logo, contentType: "image/png" });
  }
  if (privateTrackingUrl) {
    const qr = await QRCode.toBuffer(privateTrackingUrl, { width: 320, margin: 4, errorCorrectionLevel: "M" }).catch(() => null);
    if (qr) {
      email.trackingQrCid = "booking-tracking@ethn-courts";
      attachments.push({ filename: "ethn-private-tracking.png", cid: email.trackingQrCid, content: qr, contentType: "image/png" });
    }
  }
  const text = [status, ...sections.map(({ title, lines }) => [title, ...lines].join("\n")),
    `${action.label}: ${action.href}`, [...footer, ...links.map(link => `${link.label}: ${link.href}`)].join("\n")]
    .filter(Boolean).join("\n\n");
  return { subject, text: `${text}\n`, html: renderEthnEmailHtml(email), attachments };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const smtpCodes = new Set(["EAUTH", "ECONNECTION", "ECONNREFUSED", "ECONNRESET", "EDNS", "EENVELOPE", "EMESSAGE", "ESOCKET", "ETIMEDOUT", "ETLS"]);

function logDeliveryFailure(kind: string, stage: string, error: unknown) {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  if (stage === "SMTP") {
    console.error("ETHN mail send failed", kind, typeof code === "string" && smtpCodes.has(code) ? code : "unknown", typeof responseCode === "number" && Number.isInteger(responseCode) && responseCode >= 400 && responseCode <= 599 ? responseCode : null);
  } else {
    console.error("ETHN mail preparation failed", kind, stage);
  }
}

export function validateEthnOutboxConfig(config: Config) {
  let origin: URL;
  try {
    if (!config || !isEthnMailAddress(config.from) || typeof config.bookingId !== "string" || !uuid.test(config.bookingId)) throw new Error();
    origin = new URL(config.appUrl);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || (origin.protocol !== "https:" && !(config.allowLocalHttp === true && origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) throw new Error();
  } catch { throw new Error("INVALID_OUTBOX_CONFIG"); }
  return origin;
}

export class EthnOutboxError extends Error {
  constructor(stage: string) { super(`OUTBOX_UNAVAILABLE: ${stage}`); }
}

export async function drainEthnOutbox(pool: Pick<Pool, "connect" | "query">, transport: Transport, config: Config) {
  const origin = validateEthnOutboxConfig(config);
  const client = await pool.connect().catch(() => { throw new EthnOutboxError("database connection"); });
  let stage = "outbox claim";
  let transaction = false, committing = false, discard = false, released = false;
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
    const schedule = claims.length ? (await client.query<ScheduleItem>(`SELECT c.name AS court, i.starts_at, i.ends_at
      FROM ethn.booking_items i JOIN ethn.courts c ON c.id = i.court_id
      WHERE i.booking_id = $1 ORDER BY i.starts_at, c.name, i.ends_at`, [config.bookingId])).rows : [];
    stage = "invoice lookup";
    const invoice = claims.some(row => row.kind === "booking_approved" || row.kind === "booking_submission" || row.kind === "open_play_submitted") ? (await client.query<{
      court: string; starts_at: Date; ends_at: Date; duration_minutes: number; interval_minutes: number;
      hourly_rate: string; amount: string; booking_date: string; method_name: string | null;
    }>(`SELECT c.name AS court, i.starts_at, i.ends_at, i.duration_minutes, i.interval_minutes,
        i.hourly_rate::text, i.amount::text, b.operating_date::text AS booking_date,
        COALESCE(m.value->>'name', pm.name, CASE p.method WHEN 'cash' THEN 'Cash' WHEN 'gcash' THEN 'GCash' ELSE p.method END) AS method_name
      FROM ethn.booking_items i JOIN ethn.bookings b ON b.id = i.booking_id JOIN ethn.courts c ON c.id = i.court_id
      LEFT JOIN LATERAL (SELECT method FROM ethn.payments WHERE booking_id = b.id AND extension_id IS NULL
        ORDER BY (status = 'accepted') DESC, id LIMIT 1) p ON true
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(b.payment_methods_snapshot) WHERE value->>'id' = p.method LIMIT 1) m ON true
      LEFT JOIN ethn.payment_methods pm ON pm.id = p.method
      WHERE b.id = $1 ORDER BY i.starts_at, c.name, i.ends_at`, [config.bookingId])).rows : [];
    stage = "outbox commit";
    committing = true; await client.query("COMMIT"); committing = false; transaction = false;
    client.release(); released = true;
    stage = "delivery processing";
    const contact = { label: "Contact ETHN Courts", href: new URL("/contact", origin).href };
    const directions = { label: "Get directions", href: VENUE_MAP_LINK };
    const scheduleSections = schedule.length ? [{ title: "Court schedule", lines: schedule.map(scheduleLine) }] : [];
    const calendar = claims.some(row => row.kind === "booking_approved") ? googleCalendarLink(schedule) : null;
    const footer = ["ETHN Courts", VENUE_ADDRESS];
    for (const row of claims) {
      const p = row.payload as Record<string, unknown> | null;
      const notice = Object.hasOwn(notices, row.kind) ? notices[row.kind] : undefined;
      const submission = row.kind === "booking_submission" || row.kind === "open_play_submitted", approved = row.kind === "booking_approved", rejected = row.kind === "booking_rejected";
      const code = typeof p?.code === "string" && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(p.code) ? p.code : undefined;
      const token = typeof p?.trackingToken === "string" && /^[0-9a-f]{64}$/.test(p.trackingToken) ? p.trackingToken : undefined;
      let valid = !!notice && !!p && (p.code === undefined || !!code) && (!!code || (p.staff === true && !submission && !rejected && !token)) &&
        (!!token || (!submission && p.trackingToken === undefined)) && typeof p.total === "string" &&
        (!rejected || (typeof p.reason === "string" && p.reason.trim().length > 0 && p.reason.length <= 500));
      if (valid) { try { parsePesos(p!.total as string); } catch { valid = false; } }
      let status: "sent" | "pending" | "dead" = "dead";
      let deliveryStage = "owner lookup";
      if (row.kind === "booking_owner_alert" && typeof p?.ownerId === "string" && uuid.test(p.ownerId) && (p.source === "online" || p.source === "internal")) {
        try {
          if (!config.ownerEmail) throw new Error("OWNER_LOOKUP_UNAVAILABLE");
          const enabled = (await pool.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [p.ownerId])).rows.length > 0;
          const email = enabled ? await config.ownerEmail(p.ownerId) : null;
          if (isEthnMailAddress(email)) {
            deliveryStage = "message rendering";
            const online = p.source === "online";
            const message = await renderEmail({
              title: p.event === "open_play_submitted" ? "New booking with Open Play" : p.event === "open_play_added" ? "Open Play added to booking" : online ? "Payment review needed" : "Staff booking confirmed",
              preheader: p.event === "open_play_added" ? "A customer updated their booking listing." : online ? "An online booking is waiting for payment review." : "No payment review is needed.",
              status: p.event === "open_play_submitted" ? "Review payment proof. Booking approval publishes the Open Play." : p.event === "open_play_added" ? "A customer added an Open Play through booking tracking." : online ? "A customer submitted payment proof. Open the booking to review it." : "Your team added a confirmed booking. No payment review is needed.",
              audience: "Owner notification",
              sections: scheduleSections,
              action: { label: online && p.event !== "open_play_added" ? "Review payment" : "View booking", href: new URL(`/admin/bookings/${config.bookingId}`, origin).href },
              links: [], footer: ["ETHN Courts"],
            });
            deliveryStage = "SMTP";
            await transport.sendMail({ from: config.from, to: email, ...message, messageId: `<${row.id}@${origin.hostname.replace(/^\[|\]$/g, "")}>` });
            status = "sent";
          }
        } catch (error) {
          logDeliveryFailure(row.kind, deliveryStage, error);
          status = row.attempts >= 8 ? "dead" : "pending";
        }
      } else if (valid && notice && p && isEthnMailAddress(p.email)) {
        deliveryStage = "message rendering";
        try {
          const tracking = token
            ? { label: submission ? "Track booking" : "View booking", href: new URL(`/checkout/track/${token}`, origin).href }
            : code ? { label: "Track with your code and email", href: new URL("/track", origin).href } : null;
          const hasInvoice = (approved || submission) && invoice.length > 0;
          const sections: EmailContent["sections"] = [];
          if (rejected) sections.push({ title: "Reason", lines: [p.reason as string] });
          if (code) sections.push({ title: "Booking code", lines: [code] });
          if (hasInvoice) {
            const slots = invoice.map(item => gridSlotCount(item.duration_minutes, item.interval_minutes));
            sections.push({ title: approved ? "Booking invoice" : "Booking breakdown", lines: [
              `Booking date: ${formatDisplayDate(invoice[0].booking_date)}`,
              ...invoice.map((item, index) => `${item.court} · ${invoiceTimeRange(item.booking_date, item.starts_at, item.ends_at)}\n${invoiceSlotRate(item.duration_minutes, item.interval_minutes)}${slotPrice(item, slots[index])} · Subtotal: ${invoiceMoney(item.amount)}`),
              `Total slots: ${slots.every(count => count !== undefined) ? slots.reduce((total, count) => total + count, 0) : "Unavailable"}`,
            ] });
            sections.push({ title: "Payment", lines: [
              ...(invoice[0].method_name ? [`Payment method: ${invoice[0].method_name}`] : []),
              `${approved ? "Total paid" : "Booking total"}: ${invoiceMoney(p.total as string)}`,
            ] });
          } else {
            sections.push(...scheduleSections);
            if (notice.amount) sections.push({ title: notice.amount, lines: [invoiceMoney(p.total as string)] });
          }
          const action = rejected ? contact : tracking ?? (approved ? directions : contact);
          const links = [contact];
          if (tracking) links.unshift(tracking);
          if (approved) {
            links.push(directions);
            if (calendar) links.push(calendar);
             if (p.openPlayPublished === true) links.push({ label: "View public Open Plays", href: new URL("/open-plays", origin).href });
          }
          const message = await renderEmail({
            ...notice,
            status: approved && p.staff === true ? "Our team booked your court time and recorded your payment in full." : approved && p.openPlayPublished === true ? `${notice.status} Your Open Play is now listed on our site.` : notice.status,
            audience: "Booking update", sections, action, links: links.filter(link => link !== action), footer,
          }, approved || submission ? notice.title : undefined, token && p.staff !== true && (submission || approved) ? tracking?.href : undefined);
          deliveryStage = "SMTP";
          await transport.sendMail({ from: config.from, to: p.email, ...message, messageId: `<${row.id}@${origin.hostname.replace(/^\[|\]$/g, "")}>` });
          status = "sent";
        } catch (error) {
          logDeliveryFailure(row.kind, deliveryStage, error);
          status = row.attempts >= 8 ? "dead" : "pending";
        }
      }
      await pool.query("UPDATE ethn.email_outbox SET status = $3, available_at = CASE WHEN $3 = 'pending' THEN now() + ($4 * interval '1 second') ELSE available_at END WHERE id = $1 AND claim_token = $2 AND status = 'sending'", [row.id, row.token, status, Math.min(3600, 60 * 2 ** (row.attempts - 1))]);
    }
    return { claimed: claims.length };
  } catch {
    if (committing) discard = true;
    else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    throw new EthnOutboxError(stage);
  } finally { if (!released) client.release(discard); }
}
