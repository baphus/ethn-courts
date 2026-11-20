import { isCronAuthorized } from "@/lib/cron/auth";
import { getCheckoutPool } from "@/db/checkout-client";
import { getSharedTransport } from "@/lib/mail/transport";
import { drainEthnBackstop, ethnBackstopConfig } from "@/lib/mail/ethn-backstop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !isCronAuthorized(req)) return Response.json({ ok: false }, { status: 401 });
  const config = ethnBackstopConfig(process.env);
  if (!config || (!process.env.SMTP_HOST && !(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD))) return Response.json({ ok: false }, { status: 503 });
  try {
    const result = await drainEthnBackstop(getCheckoutPool(), getSharedTransport(), config);
    return Response.json({ ok: true, ...result });
  } catch {
    console.error("ETHN outbox backstop unavailable");
    return Response.json({ ok: false }, { status: 500 });
  }
}
