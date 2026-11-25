import { BookingStatusBadge } from "@/components/booking/booking-status";

export type Tracking = {
  status: string;
  operatingDate: string;
  total: string;
  items: { court: string; startsAt: string | Date; endsAt: string | Date; amount: string }[];
  payments: { status: string; method: string; reviewReason?: string }[];
};

const date = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });
const dateTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
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
    <section className="rounded-2xl border border-[#dce5e8] bg-white p-5 sm:p-7" aria-label="Reservation details">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#dce5e8] pb-5">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Reservation details</p><h2 className="mt-2 font-display text-2xl font-bold text-[#447244]">Court schedule</h2></div>
        <div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wider text-[#405966]">Operating date</p><p className="mt-2 text-sm font-semibold">{date.format(new Date(`${booking.operatingDate}T12:00:00+08:00`))}</p></div>
      </div>
      <ul className="divide-y divide-[#dce5e8]">{booking.items.map((item, i) => <li key={i} className="flex flex-wrap justify-between gap-3 py-4"><div><p className="font-bold">{item.court}</p><p className="mt-1 text-sm leading-6 text-[#405966]">{dateTime.format(new Date(item.startsAt))} – {dateTime.format(new Date(item.endsAt))}</p></div><p className="font-semibold">{money.format(Number(item.amount))}</p></li>)}</ul>
      <div className="flex justify-between gap-4 border-t border-[#dce5e8] pt-4 font-bold"><span>Original booking total</span><span>{money.format(Number(booking.total))}</span></div>
      <p className="mt-2 text-xs leading-5 text-[#405966]">Court schedule may include confirmed extensions. All dates and times are Manila time.</p>
    </section>
    <section className="rounded-2xl border border-[#dce5e8] bg-white p-5 sm:p-7" aria-label="Payment details">
      <h2 className="font-display text-xl font-bold text-[#447244]">Payment details</h2>
      {booking.payments.length === 0 ? <p className="mt-3 text-sm text-[#405966]">No payment recorded.</p> : <ul className="mt-3 divide-y divide-[#dce5e8]">{booking.payments.map((payment, i) => <li key={i} className="py-3 text-sm first:pt-0 last:pb-0"><div className="flex flex-wrap justify-between gap-2"><span>{label(payment.method)}</span><span className="font-semibold">{label(payment.status)}</span></div>{booking.status === "rejected" && payment.status === "rejected" && payment.reviewReason && <p className="mt-2">Reason: {payment.reviewReason}</p>}</li>)}</ul>}
      {booking.status === "pending" && booking.payments.some(payment => payment.status === "unverified") && <p className="mt-4 text-xs leading-5 text-[#405966]">We’ve received your payment proof. Your reservation isn’t confirmed until the venue verifies your payment.</p>}
    </section>
  </div>;
}
