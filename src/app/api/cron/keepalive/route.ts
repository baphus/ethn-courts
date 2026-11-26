import { getCheckoutPool } from "@/db/checkout-client";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || !isCronAuthorized(req)) return Response.json({ ok: false }, { status: 401 });
  try {
    await getCheckoutPool().query("SELECT 1 FROM ethn.settings WHERE singleton");
    return Response.json({ ok: true });
  } catch {
    console.error("ETHN database keepalive failed");
    return Response.json({ ok: false }, { status: 503 });
  }
}
