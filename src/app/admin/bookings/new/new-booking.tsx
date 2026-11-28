"use client";
import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { Input } from "@/components/ui/input";
import { BookingDateStrip } from "@/components/booking/booking-date-strip";
import { addDays } from "@/components/booking/ethn-selection";
import { FormSelect } from "@/components/ui/form-select";
import { useConfirm } from "@/components/ui/confirm";
import { LoadingRows } from "@/components/admin/loading-slots";
import { useEffect, useRef, useState } from "react";
import { availabilityCache } from "@/components/booking/ethn-availability-cache";
import { BookingInvoice } from "@/components/booking/ethn-booking-invoice";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { manilaDateStr } from "@/lib/booking/slots";
import { cellWindow, money, rows, summarize, toggleHour, type Availability, type Selection } from "./selection";

type Method = { id: string; name: string };
export default function NewBooking() {
  const confirm = useConfirm();
  const [date, setDate] = useState("");
  const [selection, setSelection] = useState<Selection>({});
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [method, setMethod] = useState("cash"); const [reference, setReference] = useState(""); const [received, setReceived] = useState(false);
  const [schedule, setData] = useState<Availability | null>(null);
  const data = schedule && (!date || schedule.date === date) ? schedule : null; const [methods, setMethods] = useState<Method[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState({ message: "", announce: true }); const [result, setResult] = useState<{ bookingId: string; total: string; method: string } | null>(null);
  const setError = (message: string, announce = true) => setNotice({ message, announce });
  const [pending, setPending] = useState<{ body: Record<string, unknown>; key: string } | null>(null);
  const [revision, setRevision] = useState(0); const [review, setReview] = useState(false);
  const monthCache = useRef<ReturnType<typeof availabilityCache<Pick<Availability, "date" | "courts">, Omit<Availability, "date" | "courts">>> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const cache = monthCache.current ??= availabilityCache<Pick<Availability, "date" | "courts">, Omit<Availability, "date" | "courts">>();
    const wanted = date || manilaDateStr(new Date());
    const cached = cache.get(wanted);
    if (cached && (date || cached.data.operatingDate === wanted)) { setData(cached.data); return; }
    setData(null);
    async function load() {
      const snapshot = await cache.load(wanted, signal);
      if (signal.aborted) return;
      if (snapshot && (date || snapshot.data.operatingDate === wanted)) { setData(snapshot.data); return; }
      // Server chooses the operating day before the Manila day anchor.
      const response = await fetch(date ? `/api/ethn/availability?date=${encodeURIComponent(date)}` : "/api/ethn/availability", { signal, cache: "no-store" });
      if (!response.ok) throw Error();
      const value: Availability = await response.json();
      if (!signal.aborted) setData(value);
    }
    void load().catch(() => { if (!signal.aborted) setError("Schedule unavailable. Reload to view current availability."); });
    return () => controller.abort();
  }, [date, revision]);
  useEffect(() => { const c = new AbortController(); fetch("/api/ethn/payment-methods", { signal: c.signal, cache: "no-store" }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(d => setMethods(d.methods)).catch(() => { if (!c.signal.aborted) setError("Payment methods unavailable. Cash remains available."); }); return () => c.abort(); }, []);
  const operatingDate = date || data?.date || "";
  const now = Math.max(Date.now(), data ? Date.parse(data.serverNow) : 0);
  const summary = data && data.date === operatingDate ? summarize(data, operatingDate, selection, now) : [];
  const total = summary.every(s => s.cents !== null) ? money(summary.reduce((sum, s) => sum + (s.cents ?? BigInt(0)), BigInt(0))) : "";
  const valid = summary.length > 0 && summary.length <= 100 && total !== "0.00" && /^\d{1,10}\.\d{2}$/.test(total) && summary.every(s => s.available && s.eligible);
  const timeRows = data ? rows(data, selection) : [];
  const step = review ? 2 : 1;
  const minDate = data?.operatingDate;
  const maxDate = data ? addDays(data.operatingDate, data.settings.horizonDays - 1) : undefined;
  function removeHour(courtId: string, hour: number) {
    if (!selection[courtId]?.includes(hour)) return;
    const next = toggleHour(selection, courtId, hour);
    setSelection(next.selection); setReceived(false); setError(next.error);
  }
  async function send(body: Record<string, unknown>, key: string) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/ethn/admin/walk-ins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: key }) });
      if (r.status >= 500) throw Error();
      if (!r.ok) {
        const conflict = r.status === 409 ? (await r.json()).error : null;
        if (conflict === "IDEMPOTENCY_INCOMPLETE") throw Error();
        setPending(null);
        if (conflict === "REFERENCE_TAKEN") {
          setReceived(false); setReview(false); setError("This transfer ID is already recorded. Check the receiving account before saving.", true);
        } else if (r.status === 409) {
          monthCache.current?.clear();
          setReceived(false); setReview(false); setRevision(n => n + 1);
          setError("Booking conflict. Review refreshed availability and total, then confirm full payment again.", false);
          toast.error("Booking not created.", { description: "Review the selection and payment details." });
        } else {
          setError("Booking could not be saved. Check details and Owner access.", r.status === 400);
          if (r.status !== 400) toast.error("Booking creation rejected.", { description: "Check details and Owner access." });
        }
        return;
      }
      const value = await r.json();
      if (value?.status !== "confirmed" || typeof value.bookingId !== "string") throw Error();
      monthCache.current?.clear();
      setPending(null); setResult({ bookingId: value.bookingId, total: value.total, method: value.method }); setReceived(false);
      toast.success("Internal booking confirmed.");
    } catch {
      setPending({ body, key }); setError("Result unknown. Retry the same request or check bookings before discarding it.", false);
      toast.warning("Booking creation not confirmed.", { description: "Check bookings or retry the same request." });
    }
    finally { setBusy(false); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !valid || !name.trim() || (method !== "cash" && !reference.trim()) || !received || busy || !!pending) { setError("Check the selected hours, guest and payment details, and confirm full payment."); return; }
    if (!review) { setReview(true); setError(""); return; }
    if (!await confirm(`Confirm ${summary.length} court range(s) for ₱${total}? Full payment must already be received${method !== "cash" ? " and checked in the merchant account" : ""}.`, { title: "Confirm internal booking", confirmLabel: "Confirm booking" })) return;
    const body = { date: operatingDate, ranges: summary.map(s => ({ courtId: s.courtId, start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })), guestName: name.trim(), guestPhone: phone.trim() || null, guestEmail: email.trim() || null, method, reference: method === "cash" ? null : reference.trim(), displayedTotal: total, settingsVersion: data.settings.version, paymentReceived: true };
    const key = crypto.randomUUID(); setPending({ body, key }); void send(body, key);
  }
  const field = "grid gap-1 text-sm font-medium";
  return <div className="w-full space-y-5 pb-24">
    <Link className="text-sm text-primary underline" href="/admin/bookings">← Back to bookings</Link>
    <header><h1 className="text-2xl font-semibold tracking-tight">New booking</h1><p className="mt-2 text-sm text-muted-foreground">Choose available hours, then record full payment. Selection does not reserve a court.</p></header>
    {notice.message && <p role={notice.announce ? "alert" : undefined} className="rounded-lg border border-destructive/40 p-3 text-sm">{notice.message}</p>}{result && <section role="status" className="space-y-4 rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Booking recorded</h2><p className="text-sm">Payment recorded: ₱{result.total} · {result.method}</p><div className="flex flex-wrap items-center gap-2"><Button nativeButton={false} render={<Link href={`/admin/bookings/${encodeURIComponent(result.bookingId)}`} />} className="min-h-11">View booking</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => { setResult(null); setDate(operatingDate); setSelection({}); setName(""); setPhone(""); setEmail(""); setMethod("cash"); setReference(""); setReceived(false); setReview(false); setRevision(n => n + 1); }}>Create another</Button></div></section>}
    {!result && <><ol aria-label="Booking progress" className="grid max-w-2xl grid-cols-2 gap-3"><li aria-current={step === 1 ? "step" : undefined} className="flex items-center gap-3 text-sm"><span className={`grid size-10 shrink-0 place-items-center rounded-full border-2 ${step === 1 ? "border-primary bg-primary text-primary-foreground" : "border-primary bg-background text-foreground"}`}>1</span><span className="font-semibold">Slots &amp; details</span></li><li aria-current={step === 2 ? "step" : undefined} className="flex items-center gap-3 text-sm"><span className={`grid size-10 shrink-0 place-items-center rounded-full border-2 ${step === 2 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}>2</span><span className="font-semibold">Review &amp; confirm</span></li></ol>
    <form id="new-booking-form" onSubmit={submit} className={`grid items-start gap-4 pb-28 lg:pb-6 ${review ? "max-w-3xl" : "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]"}`}><fieldset disabled={busy || !!pending} className="min-w-0 space-y-6 rounded-xl border bg-card p-4 sm:p-6 lg:col-start-1 lg:row-start-1">
      {step === 1 ? <><div className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0 flex-1"><BookingDateStrip disabled={busy || !!pending} label="Booking date" anchor={operatingDate || data?.operatingDate || ""} min={minDate} max={maxDate} value={operatingDate} onChange={async value => { if (Object.keys(selection).length && !await confirm("Changing the date clears selected hours. Continue?", { confirmLabel: "Change date" })) return; setSelection({}); setReview(false); setReceived(false); setDate(value); }} /></div></div>
      <section aria-labelledby="hours-heading" className="space-y-3"><div><h2 id="hours-heading" className="text-lg font-semibold">Choose court hours</h2><p className="text-sm text-muted-foreground">Select adjacent hours to build one continuous range per court. Selected hours stay visible if availability changes.</p></div>
        {!data ? <LoadingRows label="Loading schedule" rows={6} /> : <div role="region" aria-labelledby="hours-heading" tabIndex={0} className="max-h-[32rem] overflow-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring"><table className="w-full border-separate border-spacing-0 text-sm"><thead className="sticky top-0 z-20 bg-muted"><tr><th scope="col" className="sticky left-0 z-30 min-w-28 border-b border-r bg-muted p-3 text-left">Time</th>{data.courts.map(c => <th key={c.id} scope="col" className="min-w-28 border-b border-r bg-muted p-3 text-center">{c.name}</th>)}</tr></thead><tbody>{timeRows.map(t => <tr key={t}><th scope="row" className="sticky left-0 z-10 border-b border-r bg-card p-3 text-left font-medium">{formatScheduleRange(t, t + 3_600_000, operatingDate)}</th>{data.courts.map(c => { const selected = !!selection[c.id]?.includes(t); const available = !!cellWindow(c, t, now, data.settings.intervalMinutes); return <td key={c.id} className="border-b border-r p-1 text-center"><button type="button" disabled={!available && !selected} aria-pressed={selected} aria-label={`${c.name}, ${formatScheduleRange(t, t + 3_600_000, operatingDate)}: ${selected ? available ? "selected" : "selected, unavailable" : available ? "available" : "unavailable"}. ${selected ? "Activate to remove." : ""}`} onClick={() => { if (selected && !available) { removeHour(c.id, t); return; } const next = toggleHour(selection, c.id, t); setSelection(next.selection); setReceived(false); setError(next.error); }} className={`inline-flex h-11 w-full min-w-11 max-w-24 [@media(max-aspect-ratio:3/4)]:w-11 items-center justify-center rounded-full border px-1 text-center text-[11px] font-semibold leading-tight motion-safe:transition-[scale] motion-safe:duration-200 motion-safe:ease-out motion-safe:enabled:active:scale-90 motion-safe:enabled:aria-pressed:not-active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? available ? "border-primary bg-primary text-primary-foreground aria-pressed:shadow-md" : "border-destructive bg-destructive/10 text-destructive" : available ? "border-input bg-muted text-primary hover:bg-primary/15" : "border-border bg-accent text-muted-foreground"}`}>{selected ? available ? "Selected ✓" : "Remove ×" : available ? "+" : "×"}<span className="sr-only">{selected ? "Selected" : available ? "Available" : "Unavailable"}</span></button></td>; })}</tr>)}</tbody></table>{!timeRows.length && <p className="p-4 text-sm text-muted-foreground">No full-hour openings for this date.</p>}</div>}
      </section>
      </> : <><section className="space-y-4" aria-labelledby="review-heading"><div><h2 id="review-heading" className="text-lg font-semibold">Review booking</h2><p className="text-sm text-muted-foreground">Check details before confirming. Use Back to edit without re-entering information.</p></div>{valid && total && data ? <><BookingInvoice heading="Booking summary" date={operatingDate} total={total} items={summary.map(s => ({ court: s.name, startsAt: new Date(s.start), endsAt: new Date(s.end), amount: money(s.cents!), durationMinutes: s.hours.length * 60, intervalMinutes: data.settings.intervalMinutes, hourlyRate: s.hourlyRate }))} /><dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Guest</dt><dd className="font-medium">{name.trim()}</dd></div><div><dt className="text-muted-foreground">Phone</dt><dd className="font-medium">{phone.trim() || "Not provided"}</dd></div><div><dt className="text-muted-foreground">Email</dt><dd className="break-all font-medium">{email.trim() || "Not provided"}</dd></div><div><dt className="text-muted-foreground">Payment</dt><dd className="font-medium">{methods.find(m => m.id === method)?.name || "Cash"}{method !== "cash" && reference.trim() ? ` · ${reference.trim()}` : ""} · Full payment confirmed</dd></div></dl></> : <p className="text-sm text-destructive">Availability or price changed. Return to slot selection and review the refreshed total.</p>}</section><div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => { setReview(false); setError(""); }}>Back to edit</Button><Button type="submit" className="hidden min-h-11 lg:inline-flex" disabled={!data || !valid || !received || busy || !!pending}>Confirm &amp; record booking</Button></div></>}</fieldset>{!review && <aside aria-label="Booking summary" className="min-w-0 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-6rem)] lg:overflow-auto"><section className="space-y-3 rounded-xl border bg-card p-4">{!valid && <h2 className="text-lg font-semibold">Booking summary</h2>}{valid && total && data ? <BookingInvoice heading="Booking summary" date={operatingDate} total={total} items={summary.map(s => ({ court: s.name, startsAt: new Date(s.start), endsAt: new Date(s.end), amount: money(s.cents!), durationMinutes: s.hours.length * 60, intervalMinutes: data.settings.intervalMinutes, hourlyRate: s.hourlyRate }))} /> : !summary.length ? <p className="text-sm text-muted-foreground">Choose available hours to see your total.</p> : <ul className="space-y-2">{summary.map(s => <li key={s.courtId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{s.name}</strong> · {formatScheduleRange(s.start, s.end, operatingDate)} · {s.hours.length} hr{s.hours.length === 1 ? "" : "s"}{!s.available ? " · Unavailable" : !s.eligible ? ` · Check opening hours and minimum ${schedule?.settings.minimumMinutes} minutes` : ""}</span><span className="font-semibold">{s.cents === null ? "Price unavailable" : `₱${money(s.cents)}`}</span></li>)}</ul>}<fieldset disabled={busy || !!pending} className="min-w-0 space-y-5">
      <section aria-labelledby="customer-heading" className="space-y-4 border-t pt-5"><div><h2 id="customer-heading" className="text-lg font-semibold">Customer information</h2><p className="text-sm text-muted-foreground">Enter contact details, then choose how payment was received.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><label className={`${field} min-w-0`}>Guest name<Input className="h-11 w-full rounded-md" placeholder="Alex Reyes" required minLength={1} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><label className={`${field} min-w-0`}>Phone (optional)<Input className="h-11 w-full rounded-md" placeholder="0917 123 4567" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} /></label><label className={`${field} min-w-0`} htmlFor="guest-email">Guest email (optional)<Input className="h-11 w-full rounded-md" placeholder="name@example.com" id="guest-email" name="guestEmail" type="email" maxLength={254} aria-describedby="guest-email-hint" value={email} onChange={e => setEmail(e.target.value)} /><span id="guest-email-hint" className="text-xs font-normal text-muted-foreground">For confirmation and booking updates.</span></label></div></section>
      <section aria-labelledby="payment-heading" className="space-y-4 border-t pt-5"><div><h2 id="payment-heading" className="text-lg font-semibold">Payment received</h2><p className="text-sm text-muted-foreground">Record full payment for the displayed booking total.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><label className={`${field} min-w-0`}>Payment method<FormSelect className="h-11 w-full" aria-label="Payment method" disabled={busy || !!pending} value={method} onValueChange={value => { if (value) { setMethod(value); setReference(""); setReceived(false); } }} options={[{ value: "cash", label: "Cash" }, ...methods.filter(m => m.id !== "cash").map(m => ({ value: m.id, label: m.name }))]} /></label>{method !== "cash" && <label className={`${field} min-w-0`}>Verified transfer ID (required)<Input className="h-11 w-full rounded-md" placeholder="Transfer ID from the receipt" required minLength={1} maxLength={200} value={reference} onChange={e => { setReference(e.target.value); setReceived(false); }} /></label>}</div><label className="flex items-start gap-3 text-sm"><input type="checkbox" required disabled={!valid} checked={received} onChange={e => setReceived(e.target.checked)} className="mt-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" /> <span>I confirm full payment of <strong className="tabular-nums">₱{total}</strong> has been received{method !== "cash" ? " and checked in the merchant account" : ""}.</span></label></section>
<Button type="submit" className="hidden min-h-11 w-full lg:inline-flex" disabled={!valid}>Review booking</Button></fieldset></section></aside>}<div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl lg:hidden"><span className="text-sm">Total <strong className="tabular-nums">{total ? `₱${total}` : "Unavailable"}</strong></span>{step === 1 ? <Button type="submit" className="min-h-11" disabled={!valid || busy || !!pending}>Review booking</Button> : <Button type="submit" form="new-booking-form" className="min-h-11" disabled={!data || !valid || !received || busy || !!pending}>Confirm booking</Button>}</div>{pending && <div className="space-y-3 lg:col-start-1"><p className="text-sm">The result is unknown. Retry the exact request safely, or check bookings before discarding it.</p><div className="flex flex-wrap items-center gap-2"><Button type="button" className="min-h-11" disabled={busy} onClick={() => void send(pending.body, pending.key)}>Retry same request</Button><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={async () => { if (await confirm("Check bookings first. Discard this retry request?", { confirmLabel: "Discard retry", destructive: true })) setPending(null); }}>Discard retry</Button></div></div>}</form></>}
  </div>;
}
