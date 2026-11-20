"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Window = { opensAt: string; closesAt: string; hourlyRate: string | null };
type Court = { id: string; name: string; windows: Window[]; occupied: { startsAt: string; endsAt: string; state: string }[] };
type Availability = { settings: { intervalMinutes: number; minimumMinutes: number }; operatingDate: string; date: string; configured: boolean; merchant: string | null; courts: Court[] };
type Result = { bookingId: string; courtName: string | null; startsAt: string; endsAt: string; total: string; method: "cash" | "gcash" };

const time = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const money = (value: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
const manilaToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const toIso = (date: string, value: string) => { try { const parsed = new Date(`${date}T${value}:00+08:00`); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; } catch { return null; } };
const message = (status: number, code?: string) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : code === "SLOT_TAKEN" ? "That slot is already booked or held. Check the occupied list and pick another time." : code === "REFERENCE_TAKEN" ? "That GCash reference was already recorded." : code === "NOT_CONFIGURED" ? "GCash payment instructions are not configured. Use cash or ask the owner to set them." : code === "CLOSED" ? "The selected time is outside this court's hours." : code === "INVALID_RATE" ? "That hours row has no hourly rate, so it cannot be booked." : status === 400 ? "Check the court, date and times, then try again." : "Could not confirm whether the walk-in was saved. Check the calendar before retrying.";

export default function WalkInForm() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [date, setDate] = useState(manilaToday());
  const [courtId, setCourtId] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/ethn/availability?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (!response.ok) { setError("Schedule is unavailable. Please try again later."); setAvailability(null); return; }
      const data = (await response.json()) as Availability;
      setAvailability(data);
      setCourtId(current => data.courts.some(court => court.id === current) ? current : data.courts[0]?.id ?? "");
    } catch { setError("Schedule is unavailable. Please try again later."); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const court = availability?.courts.find(c => c.id === courtId) ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !availability || !court) return;
    const startsAt = toIso(date, start), endsAt = toIso(date, end);
    if (!startsAt || !endsAt || endsAt <= startsAt) { setError("Enter a valid start and end time; the end must be after the start."); return; }
    if (!guestName.trim()) { setError("Enter the guest name."); return; }
    if (method === "gcash" && !reference.trim()) { setError("Enter the GCash reference for this payment."); return; }
    if (!window.confirm(`Confirm prepaid walk-in?\n\n${court.name} · ${start}–${end}\nGuest: ${guestName.trim()}\nPayment: ${method === "cash" ? "cash" : `GCash ${reference.trim()}`}\n\nThe booking is confirmed immediately and payment is recorded as collected.`)) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/ethn/admin/walk-ins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courtId, date, start: startsAt, end: endsAt, guestName: guestName.trim(), guestPhone: guestPhone.trim() || null, method, reference: method === "gcash" ? reference.trim() : null }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string } & Partial<Result>;
      if (!response.ok) { setError(message(response.status, body.error)); return; }
      setResult(body as Result);
      setGuestName(""); setGuestPhone(""); setReference("");
      await load();
    } catch { setError(message(0)); } finally { setBusy(false); }
  }

  return <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
    <header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">FRONT DESK</p><h1 className="text-3xl font-semibold tracking-tight">Prepaid walk-in</h1><p className="max-w-2xl text-muted-foreground">Record a court booking paid in full at the desk. Cash or a verified GCash reference is required before the booking is confirmed. No tracking link or customer email is created.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/walk-in">Sign in</a>}</div>}
    {result && <section className="rounded-xl border bg-muted p-5 text-sm" role="status"><h2 className="text-base font-semibold">Walk-in confirmed</h2><p className="mt-1">{result.courtName ?? "Court"} · {time(result.startsAt)}–{time(result.endsAt)} · {money(result.total)} collected in {result.method === "cash" ? "cash" : "GCash"}.</p><p className="mt-1 font-mono text-xs text-muted-foreground">{result.bookingId}</p></section>}
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
      <fieldset disabled={busy || loading} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Operating date<Input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Court<select className="block w-full rounded-md border bg-background px-3 py-2 text-sm" value={courtId} onChange={e => setCourtId(e.target.value)}>{availability?.courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">Start<Input type="time" step={availability?.settings.intervalMinutes === 60 ? 3600 : 1800} value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">End<Input type="time" step={availability?.settings.intervalMinutes === 60 ? 3600 : 1800} value={end} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        {court && <p className="text-xs text-muted-foreground">Hours: {court.windows.map(w => `${time(w.opensAt)}–${time(w.closesAt)}`).join(", ") || "None"} · minimum {availability?.settings.minimumMinutes} min{court.occupied.length ? ` · occupied: ${court.occupied.map(o => `${time(o.startsAt)}–${time(o.endsAt)}`).join(", ")}` : ""}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Guest name<Input value={guestName} maxLength={100} onChange={e => setGuestName(e.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Phone <span className="font-normal text-muted-foreground">· optional</span><Input value={guestPhone} maxLength={30} onChange={e => setGuestPhone(e.target.value)} /></label>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Payment collected</legend>
          <label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="radio" name="method" checked={method === "cash"} onChange={() => setMethod("cash")} />Cash</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="method" checked={method === "gcash"} onChange={() => setMethod("gcash")} />GCash</label>
          {method === "gcash" && <div className="space-y-2"><label className="block space-y-1 text-sm font-medium">GCash reference<Input value={reference} maxLength={100} onChange={e => setReference(e.target.value)} /></label>{availability?.merchant && <p className="text-xs text-muted-foreground">Official instructions: {availability.merchant}</p>}</div>}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy || loading || !court}>{busy ? "Recording…" : "Record prepaid walk-in"}</Button><Button type="button" variant="outline" disabled={busy || loading} onClick={() => void load()}>Reload schedule</Button></div>
      </fieldset>
    </form>
  </div>;
}
