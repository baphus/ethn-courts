import { hasValidOrigin } from "@/lib/request-origin";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { createSale, listSales } from "@/lib/admin/ethn-sales";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (new URL(request.url).search) throw new Error("INVALID_INPUT");
    return adminResponse(await listSales(staffPool, verifyStaffIdentity));
  } catch (error) { return adminError(error); }
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { return adminResponse(await createSale(staffPool, verifyStaffIdentity, await readAdminJson(request)), 201); }
  catch (error) { return adminError(error); }
}
