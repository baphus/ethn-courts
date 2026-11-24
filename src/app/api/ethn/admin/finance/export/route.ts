import { getFinanceExport } from "@/lib/admin/ethn-finance";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) if (!["from", "to", "category", "q"].includes(key) || params.getAll(key).length !== 1) throw new Error("INVALID_INPUT");
    return adminResponse(await getFinanceExport(staffPool, verifyStaffIdentity, params.get("from"), params.get("to"), params.get("category") ?? "", params.get("q") ?? ""));
  } catch (error) { return adminError(error); }
}
