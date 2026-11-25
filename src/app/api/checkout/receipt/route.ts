import { hasValidOrigin } from "@/lib/request-origin";
import { readAdminJson } from "@/lib/admin/ethn-json";
import { readCheckoutReceipt, receiptInput } from "@/lib/booking/ethn-receipt";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return fail("INVALID_ORIGIN", 403);
  const input = receiptInput.safeParse(await readAdminJson(request, 2048).catch(() => null));
  if (!input.success) return fail("INVALID_INPUT", 400);
  try {
    const { getCheckoutPool } = await import("@/db/checkout-client");
    const receipt = await readCheckoutReceipt(getCheckoutPool(), input.data);
    return receipt ? Response.json(receipt, { headers }) : fail("NOT_FOUND", 404);
  } catch {
    return fail("RECEIPT_UNAVAILABLE", 503);
  }
}
