import { z } from "zod";
import { hasValidOrigin } from "@/lib/request-origin";
import { createWalkIn } from "@/lib/admin/ethn-walk-ins";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.object({
  courtId: z.string(), date: z.string(), start: z.string(), end: z.string(),
  guestName: z.string(), guestPhone: z.string().nullable().optional(),
  method: z.enum(["cash", "gcash"]), reference: z.string().nullable().optional(),
}).strict();

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return adminResponse({ error: "INVALID_ORIGIN" }, 403);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) return adminResponse({ error: "INVALID_INPUT" }, 400);
  try {
    const reader = request.body?.getReader();
    if (!reader) return adminResponse({ error: "INVALID_INPUT" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); return adminResponse({ error: "INVALID_INPUT" }, 400); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return adminResponse({ error: "INVALID_INPUT" }, 400); }
    const parsed = input.safeParse(body);
    if (!parsed.success) return adminResponse({ error: "INVALID_INPUT" }, 400);
    return adminResponse(await createWalkIn(staffPool, verifyStaffIdentity, parsed.data));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SLOT_TAKEN" || code === "REFERENCE_TAKEN") return adminResponse({ error: code }, 409);
    if (/^(COURT_UNAVAILABLE|CLOSED|INVALID_RATE|INVALID_SCHEDULE|NOT_CONFIGURED)$/.test(code)) return adminResponse({ error: code }, 400);
    return adminError(error);
  }
}
