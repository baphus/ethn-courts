import { confirmExtension } from "@/lib/admin/ethn-extensions";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { body, confirmSchema, extensionError } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await confirmExtension(staffPool, verifyStaffIdentity, await body(request, confirmSchema))); }
  catch (error) { return extensionError(error); }
}
