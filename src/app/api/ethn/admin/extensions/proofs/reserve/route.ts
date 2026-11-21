import { reserveExtensionProof } from "@/lib/admin/ethn-extension-review";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { body, extensionError, reserveSchema } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await reserveExtensionProof(staffPool, verifyStaffIdentity, await body(request, reserveSchema))); }
  catch (error) { return extensionError(error); }
}
