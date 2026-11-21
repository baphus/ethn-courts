import { listInbox } from "@/lib/admin/ethn-notifications";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const values = params.getAll("unreadOnly");
  if ([...params.keys()].some(key => key !== "unreadOnly") || values.length > 1 || (values.length && values[0] !== "true" && values[0] !== "false")) return adminResponse({ error: "INVALID_INPUT" }, 400);
  try { return adminResponse(await listInbox(staffPool, verifyStaffIdentity, values[0] === "true")); }
  catch (error) { return adminError(error); }
}
