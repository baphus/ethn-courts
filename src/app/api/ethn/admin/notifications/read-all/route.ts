import { markAllInboxRead } from "@/lib/admin/ethn-notifications";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "INVALID_ORIGIN" }, 403);
  try {
    if (await request.text()) return adminResponse({ error: "INVALID_INPUT" }, 400);
    return adminResponse(await markAllInboxRead(staffPool, verifyStaffIdentity));
  } catch (error) { return adminError(error); }
}
