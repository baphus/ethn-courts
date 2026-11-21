import { z } from "zod";
import { hasValidOrigin } from "@/lib/request-origin";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { adminError, adminResponse } from "@/lib/admin/ethn-staff-server";

export const holdSchema = z.object({ bookingId: z.string(), courtId: z.string(), date: z.string(), start: z.string(), end: z.string(), settingsVersion: z.string(), idempotencyKey: z.string() }).strict();
export const confirmSchema = z.object({ extensionId: z.string().uuid(), key: z.string().min(1).max(200), method: z.enum(["cash", "gcash"]), collectedAmount: z.string(), receivedAt: z.string(), acceptedReference: z.string().optional(), paymentReceived: z.literal(true) }).strict();
export const expireSchema = z.object({ extensionId: z.string().uuid() }).strict();
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!hasValidOrigin(request)) throw new Error("INVALID_ORIGIN");
  const result = schema.safeParse(await readAdminJson(request));
  if (!result.success) throw new Error("INVALID_INPUT");
  return result.data;
}
export function extensionError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "INVALID_ORIGIN") return adminResponse({ error: code }, 403);
  if (code === 'PROOF_MISMATCH') return adminResponse({error:code},400);
  if (code === "NOT_FOUND" || code === 'PROOF_UNAVAILABLE') return adminResponse({ error: code }, 404);
  if (/^(BOOKING_INELIGIBLE|EXTENSION_ACTIVE|PRICE_CHANGED|SLOT_TAKEN|COURT_UNAVAILABLE|INVALID_SCHEDULE|CLOSED|INVALID_RATE|EXTENSION_FINAL|EXTENSION_EXPIRED|AMOUNT_MISMATCH|REFERENCE_TAKEN|IDEMPOTENCY_MISMATCH)$/.test(code)) return adminResponse({ error: code }, 409);
  return adminError(error);
}
