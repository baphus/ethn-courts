import { NextRequest } from "next/server";
import { getEthnAuditRead } from "@/lib/admin/ethn-audit-read";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { return adminResponse(await getEthnAuditRead(staffPool, verifyStaffIdentity, request.nextUrl)); }
  catch (error) { return adminError(error); }
}
