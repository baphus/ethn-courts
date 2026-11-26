import { getCheckoutPool } from "@/db/checkout-client";
import { isCronAuthorized } from "@/lib/cron/auth";
import { drainPush, pushConfig } from "@/lib/admin/ethn-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isCronAuthorized(request)) return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let config;
  try { config = pushConfig(); } catch { return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!config) return Response.json({ ok: true, skipped: "disabled" }, { headers: { "Cache-Control": "no-store" } });
  try { return Response.json({ ok: true, ...await drainPush(getCheckoutPool(), config) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { console.error("ETHN push backstop unavailable"); return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
