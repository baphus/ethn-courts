import { rejectExtensionProof } from "@/lib/admin/ethn-extension-review";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { body, extensionError, rejectSchema } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await rejectExtensionProof(staffPool, verifyStaffIdentity, await body(request, rejectSchema))); }
  catch (error) { return extensionError(error); }
}
