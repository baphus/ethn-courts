import { signExtensionProof } from "@/lib/admin/ethn-extension-review";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { proofStorage } from "@/lib/booking/proof-storage";
import { body, extensionError, signSchema } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await signExtensionProof(staffPool, verifyStaffIdentity, await body(request, signSchema), proofStorage)); }
  catch (error) { return extensionError(error); }
}
