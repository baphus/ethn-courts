import { getCheckoutPool } from "@/db/checkout-client";
import { cleanDeletedBookingProofs } from "@/lib/booking/deleted-proof-cleanup";
import { proofStorage } from "@/lib/booking/proof-storage";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isCronAuthorized(request)) return Response.json({ ok: false }, { status: 401 });
  try {
    const result = await cleanDeletedBookingProofs(getCheckoutPool(), proofStorage.remove);
    return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 503 : 200 });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
