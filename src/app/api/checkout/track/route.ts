import { readAdminJson as readJson } from "@/lib/admin/ethn-json";
import { after } from "next/server";
import { sendEthnMailBestEffort } from "@/lib/mail/ethn-hook-server";
import { hasValidOrigin } from "@/lib/request-origin";
import { getCheckoutPool } from "@/db/checkout-client";
import { openPlayUpdate, trackBooking, trackingInput } from "@/lib/booking/ethn-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request): Promise<Response> { return handle(request, false); }
export async function PUT(request: Request): Promise<Response> { return handle(request, true); }

async function handle(request: Request, update: boolean): Promise<Response> {
  if (!hasValidOrigin(request)) return fail("INVALID_ORIGIN", 403);
  try {
    const input = await readJson(request, 32768).catch(() => null);
    const parsed = (update ? openPlayUpdate : trackingInput).safeParse(input);
    if (!parsed.success) return fail("INVALID_INPUT", 400);
    const result = await trackBooking(getCheckoutPool(), parsed.data, update, bookingId => {
      try { after(() => sendEthnMailBestEffort(bookingId)); } catch { /* Listing already committed. */ }
    });
    return result ? Response.json(result, { headers }) : fail("NOT_FOUND", 404);
  } catch (error) {
    if (error instanceof Error && error.message === "OPEN_PLAY_NOT_EDITABLE") return fail("OPEN_PLAY_NOT_EDITABLE", 409);
    if (error instanceof Error && error.message === "NOT_CONFIGURED") return fail("NOT_CONFIGURED", 503);
    return fail("INTERNAL", 500);
  }
}
