import { markInboxRead } from "@/lib/admin/ethn-notifications";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "INVALID_ORIGIN" }, 403);
  try {
    const result = await markInboxRead(staffPool, verifyStaffIdentity, (await params).id);
    return result ? adminResponse(result) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return adminError(error); }
}
