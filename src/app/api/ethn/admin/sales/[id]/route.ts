import { changeSale } from "@/lib/admin/ethn-sales";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

async function mutate(request: Request, context: Context, method: "PATCH" | "DELETE") {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    const { id } = await context.params;
    return adminResponse(await changeSale(staffPool, verifyStaffIdentity, id, method, await readAdminJson(request)));
  } catch (error) {
    if (error instanceof Error && error.message === "SALE_NOT_FOUND") return adminResponse({ error: error.message }, 404);
    if (error instanceof Error && error.message === "SALE_STALE") return adminResponse({ error: error.message }, 409);
    return adminError(error);
  }
}

export const PATCH = (request: Request, context: Context) => mutate(request, context, "PATCH");
export const DELETE = (request: Request, context: Context) => mutate(request, context, "DELETE");
