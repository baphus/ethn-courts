import { readExtension } from "@/lib/admin/ethn-extension-read";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(k => k !== "bookingId") || params.getAll("bookingId").length !== 1) return adminResponse({ error: "INVALID_INPUT" }, 400);
    const result = await readExtension(staffPool, verifyStaffIdentity, params.get("bookingId")!);
    return result ? adminResponse(result) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return adminError(error); }
}
