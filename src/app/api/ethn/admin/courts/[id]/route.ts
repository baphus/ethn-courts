import { updateCourtDetails } from "@/lib/admin/ethn-court-details";
import { MAX_COURT_PHOTO_BYTES, normalizeCourtPhoto } from "@/lib/admin/ethn-court-photo";
import { adminError, adminResponse, getCurrentStaff, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "FORBIDDEN" }, 403);
  try {
    const staff = await getCurrentStaff();
    if (staff.role !== "owner") return adminResponse({ error: "FORBIDDEN" }, 403);
    // Bound the actual stream, not an untrusted Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("INVALID_INPUT");
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_COURT_PHOTO_BYTES + 16384) { await reader.cancel(); throw new Error("INVALID_INPUT"); }
      chunks.push(value);
    }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("Content-Type") ?? "" } }).formData(); }
    catch { throw new Error("INVALID_INPUT"); }
    const allowed = ["name", "description", "version", "photo"];
    if ([...form.keys()].some(key => !allowed.includes(key) || form.getAll(key).length !== 1)) throw new Error("INVALID_INPUT");
    const file = form.get("photo");
    if (file !== null && !(file instanceof File)) throw new Error("INVALID_INPUT");
    const photo = file instanceof File ? await normalizeCourtPhoto(Buffer.from(await file.arrayBuffer()), file.type) : undefined;
    return adminResponse(await updateCourtDetails(staffPool, verifyStaffIdentity, (await context.params).id, { name: form.get("name"), description: form.get("description"), version: form.get("version") }, photo));
  } catch (error) {
    if (error instanceof Error && /^(STALE_VERSION|NAME_COLLISION)$/.test(error.message)) return adminResponse({ error: error.message }, 409);
    return adminError(error);
  }
}
