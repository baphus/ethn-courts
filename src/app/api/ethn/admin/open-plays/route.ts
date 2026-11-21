import { hasValidOrigin } from "@/lib/request-origin";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { createOpenPlay, listPublicOpenPlays } from "@/lib/admin/ethn-open-plays";
import { adminResponse, getCurrentStaff, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { openPlayError } from "@/lib/admin/ethn-open-play-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await getCurrentStaff(); return adminResponse(await listPublicOpenPlays(staffPool)); }
  catch (error) { return openPlayError(error); }
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { return adminResponse(await createOpenPlay(staffPool, verifyStaffIdentity, await readAdminJson(request)), 201); }
  catch (error) { return openPlayError(error); }
}
