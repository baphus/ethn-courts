import { approveExtensionProof } from "@/lib/admin/ethn-extension-review";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { body, extensionError, approveSchema } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await approveExtensionProof(staffPool, verifyStaffIdentity, await body(request, approveSchema))); }
  catch (error) { return extensionError(error); }
}
