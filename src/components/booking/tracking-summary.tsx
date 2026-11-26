import { BookingStatusBadge } from "@/components/booking/booking-status";
import { BookingInvoice } from "@/components/booking/ethn-booking-invoice";

export type Tracking = {
  status: string;
  operatingDate: string;
  total: string;
  items: { court: string; startsAt: string | Date; endsAt: string | Date; amount: string; durationMinutes: number; intervalMinutes: number; hourlyRate: string; isExtension: boolean }[];
  payments: { status: string; method: string; reviewReason?: string }[];
};

const label = (value: string) => value.toLowerCase() === "gcash" ? "GCash" : value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const explanations: Record<string, string> = {
  pending: "Your reservation is pending review and is not yet confirmed.",
  confirmed: "Your reservation is confirmed. See your court schedule below.",
  completed: "Your reservation has been completed.",
  rejected: "Your reservation was not confirmed. See payment details below for any available reason.",
};

export function TrackingSummary({ booking }: { booking: Tracking }) {
  return <div className="space-y-4 text-[#17252e]">
    <section className="rounded-2xl border border-[#cddfc9] bg-[#f2f8ef] p-5 sm:p-7" aria-label="Reservation status">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Reservation status</p>
      <div className="mt-3"><BookingStatusBadge state={booking.status} /></div>
      <p className="mt-3 text-sm leading-6">{explanations[booking.status]}</p>
    </section>
    <BookingInvoice date={booking.operatingDate} items={booking.items.filter(item => !item.isExtension)} total={booking.total} totalLabel="Original booking total" extensionItems={booking.items.filter(item => item.isExtension)} />
    <section className="rounded-2xl border border-[#dce5e8] bg-white p-5 sm:p-7" aria-label="Payment details">
      <h2 className="font-display text-xl font-bold text-[#447244]">Payment details</h2>
      {booking.payments.length === 0 ? <p className="mt-3 text-sm text-[#405966]">No payment recorded.</p> : <ul className="mt-3 divide-y divide-[#dce5e8]">{booking.payments.map((payment, i) => <li key={i} className="py-3 text-sm first:pt-0 last:pb-0"><div className="flex flex-wrap justify-between gap-2"><span>{label(payment.method)}</span><span className="font-semibold">{label(payment.status)}</span></div>{booking.status === "rejected" && payment.status === "rejected" && payment.reviewReason && <p className="mt-2">Reason: {payment.reviewReason}</p>}</li>)}</ul>}
      {booking.status === "pending" && booking.payments.some(payment => payment.status === "unverified") && <p className="mt-4 text-xs leading-5 text-[#405966]">We’ve received your payment proof. Your reservation isn’t confirmed until the venue verifies your payment.</p>}
    </section>
  </div>;
}
