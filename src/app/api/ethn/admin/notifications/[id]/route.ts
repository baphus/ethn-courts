import { dismissInboxNotification } from "@/lib/admin/ethn-notifications";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "INVALID_ORIGIN" }, 403);
  try {
    const deleted = await dismissInboxNotification(staffPool, verifyStaffIdentity, (await params).id);
    return deleted ? adminResponse({ deleted: true }) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return adminError(error); }
}
