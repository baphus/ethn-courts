import { getFinance } from "@/lib/admin/ethn-finance";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  try { const u=new URL(request.url); for(const k of u.searchParams.keys()) if(!["from","to"].includes(k)||u.searchParams.getAll(k).length!==1) throw new Error("INVALID_INPUT"); return adminResponse(await getFinance(staffPool,verifyStaffIdentity,u.searchParams.get("from"),u.searchParams.get("to"))); }
  catch(error){return adminError(error)}
}
