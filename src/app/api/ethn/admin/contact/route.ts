import { getContact, putContact } from "@/lib/admin/ethn-contact";
import { adminError, adminResponse, getCurrentStaff, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { getCheckoutPool } from "@/db/checkout-client";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { if ((await getCurrentStaff()).role !== "owner") throw new Error("FORBIDDEN"); return adminResponse(await getContact(getCheckoutPool())); }
  catch (error) { return adminError(error); }
}
export async function PUT(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("INVALID_INPUT");
    const reader = request.body?.getReader(); if (!reader) throw new Error("INVALID_INPUT");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); throw new Error("INVALID_INPUT"); } chunks.push(value); }
    let body: unknown; try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new Error("INVALID_INPUT"); }
    return adminResponse(await putContact(staffPool, verifyStaffIdentity, body));
  } catch (error) { if (error instanceof Error && error.message === "STALE_VERSION") return adminResponse({ error: error.message }, 409); return adminError(error); }
}
