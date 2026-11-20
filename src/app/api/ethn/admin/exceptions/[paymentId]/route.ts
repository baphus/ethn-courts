import { exceptionDetail } from "@/lib/admin/ethn-exceptions";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  try {
    const result = await exceptionDetail(staffPool, verifyStaffIdentity, (await params).paymentId);
    return result ? adminResponse(result) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return adminError(error); }
}
