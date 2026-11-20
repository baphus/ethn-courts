import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { parsePesos } from "../booking/core";

type Config = { from: string; appUrl: string; bookingId: string; allowLocalHttp?: boolean };
type Transport = { sendMail(message: { from: string; to: string; subject: string; text: string; messageId: string }): Promise<unknown> };
const email = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateEthnOutboxConfig(config: Config) {
  let origin: URL;
  try {
    if (!config || !email(config.from) || typeof config.bookingId !== "string" || !uuid.test(config.bookingId)) throw new Error();
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
    committing = true; await client.query("COMMIT"); committing = false; transaction = false;
    for (const row of claims) {
      const p = row.payload as Record<string, unknown> | null;
      const submission = row.kind === "booking_submission", approved = row.kind === "booking_approved", rejected = row.kind === "booking_rejected";
      const token = !!p && typeof p.trackingToken === "string" && /^[0-9a-f]{64}$/.test(p.trackingToken);
      let valid = (submission || approved || rejected) && !!p && email(p.email) && typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 200 && !/[\r\n]/.test(p.name) && typeof p.code === "string" && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(p.code) && (token || (!submission && p.trackingToken === undefined)) && typeof p.total === "string" && (!rejected || (typeof p.reason === "string" && p.reason.trim().length > 0 && p.reason.length <= 500));
      if (valid) { try { parsePesos(p!.total as string); } catch { valid = false; } }
      let status: "sent" | "pending" | "dead" = "dead";
      if (valid && p) {
        try {
          const subject = submission ? "ETHN booking submitted" : approved ? "ETHN booking confirmed" : "ETHN booking rejected";
          const message = submission ? "Your booking was submitted and is pending review. It is not confirmed." : approved ? "Your booking is confirmed and fully paid." : `Your booking was rejected and is not booked.\nReason: ${p.reason}`;
          const tracking = token ? `Track: ${new URL(`/checkout/track/${p.trackingToken}`, origin).href}` : "Use your code and email to look up your booking on the tracking page.";
          await transport.sendMail({ from: config.from, to: p.email as string, subject, text: `Hello ${p.name},\n\n${message}\nCode: ${p.code}\nTotal: PHP ${p.total}\n${tracking}\n`, messageId: `<${row.id}@${origin.hostname.replace(/^\[|\]$/g, "")}>` });
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
