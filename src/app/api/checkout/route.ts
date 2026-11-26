import { readAdminJson as readJson } from "@/lib/admin/ethn-json";
import { hasValidOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { getCheckoutPool } from "@/db/checkout-client";
import { createCheckout } from "@/lib/booking/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ownerToken: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  idempotencyKey: z.string().regex(/^[\x21-\x7e]{1,200}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ranges: z.array(z.object({ courtId: z.string().regex(/^[1-9]\d{0,18}$/), start: z.string().length(24), end: z.string().length(24) }).strict()).min(1).max(100),
  displayedTotal: z.string().max(13),
  displayedVersion: z.string().regex(/^[1-9]\d{0,18}$/),
}).strict();

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request): Promise<Response> {
  if (!hasValidOrigin(request)) return fail("INVALID_ORIGIN", 403);
  try {
    const input = await readJson(request, 32768).catch(() => null);
    const parsed = bodySchema.safeParse(input);
    if (!parsed.success) return fail("INVALID_INPUT", 400);
    return Response.json(await createCheckout(getCheckoutPool(), parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["INVALID_INPUT"].includes(message)) return fail(message, 400);
    if (["SLOT_TAKEN", "IDEMPOTENCY_MISMATCH", "COURT_UNAVAILABLE", "CLOSED"].includes(message)) return fail(message, 409);
    if (["NOT_CONFIGURED", "INVALID_RATE", "INVALID_SCHEDULE"].includes(message)) return fail("NOT_CONFIGURED", 503);
    return fail("INTERNAL", 500);
  }
}
