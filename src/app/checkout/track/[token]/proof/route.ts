import { getCheckoutPool } from "@/db/checkout-client";
import { PROOF_ALLOWED_MIME, PROOF_MAX_BYTES } from "@/lib/booking/constants";
import { findTrackingProof } from "@/lib/booking/ethn-tracking-proof";
import { proofStorage } from "@/lib/booking/proof-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const notFound = () => new Response("Payment proof not found.", { status: 404, headers });
  if (!/^[0-9a-f]{64}$/i.test(token)) return notFound();
  try {
    const proof = await findTrackingProof(getCheckoutPool(), token);
    if (!proof || !(PROOF_ALLOWED_MIME as readonly string[]).includes(proof.mime_type)) return notFound();
    const image = await proofStorage.downloadTrackingProof(proof.object_path);
    if (image.type !== proof.mime_type || image.size === 0 || image.size > PROOF_MAX_BYTES) return notFound();
    return new Response(image, { headers: { ...headers, "Content-Type": proof.mime_type, "Content-Disposition": "inline" } });
  } catch {
    return new Response("Payment proof is temporarily unavailable.", { status: 503, headers });
  }
}
