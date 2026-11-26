import { paymentProof } from "@/lib/admin/ethn-payments";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { proofStorage } from "@/lib/booking/proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const result = await paymentProof(staffPool, verifyStaffIdentity, (await params).bookingId, proofStorage.signRead, new URL(request.url).searchParams.get("paymentId") ?? undefined);
    return result ? adminResponse(result) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return adminError(error); }
}
