import {readWalkInHold} from '@/lib/admin/ethn-walk-in-read';
import { z } from "zod";
import { hasValidOrigin } from "@/lib/request-origin";
import { reserveWalkIn, createWalkIn } from "@/lib/admin/ethn-walk-ins";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.object({
  action: z.literal("confirm").optional(), courtId: z.string(), date: z.string(), start: z.string(), end: z.string(),
  guestName: z.string(), guestPhone: z.string().nullable().optional(),
  holdId: z.string().uuid().optional(), method: z.enum(["cash", "gcash"]).optional(), reference: z.string().nullable().optional(),
  collectedAmount: z.string().optional(), displayedTotal: z.string().optional(), settingsVersion: z.string().optional(), paymentReceived: z.literal(true).optional(), idempotencyKey: z.string().optional(),
}).strict();

export async function GET(){try{return adminResponse(await readWalkInHold(staffPool,verifyStaffIdentity));}catch(e){return adminError(e);}}

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
    if (body && typeof body === "object" && !Array.isArray(body) && "action" in body && (body as {action?:unknown}).action === "reserve") {
      const { action: _action, ...reserveBody } = body as Record<string, unknown>;
      return adminResponse(await reserveWalkIn(staffPool, verifyStaffIdentity, reserveBody));
    }
    const parsed = input.safeParse(body);
    if (!parsed.success || !parsed.data.holdId || !parsed.data.method || !parsed.data.collectedAmount || !parsed.data.displayedTotal || !parsed.data.settingsVersion || !parsed.data.idempotencyKey || !parsed.data.paymentReceived) return adminResponse({ error: "INVALID_INPUT" }, 400);
    const { action: _action, ...confirmBody } = parsed.data;
    return adminResponse(await createWalkIn(staffPool, verifyStaffIdentity, confirmBody));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SLOT_TAKEN" || code === "REFERENCE_TAKEN" || code === "PRICE_CHANGED" || code === "IDEMPOTENCY_MISMATCH" || code === 'HOLD_EXPIRED' || code === 'HOLD_NOT_FOUND') return adminResponse({ error: code }, 409);
    if (/^(COURT_UNAVAILABLE|CLOSED|INVALID_RATE|INVALID_SCHEDULE|NOT_CONFIGURED)$/.test(code)) return adminResponse({ error: code }, 400);
    return adminError(error);
  }
}
