import { hasValidOrigin } from "@/lib/request-origin";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { createSale, listSales } from "@/lib/admin/ethn-sales";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) if (!["from", "to", "page", "limit", "method", "category", "q"].includes(key) || params.getAll(key).length !== 1) throw new Error("INVALID_INPUT");
    const integer = (key: string, fallback: number) => {
      const value = params.get(key);
      return value === null ? fallback : /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
    };
    return adminResponse(await listSales(staffPool, verifyStaffIdentity, params.get("from"), params.get("to"), {
      page: integer("page", 1), limit: integer("limit", 20), method: params.get("method") ?? "", category: params.get("category") ?? "", q: params.get("q") ?? "",
    }));
  } catch (error) { return adminError(error); }
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { return adminResponse(await createSale(staffPool, verifyStaffIdentity, await readAdminJson(request)), 201); }
  catch (error) { return adminError(error); }
}
