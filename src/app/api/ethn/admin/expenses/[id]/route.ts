import { changeExpense } from "@/lib/admin/ethn-finance";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

async function mutate(request: Request, context: Context, operation: "edit" | "delete") {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    const { id } = await context.params;
    return adminResponse(await changeExpense(staffPool, verifyStaffIdentity, id, operation, await readAdminJson(request, 32768)));
  } catch (error) { return adminError(error); }
}

export const PATCH = (request: Request, context: Context) => mutate(request, context, "edit");
export const DELETE = (request: Request, context: Context) => mutate(request, context, "delete");
