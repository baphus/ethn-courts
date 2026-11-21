import { submitExtensionProof } from "@/lib/admin/ethn-extension-review";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { proofStorage } from "@/lib/booking/proof-storage";
import { body, extensionError, submitSchema } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await submitExtensionProof(staffPool, verifyStaffIdentity, await body(request, submitSchema), proofStorage)); }
  catch (error) { return extensionError(error); }
}
