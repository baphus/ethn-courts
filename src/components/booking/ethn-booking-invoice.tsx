import { gridSlotCount, invoiceMoney, invoiceSlotRate, invoiceTimeRange } from "@/lib/booking/invoice-format";
import { formatDisplayDate } from "@/lib/display-date";

type InvoiceItem = { court: string; startsAt: string | Date; endsAt: string | Date; amount: string; durationMinutes: number; intervalMinutes?: number; hourlyRate?: string };

export function BookingInvoice({ date, items, total, paymentMethod, email, extensionItems = [], heading = "Booking invoice", totalLabel = "Total" }: { date: string; items: InvoiceItem[]; total: string; paymentMethod?: string; email?: string; extensionItems?: InvoiceItem[]; heading?: string; totalLabel?: string }) {
  const line = (item: InvoiceItem, i: number) => (
    <li key={`${item.court}-${item.startsAt}-${i}`} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold">{item.court}</p>
        <p className="mt-1 text-muted-foreground">{invoiceTimeRange(date, item.startsAt, item.endsAt)}</p>
        <p className="text-muted-foreground">{invoiceSlotRate(item.durationMinutes, item.intervalMinutes, item.hourlyRate)}</p>
      </div>
      <p className="shrink-0 font-semibold tabular-nums">{invoiceMoney(item.amount)}</p>
    </li>
  );
  const counts = items.map(item => gridSlotCount(item.durationMinutes, item.intervalMinutes));
  const slotTotal = counts.every(count => count !== undefined) ? counts.reduce((sum, count) => sum + count, 0) : "Unavailable";
  return <section aria-label={heading} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="text-sm text-muted-foreground">Booking date · {formatDisplayDate(date)}</p>
    </div>
    {items.length ? <ul className="divide-y">{items.map(line)}</ul> : <p className="py-3 text-sm text-muted-foreground">No court items recorded.</p>}
    <dl className="space-y-2 border-t pt-3 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Total slots</dt><dd className="font-semibold tabular-nums">{slotTotal}</dd></div>
      {paymentMethod && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Payment method</dt><dd className="text-right font-semibold">{paymentMethod}</dd></div>}
      {email && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Email</dt><dd className="break-all text-right font-semibold">{email}</dd></div>}
      <div className="flex justify-between gap-4 pt-2 text-lg font-bold"><dt>{totalLabel}</dt><dd className="tabular-nums">{invoiceMoney(total)}</dd></div>
    </dl>
    {extensionItems.length > 0 && <div className="mt-4 border-t pt-3"><h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Confirmed extensions · separate from booking total</h3><ul className="mt-1 divide-y">{extensionItems.map(line)}</ul></div>}
  </section>;
}
