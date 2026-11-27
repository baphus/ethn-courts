"use client";
import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
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
import { cellWindow, hourLabel, money, rows, summarize, toggleHour, type Availability, type Selection } from "./selection";

type Method = { id: string; name: string };
export default function NewBooking() {
  const confirm = useConfirm();
  const [date, setDate] = useState("");
  const [selection, setSelection] = useState<Selection>({});
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [method, setMethod] = useState("cash"); const [reference, setReference] = useState(""); const [receivedAt, setReceivedAt] = useState(""); const [received, setReceived] = useState(false);
  const [schedule, setData] = useState<Availability | null>(null);
  const data = schedule && (!date || schedule.date === date) ? schedule : null; const [methods, setMethods] = useState<Method[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState({ message: "", announce: true }); const [result, setResult] = useState("");
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
          setReceived(false); setError("This transfer ID is already recorded. Check the receiving account before saving.", true);
        } else if (r.status === 409) {
          monthCache.current?.clear();
          setReceived(false); setReview(true); setRevision(n => n + 1);
          setError("Booking conflict. Review the refreshed selection, total and payment details before saving.", false);
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
      setPending(null); setSelection({}); setEmail(""); setReview(false); setResult(`Booking confirmed: ${value.bookingId} · ${value.status} · ₱${value.total} · ${value.method}`); setReceived(false); setRevision(n => n + 1);
      toast.success("Internal booking confirmed.");
    } catch {
      setPending({ body, key }); setError("Result unknown. Retry the same request or check bookings before discarding it.", false);
      toast.warning("Booking creation not confirmed.", { description: "Check bookings or retry the same request." });
    }
    finally { setBusy(false); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !valid || review || !name.trim() || !received) { setError("Review valid court hours and confirm full payment."); return; }
    const time = receivedAt ? new Date(`${receivedAt}:00+08:00`) : null;
    if (time && (!Number.isFinite(time.getTime()) || time.getTime() > Date.now())) { setError("Payment time must be valid and not in the future."); return; }
    if (!await confirm(`Confirm ${summary.length} court range(s) for ₱${total}? Full payment must already be received${method !== "cash" ? " and checked in the merchant account" : ""}.`, { title: "Confirm internal booking", confirmLabel: "Confirm booking" })) return;
    const body = { date: operatingDate, ranges: summary.map(s => ({ courtId: s.courtId, start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })), guestName: name.trim(), guestPhone: phone.trim() || null, guestEmail: email.trim() || null, method, reference: method === "cash" ? null : reference.trim(), receivedAt: time?.toISOString() || null, displayedTotal: total, settingsVersion: data.settings.version, paymentReceived: true };
    const key = crypto.randomUUID(); setPending({ body, key }); void send(body, key);
  }
  const field = "grid gap-1 text-sm font-medium";
  return <div className="w-full space-y-5 pb-24">
    <Link className="text-sm text-primary underline" href="/admin/bookings">← Back to bookings</Link>
    <header><h1 className="text-2xl font-semibold tracking-tight">New booking</h1><p className="mt-2 text-sm text-muted-foreground">Choose available hours, then record full payment. Selection does not reserve a court.</p></header>
    {notice.message && <p role={notice.announce ? "alert" : undefined} className="rounded-lg border border-destructive/40 p-3 text-sm">{notice.message}</p>}{result && <p className="rounded-lg border p-3">{result}</p>}
    <form onSubmit={submit} className="space-y-6 rounded-xl border bg-card p-4 sm:p-6"><fieldset disabled={busy || !!pending} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><label className={field}>Booking date<DateField disabled={busy || !!pending} required value={operatingDate} onValueChange={async value => { const next = value; if (Object.keys(selection).length && !await confirm("Changing the date clears selected hours. Continue?", { confirmLabel: "Change date" })) return; setSelection({}); setReview(false); setDate(next); }} /></label><Button type="button" variant="outline" onClick={() => { setSelection({}); setReview(false); }}>Clear selection</Button></div>
      <section aria-labelledby="hours-heading" className="space-y-3"><div><h2 id="hours-heading" className="text-lg font-semibold">Select court hours</h2><p className="text-sm text-muted-foreground">Tap adjacent hours to extend a range. Remove from either end. Scroll sideways to see more courts.</p></div>
        {!data ? <LoadingRows label="Loading schedule" rows={6} /> : <div className="max-h-[32rem] overflow-auto rounded-lg border"><table className="w-full border-separate border-spacing-0 text-sm"><thead className="sticky top-0 z-20 bg-muted"><tr><th scope="col" className="sticky left-0 z-30 min-w-28 border-b border-r bg-muted p-3 text-left">Time</th>{data.courts.map(c => <th key={c.id} scope="col" className="min-w-36 border-b border-r bg-muted p-3 text-left">{c.name}</th>)}</tr></thead><tbody>{timeRows.map(t => <tr key={t}><th scope="row" className="sticky left-0 z-10 border-b border-r bg-card p-3 text-left font-medium">{hourLabel(t, operatingDate)}</th>{data.courts.map(c => { const selected = !!selection[c.id]?.includes(t); const available = !!cellWindow(c, t, now, data.settings.intervalMinutes); return <td key={c.id} className="border-b border-r p-1"><button type="button" disabled={!available && !selected} aria-pressed={selected} aria-label={`${c.name}, ${hourLabel(t, operatingDate)}: ${selected ? available ? "selected" : "selected, unavailable" : available ? "available" : "unavailable"}`} onClick={() => { const next = toggleHour(selection, c.id, t); setSelection(next.selection); setError(next.error); }} className={`min-h-11 w-full rounded-md px-2 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? available ? "bg-primary text-primary-foreground" : "border-2 border-destructive bg-destructive/10 text-destructive" : available ? "bg-muted hover:bg-primary/15" : "text-muted-foreground opacity-60"}`}>{selected ? available ? "Selected ✓" : "Unavailable ×" : available ? "Available +" : "Unavailable"}</button></td>; })}</tr>)}</tbody></table>{!timeRows.length && <p className="p-4 text-sm text-muted-foreground">No full-hour openings for this date.</p>}</div>}
      </section>
      <section className="space-y-3 rounded-lg border bg-muted/30 p-4" aria-labelledby="summary-heading"><h2 id="summary-heading" className="sr-only">Booking summary</h2>{valid && total && data ? <BookingInvoice heading="Booking summary" date={operatingDate} total={total} items={summary.map(s => ({ court: s.name, startsAt: new Date(s.start), endsAt: new Date(s.end), amount: money(s.cents!), durationMinutes: s.hours.length * 60, intervalMinutes: data.settings.intervalMinutes, hourlyRate: s.hourlyRate }))} /> : !summary.length ? <p className="text-sm text-muted-foreground">No hours selected.</p> : <ul className="space-y-2">{summary.map(s => <li key={s.courtId} className="flex flex-wrap justify-between gap-x-4 text-sm"><span><strong>{s.name}</strong> · {formatScheduleRange(s.start, s.end, operatingDate)} · {s.hours.length} hr{ s.hours.length === 1 ? "" : "s"}{!s.available ? " · Unavailable; remove or adjust" : !s.eligible ? ` · Check opening hours and minimum ${data?.settings.minimumMinutes} minutes` : ""}</span><strong>{s.cents === null ? "Price unavailable" : `₱${money(s.cents)}`}</strong></li>)}</ul>}{review && <div className="space-y-2"><p className="text-sm">Review all selected hours and the updated total. Unavailable hours must be removed before continuing.</p><Button type="button" variant="outline" disabled={!valid} onClick={() => { setReview(false); setError(""); }}>I have reviewed the selection</Button></div>}</section>
      <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Guest name<Input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><label className={field}>Phone (optional)<Input maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} /></label><label className={field} htmlFor="guest-email">Guest email (optional)<Input id="guest-email" name="guestEmail" type="email" maxLength={254} aria-describedby="guest-email-hint" value={email} onChange={e => setEmail(e.target.value)} /><span id="guest-email-hint" className="text-xs font-normal text-muted-foreground">For confirmation and booking updates.</span></label><label className={field}>Payment method<FormSelect aria-label="Payment method" disabled={busy || !!pending} value={method} onValueChange={value => { if (value) setMethod(value); }} options={[{ value: "cash", label: "Cash" }, ...methods.filter(m => m.id !== "cash").map(m => ({ value: m.id, label: m.name }))]} /></label>{method !== "cash" && <label className={field}>Verified transfer ID (required)<Input required maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label>}<label className={field}>Payment time<DateField disabled={busy || !!pending} aria-label="Payment date" dateTime value={receivedAt} onValueChange={value => setReceivedAt(value)} /></label></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)} className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring mt-1" /> <span>I confirm full payment has been received{method !== "cash" ? " and checked in the merchant account" : ""}.</span></label>
      <Button type="submit" disabled={!data || !valid || review}>Save booking</Button>
    </fieldset>{pending && <div className="space-y-3"><p className="text-sm">The result is unknown. Retry the exact request safely, or check bookings before discarding it.</p><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void send(pending.body, pending.key)}>Retry same request</Button><Button type="button" variant="outline" disabled={busy} onClick={async () => { if (await confirm("Check bookings first. Discard this retry request?", { confirmLabel: "Discard retry", destructive: true })) setPending(null); }}>Discard retry</Button></div></div>}</form>
  </div>;
}
