import { expireExtension } from "@/lib/admin/ethn-extensions";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { body, expireSchema, extensionError } from "../shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return adminResponse(await expireExtension(staffPool, verifyStaffIdentity, (await body(request, expireSchema)).extensionId)); }
  catch (error) { return extensionError(error); }
}
