import { hasValidOrigin } from "@/lib/request-origin";
import { editOpenPlay, hideBookingOpenPlay, removeOpenPlay } from "@/lib/admin/ethn-open-plays";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { openPlayError } from "@/lib/admin/ethn-open-play-error";
import { adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { return adminResponse(await editOpenPlay(staffPool, verifyStaffIdentity, (await context.params).id, await readAdminJson(request))); }
  catch (error) { return openPlayError(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { return adminResponse(await hideBookingOpenPlay(staffPool, verifyStaffIdentity, (await context.params).id, await readAdminJson(request))); }
  catch (error) { return openPlayError(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try { await removeOpenPlay(staffPool, verifyStaffIdentity, (await context.params).id); return adminResponse({ ok: true }); }
  catch (error) { return openPlayError(error); }
}
