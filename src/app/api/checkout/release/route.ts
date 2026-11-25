import { z } from "zod";
import { getCheckoutPool } from "@/db/checkout-client";
import { readAdminJson as readJson } from "@/lib/admin/ethn-json";
import { releaseCheckout } from "@/lib/booking/checkout";
import { hasValidOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const schema = z.object({ ownerToken: uuid, checkoutId: uuid }).strict();

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const input = schema.safeParse(await readJson(request, 256).catch(() => null));
  if (!input.success) return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const released = await releaseCheckout(getCheckoutPool(), input.data);
    return released ? Response.json({ released }) : Response.json({ error: "CHECKOUT_UNAVAILABLE" }, { status: 409 });
  } catch {
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}
