import { BookingStatusBadge } from "@/components/booking/booking-status";
import { BookingInvoice } from "@/components/booking/ethn-booking-invoice";
import { TrackingProofPreview } from "@/components/booking/tracking-proof-preview";
import { CalendarDays, CircleCheck, Clock3, CreditCard, XCircle } from "lucide-react";

export type Tracking = {
  status: string;
  operatingDate: string;
  total: string;
  items: { court: string; startsAt: string | Date; endsAt: string | Date; amount: string; durationMinutes: number; intervalMinutes: number; hourlyRate: string; isExtension: boolean }[];
  payments: { status: string; method: string; reviewReason?: string }[];
};

const label = (value: string) => value.toLowerCase() === "gcash" ? "GCash" : value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const statusCopy: Record<string, { heading: string; detail: string; Icon: typeof Clock3; tone: string }> = {
  pending: { heading: "Booking submitted!", detail: "Staff will review your payment and update this status. Your booking is not confirmed yet.", Icon: Clock3, tone: "bg-warning/10 text-warning" },
  confirmed: { heading: "Booking confirmed", detail: "Your reservation is confirmed. See your court schedule below.", Icon: CircleCheck, tone: "bg-success/10 text-success" },
  completed: { heading: "Booking complete", detail: "Your reservation has been completed.", Icon: CalendarDays, tone: "bg-muted text-foreground" },
  rejected: { heading: "Booking not confirmed", detail: "See payment details below for any available reason.", Icon: XCircle, tone: "bg-destructive/10 text-destructive" },
};

export function TrackingSummary({ booking, proofHref }: { booking: Tracking; proofHref?: string }) {
  const status = statusCopy[booking.status] ?? { heading: "Reservation status", detail: "Check the payment details below for the latest update.", Icon: Clock3, tone: "bg-muted text-foreground" };
  return <div className="space-y-4 text-foreground">
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-label="Reservation status">
      <div className="flex items-start gap-3"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${status.tone}`}><status.Icon className="size-5" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-muted-foreground">Reservation status</p><h2 className="mt-1 font-display text-2xl font-bold text-foreground">{status.heading}</h2></div></div>
      <div className="mt-4"><BookingStatusBadge state={booking.status} /></div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{status.detail}</p>
      {booking.status === "pending" && <p className="mt-3 text-sm leading-6 text-muted-foreground">Keep this private tracking link to check for updates.</p>}
      {proofHref && <TrackingProofPreview href={proofHref} />}
    </section>
    <BookingInvoice date={booking.operatingDate} items={booking.items.filter(item => !item.isExtension)} total={booking.total} totalLabel="Original booking total" extensionItems={booking.items.filter(item => item.isExtension)} />
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-label="Payment details">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-foreground"><CreditCard className="size-5 text-primary" aria-hidden="true" />Payment details</h2>
      {booking.payments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No payment recorded.</p> : <ul className="mt-3 divide-y divide-border">{booking.payments.map((payment, i) => <li key={i} className="py-3 text-sm first:pt-0 last:pb-0"><div className="flex flex-wrap justify-between gap-2"><span>{label(payment.method)}</span><span className="font-semibold">{label(payment.status)}</span></div>{booking.status === "rejected" && payment.status === "rejected" && payment.reviewReason && <p className="mt-2 text-muted-foreground">Reason: {payment.reviewReason}</p>}</li>)}</ul>}
      {booking.status === "pending" && booking.payments.some(payment => payment.status === "unverified") && <p className="mt-4 text-sm leading-6 text-muted-foreground">Payment proof received and awaiting review. Payment is not confirmed until venue staff verify it.</p>}
    </section>
  </div>;
}
