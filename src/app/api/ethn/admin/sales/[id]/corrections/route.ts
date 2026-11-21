import { hasValidOrigin } from "@/lib/request-origin";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { correctSale } from "@/lib/admin/ethn-sales";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { return adminResponse(await correctSale(staffPool, verifyStaffIdentity, (await context.params).id, await readAdminJson(request)), 201); }
  catch (error) {
    if (error instanceof Error && error.message === "CORRECTION_CONFLICT") return adminResponse({ error: error.message }, 409);
    return adminError(error);
  }
}
