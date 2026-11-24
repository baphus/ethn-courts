import { getSidebarCounts } from "@/lib/admin/ethn-notifications";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return adminResponse(await getSidebarCounts(staffPool, verifyStaffIdentity));
  } catch (error) {
    const response = adminError(error);
    if (response.status === 503) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      const reason = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code
        : error instanceof Error && error.message === "NOT_CONFIGURED" ? "NOT_CONFIGURED"
        : typeof getSidebarCounts !== "function" ? "HANDLER_UNAVAILABLE" : "UNKNOWN";
      console.error(`Sidebar counts unavailable (${reason}).`);
    }
    return response;
  }
}
