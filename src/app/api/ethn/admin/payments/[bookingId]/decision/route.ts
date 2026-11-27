import { hasValidOrigin } from "@/lib/request-origin";
import { after } from "next/server";
import { z } from "zod";
import { decidePayment } from "@/lib/admin/ethn-payment-decision";
import { adminError, adminResponse, staffPool, verifyStaffIdentity } from "@/lib/admin/ethn-staff-server";
import { sendEthnMailBestEffort } from "@/lib/mail/ethn-hook-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("action", [
  z.object({ key: z.string(), action: z.literal("approve"), paymentReceived: z.literal(true).optional(), acceptedReference: z.string().trim().min(1).max(200).optional(), collectedAmount: z.string().optional(), receivedAt: z.string().optional() }).strict(),
  z.object({ key: z.string(), action: z.literal("reject"), reason: z.string() }).strict(),
]);

export async function POST(request: Request, { params }: { params: Promise<{ bookingId: string }> }) {
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
      if (size > 32768) { await reader.cancel(); return adminResponse({ error: "INVALID_INPUT" }, 400); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return adminResponse({ error: "INVALID_INPUT" }, 400); }
    const parsed = input.safeParse(body);
    if (!parsed.success) return adminResponse({ error: "INVALID_INPUT" }, 400);
    const result = await decidePayment(staffPool, verifyStaffIdentity, { ...parsed.data, bookingId: (await params).bookingId });
    try { after(() => sendEthnMailBestEffort(result.bookingId)); } catch { /* Decision already committed. */ }
    return adminResponse(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/^(IDEMPOTENCY_MISMATCH|IDEMPOTENCY_INCOMPLETE|DECISION_ALREADY_FINAL|DECISION_INCOMPATIBLE|REFERENCE_MISMATCH|AMOUNT_MISMATCH|REFERENCE_ALREADY_USED)$/.test(code)) return adminResponse({ error: code }, 409);
    return adminError(error);
  }
}
