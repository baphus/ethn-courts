import { createExtensionHold } from "@/lib/admin/ethn-extensions";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { body, extensionError, holdSchema } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await createExtensionHold(staffPool, verifyStaffIdentity, await body(request, holdSchema))); }
  catch (error) { return extensionError(error); }
}
