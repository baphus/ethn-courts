import { getCheckoutPool } from "@/db/checkout-client";
import { listPublicOpenPlays } from "@/lib/admin/ethn-open-plays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await listPublicOpenPlays({ connect: () => getCheckoutPool().connect() }), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Service unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
