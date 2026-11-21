import { createCourt, listCourts } from "@/lib/admin/ethn-venue";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return adminResponse(await listCourts(staffPool, verifyStaffIdentity)); }
  catch (error) { return adminError(error); }
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { return adminResponse(await createCourt(staffPool, verifyStaffIdentity, await readAdminJson(request)), 201); }
  catch (error) {
    if (error instanceof Error && /^(NAME_COLLISION|IDEMPOTENCY_MISMATCH)$/.test(error.message)) return adminResponse({ error: error.message }, 409);
    return adminError(error);
  }
}
