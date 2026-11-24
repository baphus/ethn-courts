import { getApprovalFinance, getFinance } from "@/lib/admin/ethn-finance";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) if (!["from", "to", "basis"].includes(key) || params.getAll(key).length !== 1) throw new Error("INVALID_INPUT");
    const basis = params.get("basis");
    if (basis !== null && basis !== "approval") throw new Error("INVALID_INPUT");
    const report = basis === "approval" ? getApprovalFinance : getFinance;
    return adminResponse(await report(staffPool, verifyStaffIdentity, params.get("from"), params.get("to")));
  }
  catch(error){return adminError(error)}
}
