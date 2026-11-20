import { hasValidOrigin } from "@/lib/request-origin";
import { getCheckoutPool } from "@/db/checkout-client";
import { trackBooking, trackingInput } from "@/lib/booking/ethn-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request): Promise<Response> {
  if (!hasValidOrigin(request)) return fail("INVALID_ORIGIN", 403);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) return fail("INVALID_INPUT", 400);
  try {
    const reader = request.body?.getReader();
    if (!reader) return fail("INVALID_INPUT", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); return fail("INVALID_INPUT", 400); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail("INVALID_INPUT", 400); }
    const parsed = trackingInput.safeParse(input);
    if (!parsed.success) return fail("INVALID_INPUT", 400);
    const result = await trackBooking(getCheckoutPool(), parsed.data);
    return result ? Response.json(result, { headers }) : fail("NOT_FOUND", 404);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_CONFIGURED") return fail("NOT_CONFIGURED", 503);
    return fail("INTERNAL", 500);
  }
}
