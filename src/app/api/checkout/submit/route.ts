import { readAdminJson as readJson } from "@/lib/admin/ethn-json";
import { hasValidOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { after } from "next/server";
import { sendEthnMailBestEffort } from "@/lib/mail/ethn-hook-server";
import { getCheckoutPool } from "@/db/checkout-client";
import { submitBooking } from "@/lib/booking/submission";
import { openPlayDetails } from "@/lib/booking/ethn-tracking";
import { proofStorage } from "@/lib/booking/proof-storage";
import { gcashReference, validateGuest } from "@/lib/booking/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const amount = z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/);
const bodySchema = z.object({
  ownerToken: z.string().regex(uuid), checkoutId: z.string().regex(uuid), reservationId: z.string().regex(uuid),
  idempotencyKey: z.string().regex(/^[\x21-\x7e]{1,200}$/),
  customer: z.object({ name: z.string().max(200), email: z.string().max(254), phone: z.string().max(50) }).strict(),
  paymentMethodId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), reference: z.string().max(200).optional(), claimedAmount: amount.optional(), acknowledgedTotal: amount.optional(),
  openPlay: openPlayDetails.optional(),
}).strict();
const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request): Promise<Response> {
  if (!hasValidOrigin(request)) return fail("INVALID_ORIGIN", 403);
  try {
    const input = await readJson(request, 32768).catch(() => null);
    const parsed = bodySchema.safeParse(input);
    if (!parsed.success || !validateGuest({ kind: "online", ...parsed.data.customer })) return fail("INVALID_INPUT", 400);
    try { if (parsed.data.reference?.trim()) gcashReference(parsed.data.reference); } catch { return fail("INVALID_INPUT", 400); }
    const result = await submitBooking(getCheckoutPool(), proofStorage, parsed.data);
    if (result.booked && process.env.ETHN_MAIL_ENABLED === "1") {
      try { after(() => sendEthnMailBestEffort(parsed.data.checkoutId)); }
      catch { console.error("ETHN mail delivery unavailable"); }
    }
    return Response.json(result, { status: result.booked ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["INVALID_INPUT", "AMOUNT_MISMATCH", "PROOF_METADATA_MISMATCH"].includes(message)) return fail(message, 400);
    if (["CHECKOUT_UNAVAILABLE", "ALREADY_SUBMITTED", "ACKNOWLEDGEMENT_REQUIRED", "IDEMPOTENCY_MISMATCH", "IDEMPOTENCY_INCOMPLETE"].includes(message)) return fail(message, 409);
    if (["NOT_CONFIGURED", "STORAGE_UNAVAILABLE", "SUBMISSION_UNAVAILABLE"].includes(message)) return fail(message, 503);
    return fail("INTERNAL", 500);
  }
}
