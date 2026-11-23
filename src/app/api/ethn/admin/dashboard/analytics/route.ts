import { ethnDashboardAnalytics } from "@/lib/admin/ethn-analytics";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return adminResponse(await ethnDashboardAnalytics(staffPool, verifyStaffIdentity, new URL(request.url).searchParams)); }
  catch (error) { return adminError(error); }
}
