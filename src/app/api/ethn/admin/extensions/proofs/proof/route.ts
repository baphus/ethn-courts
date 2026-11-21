import { readExtensionProof } from "@/lib/admin/ethn-extension-proof-read";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { extensionError } from "../shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const result = await readExtensionProof(staffPool, verifyStaffIdentity, new URL(request.url).searchParams.get("extensionId") || "");
    return result ? adminResponse(result) : adminResponse({ error: "NOT_FOUND" }, 404);
  } catch (error) { return extensionError(error); }
}
