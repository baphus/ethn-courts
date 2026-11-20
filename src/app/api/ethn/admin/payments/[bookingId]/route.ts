import { paymentDetail } from "@/lib/admin/ethn-payments";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const result = await paymentDetail(staffPool, verifyStaffIdentity, (await params).bookingId);
    return result ? adminResponse(result) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return adminError(error); }
}
