import { getCheckoutPool } from "@/db/checkout-client";
import { getAvailability } from "@/lib/booking/ethn-availability";
import { manilaDateStr, manilaWallClock } from "@/lib/booking/slots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  if (params.getAll("date").length > 1 || (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(manilaWallClock(date).getTime()) || manilaDateStr(manilaWallClock(date)) !== date))) return Response.json({ error: "INVALID_INPUT" }, { status: 400, headers });
  try {
    return Response.json(await getAvailability(getCheckoutPool(), params.get("date")), { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "INVALID_INPUT" ? 400 : ["INVALID_SCHEDULE", "NOT_CONFIGURED"].includes(message) ? 503 : 500;
    return Response.json({ error: status === 400 ? "INVALID_INPUT" : status === 503 ? "NOT_CONFIGURED" : "INTERNAL" }, { status, headers });
  }
}
