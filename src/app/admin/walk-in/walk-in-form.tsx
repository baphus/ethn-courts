"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { manilaDateStr } from "@/lib/booking/slots";
import { priceItems } from "@/lib/booking/core";

type Window = { opensAt: string; closesAt: string; hourlyRate: string | null };
type Court = { id: string; name: string; windows: Window[]; occupied: { startsAt: string; endsAt: string; state: string }[] };
type Availability = { settings: { version: string; intervalMinutes: number; minimumMinutes: number }; operatingDate: string; date: string; configured: boolean; merchant: string | null; courts: Court[] };
type Result = { bookingId: string; courtName: string | null; startsAt: string; endsAt: string; total: string; method: "cash" | "gcash" };
type Hold = { holdId: string; courtId: string; courtName: string | null; startsAt: string; endsAt: string; total: string; settingsVersion: string; merchant: string | null; expiresAt: string };

const time = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const money = (value: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
const pesoString = (cents: bigint) => `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
const key = () => crypto.randomUUID();
const manilaToday = () => manilaDateStr(new Date());
const toIso = (date: string, value: string) => { try { const parsed = new Date(`${date}T${value}:00+08:00`); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; } catch { return null; } };
const message = (status: number, code?: string) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Owner access is unavailable or has been revoked." : code === "SLOT_TAKEN" ? "That slot is already booked or held. Check the occupied list and pick another time." : code === "REFERENCE_TAKEN" ? "That GCash reference was already recorded." : code === "NOT_CONFIGURED" ? "GCash payment instructions are not configured. Use cash or ask the owner to set them." : code === "CLOSED" ? "The selected time is outside this court's hours." : code === "INVALID_RATE" ? "That hours row has no hourly rate, so it cannot be booked." : status === 400 ? "Check the court, date and times, then try again." : "Could not confirm whether the walk-in was saved. Check the calendar before retrying.";

export default function WalkInForm() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [date, setDate] = useState(manilaToday());
  const [courtId, setCourtId] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [endDate,setEndDate]=useState(manilaToday());
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  async function recoverHold(){setBusy(true);setError('');try{const r=await fetch('/api/ethn/admin/walk-ins',{cache:'no-store'});if(!r.ok)throw new Error();const recovered=await r.json();if(!recovered){setError('No live hold belongs to this account. Check booking history before collecting payment again.');return;}setHold(recovered);setCourtId(recovered.courtId);setDate(recovered.operatingDate);setStart(time(recovered.startsAt));setEndDate(manilaDateStr(new Date(recovered.endsAt)));setEnd(time(recovered.endsAt));setGuestName(recovered.guestName||'');setGuestPhone(recovered.guestPhone||'');setReceived(false);setCollected('');}catch{setError('Could not recover held booking. Check calendar before collecting payment.');}finally{setBusy(false);}}
  const [collected, setCollected] = useState("");
  const [received, setReceived] = useState(false);
  const [pending, setPending] = useState<{ payload: Record<string, unknown>; idempotencyKey: string } | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/ethn/availability?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      if (!response.ok) { setError("Schedule is unavailable. Please try again later."); setAvailability(null); return; }
      const data = (await response.json()) as Availability;
      setAvailability(data); setPriceChanged(false); setReceived(false); setCollected("");
      setCourtId(current => data.courts.some(court => court.id === current) ? current : data.courts[0]?.id ?? "");
    } catch { setError("Schedule is unavailable. Please try again later."); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const court = availability?.courts.find(c => c.id === courtId) ?? null;
  let displayedTotal = "";
  try {
    const from = toIso(date, start), to = toIso(endDate, end);
    const win = court?.windows.find(w => from && to && new Date(from) >= new Date(w.opensAt) && new Date(to) <= new Date(w.closesAt));
    if (from && to && win?.hourlyRate && new Date(to) > new Date(from)) displayedTotal = pesoString(priceItems([{ rate: win.hourlyRate, minutes: (new Date(to).getTime() - new Date(from).getTime()) / 60000 }]));
  } catch { /* invalid schedule or duration */ }

  async function send(payload: Record<string, unknown>, idempotencyKey: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ethn/admin/walk-ins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", ...payload, idempotencyKey }) });
      if (response.status >= 500) throw new Error("Uncertain server outcome");
      const body = (await response.json()) as { error?: string } & Partial<Result>;
      if (response.ok && (typeof body.bookingId !== "string" || typeof body.total !== "string")) throw new Error("Uncertain response");
      if (!response.ok) {
        if (response.status === 409 && body.error === "PRICE_CHANGED") { setPriceChanged(true); setReceived(false); setCollected(""); setPending(null); setError("Price changed. Reload this page, recover the hold, and review the total before confirming payment again."); }
        else { setPending(null); setError(message(response.status, body.error)); }
        return;
      }
      setPending(null); setHold(null); setResult(body as Result); setGuestName(""); setGuestPhone(""); setReference(""); setReceived(false); setCollected(""); await load();
    } catch { setPending({ payload, idempotencyKey }); setError("Result unknown. Editing disabled; retry same request or discard with care."); }
    finally { setBusy(false); }
  }

  async function reserve(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pending || !availability || !court) return;
    const startsAt = toIso(date, start), endsAt = toIso(endDate, end);
    if (!startsAt || !endsAt || endsAt <= startsAt || !guestName.trim()) { setError("Enter valid court time and guest name."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ethn/admin/walk-ins", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"reserve",courtId,date,start:startsAt,end:endsAt,guestName:guestName.trim(),guestPhone:guestPhone.trim()||null}) });
      const body = await response.json() as Hold & {error?:string};
      if (!response.ok) { setError(message(response.status,body.error)); return; }
      setHold(body); setCollected(""); setReceived(false);
    } catch { setError("Could not reserve slot. Check schedule and retry."); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || pending || priceChanged || !availability || !court || !hold) return;
    const startsAt = toIso(date, start), endsAt = toIso(endDate, end);
    if (!startsAt || !endsAt || endsAt <= startsAt) { setError("Enter a valid start and end time; the end must be after the start."); return; }
    if (!guestName.trim()) { setError("Enter the guest name."); return; }
    if (!displayedTotal || !availability.settings.version) { setError("Reserved price unavailable. Check hold and schedule."); return; }
    if (!received || collected !== hold.total) { setError("Confirm payment received and enter exact reserved total."); return; }
    if (method === "gcash" && !reference.trim()) { setError("Enter verified GCash reference."); return; }
    if (!window.confirm(`Confirm full payment received?\n\n${court.name} · ${start}–${end}\nReserved total: ₱${hold.total}\nPayment: ${method === "cash" ? "cash" : `verified GCash ${reference.trim()}`}`)) return;
    if (!hold || hold.expiresAt <= new Date().toISOString()) { setError("Hold expired. Reserve slot again before accepting payment."); setHold(null); return; }
    const idempotencyKey = key();
    const payload = { holdId: hold.holdId, courtId, date, start: startsAt, end: endsAt, guestName: guestName.trim(), guestPhone: guestPhone.trim() || null, method, reference: method === "gcash" ? reference.trim() : null, displayedTotal: hold.total, collectedAmount: collected, settingsVersion: hold.settingsVersion, paymentReceived: true };
    setPriceChanged(false); setResult(null); setPending({ payload, idempotencyKey });
    await send(payload, idempotencyKey);
  }

  return <div className="mx-auto w-full max-w-3xl space-y-6 pb-12">
    <header className="space-y-2 border-l-4 border-[#f28500] pl-5"><h1 className="font-display text-5xl tracking-wide text-[#447244]">Prepaid walk-in</h1><p className="max-w-2xl text-muted-foreground">Record a court booking paid in full at the desk. Cash or a verified GCash reference is required before the booking is confirmed. No tracking link or customer email is created.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/walk-in">Sign in</a>}</div>}
    {result && <section className="border border-[#dce5e8] bg-white p-5 text-sm shadow-sm" role="status"><h2 className="text-base font-semibold">Walk-in confirmed</h2><p className="mt-1">{result.courtName ?? "Court"} · {time(result.startsAt)}–{time(result.endsAt)} · {money(result.total)} collected in {result.method === "cash" ? "cash" : "GCash"}.</p><p className="mt-1 font-mono text-xs text-muted-foreground">{result.bookingId}</p></section>}
    {!hold&&<Button variant="outline" disabled={busy} onClick={()=>void recoverHold()}>Recover this account’s latest live hold</Button>}
    <form onSubmit={hold ? submit : reserve} className="space-y-4 border border-[#dce5e8] bg-card p-5 text-foreground shadow-sm">
      <fieldset disabled={busy || loading || !!pending} className="space-y-4">
        <fieldset disabled={!!hold} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Operating date<Input type="date" value={date} onChange={e => {setDate(e.target.value);setEndDate(e.target.value);}} /></label>
          <label className="space-y-1 text-sm font-medium">Court<select className="block w-full rounded-md border bg-background px-3 py-2 text-sm" value={courtId} onChange={e => setCourtId(e.target.value)}>{availability?.courts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="space-y-1 text-sm font-medium">Start<Input type="time" step={availability?.settings.intervalMinutes === 60 ? 3600 : 1800} value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">End date<Input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
          <label className="space-y-1 text-sm font-medium">End<Input type="time" step={availability?.settings.intervalMinutes === 60 ? 3600 : 1800} value={end} onChange={e => setEnd(e.target.value)} /></label>
        </fieldset>
        {court && <p className="text-xs text-muted-foreground">Hours: {court.windows.map(w => `${time(w.opensAt)}–${time(w.closesAt)}`).join(", ") || "None"} · minimum {availability?.settings.minimumMinutes} min{court.occupied.length ? ` · occupied: ${court.occupied.map(o => `${time(o.startsAt)}–${time(o.endsAt)}`).join(", ")}` : ""}</p>}
        <fieldset disabled={!!hold} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Guest name<Input value={guestName} maxLength={100} onChange={e => setGuestName(e.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Phone <span className="font-normal text-muted-foreground">· optional</span><Input value={guestPhone} maxLength={30} onChange={e => setGuestPhone(e.target.value)} /></label>
        </fieldset>
        <div className="rounded-lg border bg-muted/40 p-3 text-sm"><p className="font-medium">{hold ? "Reserved total" : "Estimated total"}: {hold ? money(hold.total) : displayedTotal ? money(displayedTotal) : "Unavailable"}</p>{hold && <p className="text-xs text-muted-foreground">Expires {new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(hold.expiresAt))}</p>}{hold && <><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)} /> I received full payment / verified GCash payment</label><label className="mt-2 block space-y-1 font-medium">Amount received<Input inputMode="decimal" value={collected} onChange={e => setCollected(e.target.value)} placeholder="0.00" /></label></>}</div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Payment method</legend>
          <label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="radio" name="method" checked={method === "cash"} onChange={() => setMethod("cash")} />Cash</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="method" checked={method === "gcash"} onChange={() => setMethod("gcash")} />GCash</label>
          {method === "gcash" && <div className="space-y-2"><label className="block space-y-1 text-sm font-medium">GCash reference<Input value={reference} maxLength={100} onChange={e => setReference(e.target.value)} /></label>{hold?.merchant && <p className="text-xs text-muted-foreground">Reserved payment instructions: {hold.merchant}</p>}</div>}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy || loading || !court}>{busy ? "Saving…" : hold ? "Confirm full payment and booking" : "Reserve slot"}</Button>{hold && <Button type="button" variant="outline" disabled={busy} onClick={() => { setHold(null); setReceived(false); setCollected(""); }}>Discard hold (slot expires automatically)</Button>}</div>
      </fieldset>
      {pending && <div role="alert" className="mt-3 space-y-2 rounded-lg border border-warning/40 p-3 text-sm"><p>Save result unknown. Retry sends identical details and key; do not change Owner account.</p><div className="flex gap-2"><Button type="button" disabled={busy} onClick={() => void send(pending.payload, pending.idempotencyKey)}>Retry same request</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm("Discard retry details? Booking may already exist; check calendar before creating another.")) setPending(null); }}>Discard retry</Button></div></div>}
    </form>
  </div>;
}
