import { readAdminJson } from "@/lib/admin/ethn-json";
import { reconcileInbox } from "@/lib/admin/ethn-notifications";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "INVALID_ORIGIN" }, 403);
  try {
    if (request.body) {
      const body = await readAdminJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new Error("INVALID_INPUT");
    }
    return adminResponse(await reconcileInbox(staffPool, verifyStaffIdentity));
  } catch (error) { return adminError(error); }
}
