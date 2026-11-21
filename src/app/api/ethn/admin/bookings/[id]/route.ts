import { ethnBookingDetail } from "@/lib/admin/ethn-booking-read";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const detail = await ethnBookingDetail(staffPool, verifyStaffIdentity, (await context.params).id);
    return detail ? adminResponse(detail) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return adminError(error); }
}
