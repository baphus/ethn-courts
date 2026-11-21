import { getEthnCalendar } from "@/lib/admin/ethn-calendar";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return adminResponse(await getEthnCalendar(staffPool, verifyStaffIdentity, new URL(request.url).searchParams.get("date"))); }
  catch (error) { return adminError(error); }
}
