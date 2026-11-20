import { getSettings } from "@/lib/admin/ethn-settings";
import { putEthnHours } from "@/lib/admin/ethn-hours";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return adminResponse(await getSettings(staffPool, verifyStaffIdentity)); }
  catch (error) { return adminError(error); }
}
export async function PUT(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("INVALID_INPUT");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("INVALID_INPUT");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new Error("INVALID_INPUT"); } chunks.push(value); }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new Error("INVALID_INPUT"); }
    return adminResponse(await putEthnHours(staffPool, verifyStaffIdentity, body));
  } catch (error) {
    if (error instanceof Error && /^(STALE_VERSION|HOURS_CONFLICT)$/.test(error.message)) return adminResponse({ error: error.message }, 409);
    if (error instanceof Error && error.message === "INVALID_SCHEDULE") return adminResponse({ error: error.message }, 400);
    return adminError(error);
  }
}
