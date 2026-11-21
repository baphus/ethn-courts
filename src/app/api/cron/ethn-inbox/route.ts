import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { reconcileInboxBackstop } from "@/lib/admin/ethn-inbox-backstop";
import { staffPool } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isCronAuthorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json(await reconcileInboxBackstop(staffPool), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
