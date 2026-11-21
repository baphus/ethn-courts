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

const date = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", dateStyle: "long",
});
const dateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
});
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

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
        <header className="flex items-center justify-between border-b border-line pb-4"><a href="/" aria-label="ETHN Courts home" className="flex items-center gap-3"><img src="/ethn-courts-mark.png" alt="" className="size-11 rounded-xl object-cover"/><span className="text-sm font-extrabold tracking-[.16em] text-pine">ETHN <span className="text-[#f28500]">COURTS</span></span></a><a href="/book" className="text-sm font-bold text-pine hover:text-[#f28500]">Book a court</a></header>
        <div className="mt-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f28500]">Booking updates</p><h1 className="font-display mt-2 text-5xl tracking-wide text-pine sm:text-7xl">Reservation status</h1></div>
        {!booking ? (
          <div className="mt-8 border border-line bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold">{unavailable ? "Tracking is unavailable" : "Reservation not found"}</h2>
            <p className="mt-2 text-sm leading-6 text-warm-muted">
              {unavailable ? "Please try again later." : "Check your tracking link and try again."}
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <section className="border border-line bg-white p-6 shadow-sm sm:p-8" aria-labelledby="reservation-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-warm-muted">Reservation</p>
                  <h2 id="reservation-heading" className="mt-2 text-2xl font-bold capitalize text-pine">{booking.status}</h2>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-warm-muted">Total</p>
                  <p className="mt-2 text-xl font-bold">{money.format(Number(booking.total))}</p>
                </div>
              </div>
              {booking.status === "pending" && <p className="mt-4 text-sm leading-6 text-ink">Your reservation is pending review and is not yet confirmed.</p>}
              <div className="mt-6 border-t border-line pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-warm-muted">Operating date</p>
                <p className="mt-2 font-semibold">{date.format(new Date(`${booking.operatingDate}T12:00:00+08:00`))}</p>
                <p className="mt-1 text-sm text-warm-muted">All dates and times are in Asia/Manila.</p>
              </div>
            </section>
            <section className="border border-line bg-white p-6 shadow-sm sm:p-8" aria-labelledby="courts-heading">
              <h2 id="courts-heading" className="text-lg font-bold">Court schedule</h2>
              <ul className="mt-4 divide-y divide-line">
                {booking.items.map((item, index) => (
                  <li key={index} className="flex flex-wrap justify-between gap-3 py-4 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-semibold">{item.court}</p>
                      <p className="mt-1 text-sm text-warm-muted">Start: {dateTime.format(new Date(item.startsAt))}</p>
                      <p className="mt-1 text-sm text-warm-muted">End: {dateTime.format(new Date(item.endsAt))}</p>
                    </div>
                    <p className="font-semibold">{money.format(Number(item.amount))}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="border border-line bg-white p-6 shadow-sm sm:p-8" aria-labelledby="payment-heading">
              <h2 id="payment-heading" className="text-lg font-bold">Payment status</h2>
              {booking.payments.length === 0 ? <p className="mt-3 text-sm text-warm-muted">No payment recorded.</p> : (
                <ul className="mt-3 space-y-3">
                  {booking.payments.map((payment, index) => (
                    <li key={index} className="flex flex-wrap justify-between gap-2 text-sm">
                      <span className="uppercase">{payment.method}</span>
                      <span className="font-semibold capitalize">{payment.status}</span>
                      {booking.status === "rejected" && payment.status === "rejected" && payment.reviewReason && <p className="w-full">Reason: {payment.reviewReason}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-sm leading-6 text-warm-muted">Payment status is separate from reservation status.</p>
            </section>
          </div>
        )}
        <footer className="mt-8 border-t border-line pt-5 text-sm text-warm-muted">ETHN COURTS · All times are in Asia/Manila.</footer>
      </div>
    </main>
  );
}
