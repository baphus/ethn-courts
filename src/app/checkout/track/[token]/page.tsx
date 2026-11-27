import { daylightFonts } from "@/app/daylight-fonts";
import { TrackingSummary } from "@/components/booking/tracking-summary";
import { CopyTrackingLink } from "@/components/booking/copy-tracking-link";
import type { Metadata } from "next";
import { getCheckoutPool } from "@/db/checkout-client";
import { trackBooking } from "@/lib/booking/ethn-tracking";
import { findTrackingProof } from "@/lib/booking/ethn-tracking-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track reservation — ETHN COURTS",
  description: "View your reservation status.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CheckoutTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let booking: Awaited<ReturnType<typeof trackBooking>> = null;
  let unavailable = false;
  if (/^[0-9a-f]{64}$/i.test(token)) {
    try {
      booking = await trackBooking(getCheckoutPool(), { token });
    } catch {
      unavailable = true;
    }
  }

  const proof = booking ? await findTrackingProof(getCheckoutPool(), token).catch(() => null) : null;
  const proofHref = proof ? `/checkout/track/${encodeURIComponent(token)}/proof` : undefined;

  return (
    <main className={`daylight ${daylightFonts} min-h-screen bg-muted px-4 py-8 text-foreground sm:py-12`}>
      <div className="mx-auto max-w-3xl">

        <div className="mt-8"><h1 className="landing-heading text-foreground">Reservation status</h1></div>
        {!booking ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">{unavailable ? "Tracking is unavailable" : "Reservation not found"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {unavailable ? "Please try again later." : "Check your tracking link and try again."}
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <TrackingSummary booking={booking} proofHref={proofHref} />
            <CopyTrackingLink />
          </div>
        )}
        <nav className="mt-8 flex flex-wrap gap-3" aria-label="Reservation navigation"><a className="public-cta-primary inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold" href="/book">Book another court</a><a className="inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-5 text-sm font-bold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href="/">Back to homepage</a></nav>
      </div>
    </main>
  );
}
