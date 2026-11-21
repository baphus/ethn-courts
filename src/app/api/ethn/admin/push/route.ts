import { addPushSubscription, pushConfig, pushSettings, removePushSubscription, validSubscription } from "@/lib/admin/ethn-push";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { hasValidOrigin } from "@/lib/request-origin";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (error: unknown) => error instanceof Error && error.message === "SUBSCRIPTION_IN_USE"
  ? adminResponse({ error: "SUBSCRIPTION_IN_USE" }, 409) : adminError(error);


export async function GET() {
  try { return adminResponse(await pushSettings(staffPool, verifyStaffIdentity)); }
  catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    if (!pushConfig()) return adminResponse({ error: "NOT_CONFIGURED" }, 503);
    const data = await readAdminJson(request, 4096);
    if (!validSubscription(data)) throw new Error("INVALID_INPUT");
    return adminResponse(await addPushSubscription(staffPool, verifyStaffIdentity, data), 201);
  } catch (error) { return fail(error); }
}
export async function DELETE(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    const data = await readAdminJson(request, 256);
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).join() !== "subscriptionId" || typeof (data as { subscriptionId?: unknown }).subscriptionId !== "string") throw new Error("INVALID_INPUT");
    await removePushSubscription(staffPool, verifyStaffIdentity, (data as { subscriptionId: string }).subscriptionId);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
