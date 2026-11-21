import { ethnDashboard } from "@/lib/admin/ethn-booking-read";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return adminResponse(await ethnDashboard(staffPool, verifyStaffIdentity)); }
  catch (error) { return adminError(error); }
}
