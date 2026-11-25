import { TrackingSummary } from "@/components/booking/tracking-summary";
import { CopyTrackingLink } from "@/components/booking/copy-tracking-link";
import type { Metadata } from "next";
import { getCheckoutPool } from "@/db/checkout-client";
import { trackBooking } from "@/lib/booking/ethn-tracking";

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

  return (
    <main className="min-h-screen bg-[#f6f8f8] px-4 py-8 text-ink sm:py-12">
      <div className="mx-auto max-w-3xl">

        <div className="mt-8"><h1 className="font-display text-5xl font-black uppercase leading-[.9] tracking-tight text-pine sm:text-7xl">Reservation status</h1></div>
        {!booking ? (
          <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">{unavailable ? "Tracking is unavailable" : "Reservation not found"}</h2>
            <p className="mt-2 text-sm leading-6 text-warm-muted">
              {unavailable ? "Please try again later." : "Check your tracking link and try again."}
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <TrackingSummary booking={booking} />
            <CopyTrackingLink />
          </div>
        )}
        <nav className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-pine" aria-label="Reservation navigation"><a className="underline underline-offset-4" href="/book">Book another court</a><a className="underline underline-offset-4" href="/">Back to homepage</a></nav>
        <p className="mt-8 text-sm text-warm-muted">All times are local.</p>
      </div>
    </main>
  );
}
