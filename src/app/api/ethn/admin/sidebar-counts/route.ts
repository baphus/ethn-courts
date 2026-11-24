import { getSidebarCounts } from "@/lib/admin/ethn-notifications";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return adminResponse(await getSidebarCounts(staffPool, verifyStaffIdentity));
  } catch (error) { return adminError(error); }
}
