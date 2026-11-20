import { exceptionQueue } from "@/lib/admin/ethn-exceptions";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return adminResponse(await exceptionQueue(staffPool, verifyStaffIdentity)); }
  catch (error) { return adminError(error); }
}
