import { readAdminJson as readJson } from "@/lib/admin/ethn-json";
import { hasValidOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { getCheckoutPool } from "@/db/checkout-client";
import { reserveProof } from "@/lib/booking/proof-reservation";
import { signReservedProof } from "@/lib/booking/proof-signing";
import { proofStorage } from "@/lib/booking/proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bodySchema = z.object({
  ownerToken: z.string().regex(uuid),
  checkoutId: z.string().regex(uuid),
  idempotencyKey: z.string().regex(/^[\x21-\x7e]{1,200}$/),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().min(1).max(5 * 1024 * 1024),
  acknowledgedTotal: z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/).optional(),
}).strict();

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request): Promise<Response> {
  if (!hasValidOrigin(request)) return fail("INVALID_ORIGIN", 403);
  try {
    const input = await readJson(request, 32768).catch(() => null);
    const parsed = bodySchema.safeParse(input);
    if (!parsed.success) return fail("INVALID_INPUT", 400);
    const pool = getCheckoutPool();
    const reservation = await reserveProof(pool, parsed.data);
    const signed = await signReservedProof(pool, { ownerToken: parsed.data.ownerToken, checkoutId: parsed.data.checkoutId, reservationId: reservation.reservationId }, proofStorage);
    return Response.json({ reservationId: reservation.reservationId, path: signed.path, signedUrl: signed.signedUrl, token: signed.token, checkoutExpiresAt: signed.expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_INPUT") return fail(message, 400);
    if (["CHECKOUT_UNAVAILABLE", "ACKNOWLEDGEMENT_REQUIRED", "IDEMPOTENCY_MISMATCH", "IDEMPOTENCY_INCOMPLETE"].includes(message)) return fail(message, 409);
    if (["NOT_CONFIGURED", "STORAGE_UNAVAILABLE"].includes(message)) return fail(message, 503);
    return fail("INTERNAL", 500);
  }
}
