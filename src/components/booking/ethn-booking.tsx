"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { priceItems } from "@/lib/booking/core";
import { addDays, selectRange, slots, type Window, type Occupied, type Range } from "./ethn-selection";
import { formatDisplayDate } from "@/lib/display-date";

type Availability = { date: string; operatingDate: string; serverNow: string; configured: boolean; message: string | null; merchant: string | null; settings: { version: string; intervalMinutes: number; minimumMinutes: number; horizonDays: number }; courts: { id: string; name: string; windows: Window[]; occupied: Occupied[] }[] };
type Checkout = { checkoutId: string; total: string; expiresAt: string; merchant: string; acknowledgementRequired: boolean; items: { courtId: string; start: string; end: string; rate: string; minutes: number; amount: string }[] };
type Draft = { owner: string; checkout: Checkout; date: string; offset: number; reservationId?: string; uploaded?: boolean; proofFile?: string; proofKey?: string; submitHash?: string; submitKey?: string };
type Result = { booked: boolean; status: string; trackingToken?: string; code?: string; message?: string };
type Tracking = { status: string; operatingDate: string; total: string; items: { court: string; startsAt: string; endsAt: string }[]; payments: { status: string; method: string; reviewReason?: string }[] };
const STORAGE = "ethn-checkout-v1";
const formatDate = (s: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(s));
const pesos = (cents: bigint) => `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
const money = (s: string) => `₱${s}`;
const field = "grid gap-1.5 text-sm font-medium";

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "UNAVAILABLE");
  return data;
}
const friendly = (e: unknown) => {
  const code = e instanceof Error ? e.message : "";
  if (code === "SLOT_TAKEN" || code === "COURT_UNAVAILABLE" || code === "CLOSED") return "Those times are no longer available. Refresh availability and select again.";
  if (code === "CHECKOUT_UNAVAILABLE") return "This checkout is unavailable or expired. If you paid, contact the venue for help.";
  if (code === "NOT_CONFIGURED") return "Booking or payment is not configured yet. Please try again later.";
  if (code === "NOT_FOUND") return "No reservation found for that code and email.";
  if (code === "INVALID_INPUT" || code === "AMOUNT_MISMATCH") return "Check your details and try again.";
  if (code === "ALREADY_SUBMITTED") return "This checkout was already submitted. Check your tracking email or contact the venue.";
  return "Could not complete that request. If the result is uncertain, retry without changing your details.";
};
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

export default function EthnBooking() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [chosenDate, setChosenDate] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restored, setRestored] = useState(false);
  const [ack, setAck] = useState(false);
  const [now, setNow] = useState(0);
  const [clockReady, setClockReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [trackCode, setTrackCode] = useState(""); const [trackEmail, setTrackEmail] = useState(""); const [tracking, setTracking] = useState<Tracking | null>(null);
  const [trackError, setTrackError] = useState(""); const [trackBusy, setTrackBusy] = useState(false);
  const lock = useRef(false);
  const clock = useRef({ server: 0, monotonic: 0 });
  const sequence = useRef(0);
  const checkoutKeys = useRef<Record<string, string>>({});

  const save = (next: Draft) => { setDraft(next); sessionStorage.setItem(STORAGE, JSON.stringify(next)); };
  const finishCheckout = () => { sessionStorage.removeItem(STORAGE); sessionStorage.removeItem("ethn-checkout-keys-v1"); checkoutKeys.current = {}; setDraft(null); };
  const load = useCallback(async (date?: string) => {
    const seq = ++sequence.current; setLoading(true); setClockReady(false); setError("");
    try {
      const response = await fetch(`/api/ethn/availability${date ? `?date=${encodeURIComponent(date)}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("UNAVAILABLE");
      const data: Availability = await response.json();
      if (seq !== sequence.current) return;
      clock.current = { server: Date.parse(data.serverNow), monotonic: performance.now() };
      setNow(clock.current.server); setClockReady(true); setAvailability(data); setChosenDate(data.date); setRanges([]);
    } catch { if (seq === sequence.current) { setAvailability(null); setRanges([]); setError("Availability is unavailable. Please refresh and try again."); } }
    finally { if (seq === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    try { const stored = sessionStorage.getItem(STORAGE); if (stored) { const value = JSON.parse(stored) as Draft; if (value.owner && value.checkout?.checkoutId) { setDraft(value); setRestored(true); } } } catch { /* Ignore invalid session draft. */ }
    void load();
    const timer = window.setInterval(() => { if (clock.current.server) setNow(clock.current.server + performance.now() - clock.current.monotonic); }, 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const validRanges = availability && ranges.length > 0 && ranges.every(r => Date.parse(r.end) - Date.parse(r.start) >= availability.settings.minimumMinutes * 60_000 && Date.parse(r.start) >= now);
  let total = "0.00";
  try { if (ranges.length) total = pesos(priceItems(ranges.map(r => ({ rate: r.rate, minutes: (Date.parse(r.end) - Date.parse(r.start)) / 60_000 })))); } catch { total = ""; }
  const expired = draft ? now > 0 && now >= Date.parse(draft.checkout.expiresAt) : false;
  const seconds = draft && now ? Math.max(0, Math.floor((Date.parse(draft.checkout.expiresAt) - now) / 1000)) : 0;

  async function beginCheckout() {
    if (!availability || !validRanges || !total || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      let owner = sessionStorage.getItem("ethn-owner-v1");
      if (!owner) { owner = crypto.randomUUID(); sessionStorage.setItem("ethn-owner-v1", owner); }
      const payload = { date: chosenDate, ranges: ranges.map(({ courtId, start, end }) => ({ courtId, start, end })).sort((a, b) => a.courtId.localeCompare(b.courtId)), displayedTotal: total, displayedVersion: availability.settings.version };
      const fingerprint = JSON.stringify(payload);
      const storedKeys = JSON.parse(sessionStorage.getItem("ethn-checkout-keys-v1") || "{}");
      const idempotencyKey = checkoutKeys.current[fingerprint] ?? storedKeys[fingerprint] ?? crypto.randomUUID();
      checkoutKeys.current[fingerprint] = idempotencyKey;
      sessionStorage.setItem("ethn-checkout-keys-v1", JSON.stringify({ ...storedKeys, [fingerprint]: idempotencyKey }));
      const checkout = await post<Checkout>("/api/checkout", { ownerToken: owner, idempotencyKey, ...payload });
      save({ owner, checkout, date: chosenDate, offset: now - Date.now() }); setAck(false); setRestored(false);
    } catch (e) { setError(friendly(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function upload() {
    if (!draft || !file || !clockReady || expired || lock.current || (draft.checkout.acknowledgementRequired && !ack)) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP image up to 5 MiB."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) throw new Error("NOT_CONFIGURED");
      const signature = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
      const proofKey = draft.proofFile === signature && draft.proofKey ? draft.proofKey : crypto.randomUUID();
      const next = { ...draft, reservationId: draft.proofFile === signature ? draft.reservationId : undefined, proofFile: signature, proofKey, uploaded: false };
      save(next);
      const reservation = await post<{ reservationId: string; path: string; token: string }>("/api/checkout/proofs", { ownerToken: draft.owner, checkoutId: draft.checkout.checkoutId, idempotencyKey: proofKey, mimeType: file.type, byteSize: file.size, ...(draft.checkout.acknowledgementRequired ? { acknowledgedTotal: draft.checkout.total } : {}) });
      const reserved = { ...next, reservationId: reservation.reservationId }; save(reserved);
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: uploadError } = await client.storage.from("proofs").uploadToSignedUrl(reservation.path, reservation.token, file, { contentType: file.type });
      if (uploadError) throw new Error("UPLOAD_UNCERTAIN");
      save({ ...reserved, uploaded: true });
    } catch (e) { setError(e instanceof Error && e.message === "UPLOAD_UNCERTAIN" ? "Upload could not be confirmed. You may submit this proof for verification, or select a new image and upload again before expiry." : friendly(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit() {
    if (!draft?.reservationId || lock.current || (draft.checkout.acknowledgementRequired && !ack)) return;
    if (!name.trim() || !email.trim() || !phone.trim() || !reference.trim()) { setError("Enter your name, email, contact number and payment reference."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const payload = { ownerToken: draft.owner, checkoutId: draft.checkout.checkoutId, reservationId: draft.reservationId, customer: { name: name.trim(), email: email.trim(), phone: phone.trim() }, reference: reference.trim(), claimedAmount: draft.checkout.total, ...(draft.checkout.acknowledgementRequired ? { acknowledgedTotal: draft.checkout.total } : {}) };
      const hash = await digest(JSON.stringify(payload));
      const key = draft.submitHash === hash && draft.submitKey ? draft.submitKey : crypto.randomUUID();
      save({ ...draft, submitHash: hash, submitKey: key });
      const submitted = await post<Result>("/api/checkout/submit", { ...payload, idempotencyKey: key });
      setResult(submitted); finishCheckout();
    } catch (e) { setError(friendly(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function lookup(e: React.FormEvent) {
    e.preventDefault(); if (trackBusy) return; setTrackBusy(true); setTrackError(""); setTracking(null);
    try { setTracking(await post<Tracking>("/api/checkout/track", { code: trackCode.trim().toUpperCase(), email: trackEmail.trim() })); }
    catch (err) { setTrackError(friendly(err)); } finally { setTrackBusy(false); }
  }

  return <div className="min-h-screen bg-[#f6f8f8] text-[#17252e]"><header className="absolute inset-x-0 top-0 z-40 text-white"><div className="mx-auto grid min-h-[88px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 sm:px-8"><nav aria-label="Booking navigation" className="col-start-1 hidden gap-7 text-xs font-bold uppercase tracking-widest md:flex"><a href="#booking" className="hover:text-[#ffad4c]">Book</a><a href="#open-plays" className="hidden hover:text-[#ffad4c] sm:block">Open plays</a></nav><a href="/" aria-label="ETHN Courts home" className="col-start-2 flex items-center gap-2"><img src="/ethn-courts-mark.png" alt="" className="h-9 w-9 object-cover"/><span className="hidden text-sm font-extrabold tracking-[.16em] sm:inline">ETHN <span className="text-[#f28500]">COURTS</span></span></a><nav aria-label="Customer navigation" className="hidden justify-end gap-7 text-xs font-bold uppercase tracking-widest md:flex"><a href="/contact" className="hover:text-[#ffad4c]">Contact</a><a href="#track" className="hover:text-[#ffad4c]">Track booking</a></nav><details className="relative col-start-3 justify-self-end md:hidden"><summary aria-label="Open navigation menu" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center border border-white/30 text-2xl [&::-webkit-details-marker]:hidden">☰</summary><nav aria-label="Mobile navigation" className="absolute right-0 top-12 w-48 bg-[#16384d] p-2 text-xs font-bold uppercase tracking-widest shadow-xl"><a href="#booking" className="block px-4 py-3 hover:bg-white/10">Book</a><a href="#open-plays" className="block px-4 py-3 hover:bg-white/10">Open plays</a><a href="/contact" className="block px-4 py-3 hover:bg-white/10">Contact</a><a href="#track" className="block px-4 py-3 hover:bg-white/10">Track booking</a></nav></details></div></header>
    <main><section className="relative isolate min-h-[680px] overflow-hidden bg-[#16384d] px-5 py-8 text-white lg:px-8 lg:py-12"><img src="/prototype-hero.jpg" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45"/><div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(22,56,77,.98)_0%,rgba(22,56,77,.86)_40%,rgba(22,56,77,.24)_100%)]"/><div className="relative mx-auto grid min-h-[600px] max-w-7xl items-center gap-10 lg:grid-cols-[1fr_440px]"><div className="max-w-2xl"><h1 className="font-display text-[clamp(4.5rem,13vw,9rem)] leading-[.78] text-white">Make time<br/><span className="text-[#ffad4c]">to play.</span></h1><p className="mt-8 max-w-[300px] text-sm leading-6 text-white/75 md:max-w-md md:text-base">Two courts, good rallies, and a community worth showing up for. Reserve your next game in a few taps.</p><div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap"><a href="#booking" className="inline-flex min-h-12 items-center justify-center bg-[#f28500] px-5 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#d97300]">Book a court <span aria-hidden="true" className="ml-3">→</span></a><a href="#open-plays" className="inline-flex min-h-12 items-center justify-center border border-white/35 px-5 text-xs font-bold uppercase tracking-wider hover:border-[#ffad4c] hover:text-[#ffad4c]">See open plays</a></div></div><div className="relative hidden h-[500px] lg:block"><div className="absolute right-0 top-0 h-[390px] w-[350px] overflow-hidden border-8 border-[#ffad4c] bg-[#16384d]"><img src="/prototype-player.jpg" alt="Pickleball player on an outdoor court" className="h-full w-full object-cover"/></div><div className="absolute bottom-0 left-0 w-[270px] border-8 border-[#16384d] bg-[#f28500] p-5 text-[#16384d]"><p className="text-xs font-bold uppercase tracking-[.18em]">Your next game</p><p className="font-display mt-2 text-5xl leading-none">Starts here</p><a href="#booking" className="mt-3 inline-block text-xs font-bold uppercase underline">Check availability</a></div></div></div></section><div id="booking" className="mx-auto max-w-7xl space-y-8 scroll-mt-6 px-5 py-10 lg:px-8">
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground">{error}</p>}
    {result ? <section className="rounded-xl border bg-card p-6"><h2 className="text-xl font-bold">{result.booked ? "Request pending review" : "Not booked"}</h2><p className="mt-2 text-sm">{result.booked ? "Your reservation is not confirmed until staff verify your payment." : "Your payment evidence requires staff review. Your court is not booked."}</p>{result.code && <p className="mt-4">Tracking code: <strong>{result.code}</strong></p>}{result.trackingToken && <a className="mt-4 inline-block font-semibold text-primary underline" href={`/checkout/track/${result.trackingToken}`}>View reservation status</a>}<div className="mt-5"><Button variant="outline" onClick={() => { setResult(null); void load(); }}>Choose another time</Button></div></section> : draft ? <section className="space-y-6 border border-[#dce5e8] bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#dce5e8] pb-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Your checkout</p><h2 className="font-display mt-1 text-3xl font-bold text-[#16384d]">{money(draft.checkout.total)}</h2><p className="text-sm text-[#718189]">Operating date: {formatDisplayDate(draft.date)}</p></div><p className="border border-[#f2d8b4] bg-[#fff0dc] px-4 py-3 text-sm font-bold text-[#8a4a00]">{!clockReady ? "Time unavailable; refresh availability" : expired ? "Hold expired" : `Hold remaining ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</p></div>
      {restored && <p className="rounded-lg bg-muted p-3 text-sm">Checkout restored on this device. Availability and status will be checked by the server; this is not a guarantee.</p>}
      {!clockReady && <Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh server time</Button>}
      <ul className="divide-y border-y">{draft.checkout.items.map((item, i) => <li key={i} className="py-3 text-sm"><strong>Court {item.courtId}</strong> · {formatDate(item.start)} – {formatDate(item.end)} · {item.minutes} min · {money(item.rate)}/hour · <strong>{money(item.amount)}</strong></li>)}</ul>
      {draft.checkout.acknowledgementRequired && <label className="flex gap-2 rounded-lg border border-primary p-4 text-sm"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>Price or settings changed. I acknowledge the updated total of {money(draft.checkout.total)}.</span></label>}
      {expired ? <p className="rounded-lg bg-muted p-4 text-sm">This hold expired and the court is not booked. If you paid and already uploaded proof, submit it below for staff review. No new upload can be authorized.</p> : <div className="rounded-lg bg-muted p-4 text-sm"><strong>GCash recipient configured by venue</strong><p className="mt-2 whitespace-pre-wrap">{draft.checkout.merchant}</p><p className="mt-2">Pay only the official configured recipient. Confirm payment details with the venue before paying.</p></div>}
      <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Full name<Input maxLength={200} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label className={field}>Email<Input type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label><label className={field}>Contact number<Input maxLength={50} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label><label className={field}>GCash reference<Input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label></div>
      <div className="space-y-3"><label className={field}>Payment proof (JPG, PNG or WebP, up to 5 MiB)<Input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || expired || !clockReady} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy || !clockReady || expired || !file || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void upload()}>{busy ? "Please wait…" : "Upload proof"}</Button><span className="text-sm text-muted-foreground">{draft.uploaded ? "Proof uploaded." : draft.reservationId ? "Upload not confirmed; submission will check proof." : "After a reload, reattach your file if it was not uploaded."}</span></div></div>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !draft.reservationId || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void submit()}>{busy ? "Please wait…" : expired ? "Submit evidence for staff review" : "Submit for review"}</Button><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm("Leave this checkout? Its hold will expire. If you paid, keep your proof and contact the venue.")) { finishCheckout(); setError(""); void load(); } }}>Leave checkout</Button></div>
    </section> : <section className="space-y-5 border border-[#dce5e8] bg-white p-5 shadow-xl shadow-[#16384d]/[0.04] sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Your schedule</p><h2 className="font-display mt-1 text-2xl font-bold text-[#16384d]">Choose your time</h2><p className="mt-1 text-sm text-[#718189]">Select a continuous start-to-end range inside one opening window.</p></div><div className="flex flex-wrap items-end gap-3"><label className={field}>Operating date<Input type="date" value={chosenDate} min={availability?.operatingDate} max={availability ? addDays(availability.operatingDate, availability.settings.horizonDays - 1) : undefined} disabled={loading} onChange={e => { setChosenDate(e.target.value); if (e.target.value) void load(e.target.value); }} /></label><Button variant="outline" disabled={loading} onClick={() => void load(chosenDate || undefined)}>Refresh</Button></div></div>
      {loading ? <p role="status" className="py-6 text-sm text-muted-foreground">Loading availability…</p> : !availability ? <p className="py-6 text-sm">Availability is unavailable.</p> : <>{!availability.configured && <p className="rounded-lg bg-muted p-4 text-sm">{availability.message || "Booking and payment are not configured yet."}</p>}{availability.courts.length === 0 && <p className="py-6 text-sm text-muted-foreground">No courts available for this date.</p>}
      <div className="grid gap-4 md:grid-cols-2">{availability.courts.map(court => <div key={court.id} className="border border-[#dce5e8] bg-[#f7fafb] p-4 shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-[#dce5e8] pb-3"><h3 className="font-display text-lg font-bold text-[#16384d]">{court.name}</h3>{ranges.some(r => r.courtId === court.id) && <button className="text-sm text-primary underline" onClick={() => setRanges(ranges.filter(r => r.courtId !== court.id))}>Clear selection</button>}</div>{court.windows.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Closed on this operating date.</p>}{court.windows.map((window, wi) => { const grid = slots(window, court.occupied, availability.settings.intervalMinutes, now); const selected = ranges.find(r => r.courtId === court.id); return <div key={wi} className="mt-4"><p className="text-sm text-muted-foreground">{formatDate(window.opensAt)} – {formatDate(window.closesAt)} · {window.hourlyRate === null ? "Rate unavailable" : `${money(window.hourlyRate)}/hour`}</p><div className="mt-2 flex flex-wrap gap-2">{grid.map((slot, index) => { const active = selected?.window === wi && slot.start >= Date.parse(selected.start) && slot.end <= Date.parse(selected.end); return <button key={slot.start} type="button" disabled={!slot.available || window.hourlyRate === null} aria-pressed={!!active} onClick={() => { const next = selectRange(court.id, wi, window, grid, index, selected); if (next) setRanges([...ranges.filter(r => r.courtId !== court.id), next]); }} className="rounded-md border px-3 py-2 text-xs font-medium hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-35">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(slot.start))}</button>; })}</div></div>; })}</div>)}</div>
      {ranges.length > 0 && <div className="grid gap-5 border-t border-[#dce5e8] pt-5 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Your selection</p><h3 className="font-display mt-1 text-xl font-bold text-[#16384d]">Review chosen times</h3><ul className="mt-3 space-y-2">{ranges.map(r => <li key={r.courtId} className="text-sm">{availability.courts.find(c => c.id === r.courtId)?.name} · {formatDate(r.start)} – {formatDate(r.end)} · {(Date.parse(r.end) - Date.parse(r.start)) / 60_000} min · {money(r.rate)}/hour</li>)}</ul><p className="font-bold">Estimated total: {total ? money(total) : "Unavailable"}</p>{!validRanges && <p className="text-sm text-muted-foreground">Each range must be at least {availability.settings.minimumMinutes} minutes and start in the future.</p>}</div><div className="md:min-w-52"><p className="text-sm text-[#718189]">Estimated total</p><p className="font-display text-2xl font-bold text-[#16384d]">{total ? money(total) : "Unavailable"}</p><Button className="mt-3 w-full" disabled={busy || !availability.configured || !validRanges || !total} onClick={() => void beginCheckout()}>{busy ? "Starting checkout…" : "Continue to checkout"}</Button></div></div>}</>}
    </section>}
    <section id="track" className="border border-[#dce5e8] bg-white p-5 shadow-sm sm:p-7"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Booking updates</p><h2 className="font-display mt-1 text-2xl font-bold text-[#16384d]">Track a reservation</h2><p className="mt-1 text-sm text-[#718189]">Use the tracking code and email from your request.</p><form onSubmit={lookup} className="mt-4 flex flex-wrap items-end gap-3"><label className={field}>Tracking code<Input aria-label="Tracking code" required maxLength={5} value={trackCode} onChange={e => setTrackCode(e.target.value)} /></label><label className={field}>Email<Input aria-label="Email" required type="email" value={trackEmail} onChange={e => setTrackEmail(e.target.value)} /></label><Button disabled={trackBusy} type="submit">{trackBusy ? "Checking…" : "Track"}</Button></form>{trackError && <p role="alert" className="mt-3 text-sm text-destructive">{trackError}</p>}{tracking && <div role="status" className="mt-5 space-y-2 border-t pt-4 text-sm"><p>Reservation: <strong className="capitalize">{tracking.status}</strong> · {formatDisplayDate(tracking.operatingDate)} · {money(tracking.total)}</p>{tracking.status === "pending" && <p>Pending review; not yet confirmed.</p>}{tracking.items.map((item, i) => <p key={i}>{item.court}: {formatDate(item.startsAt)} – {formatDate(item.endsAt)}</p>)}{tracking.payments.map((p, i) => <p key={i}>Payment: {p.method.toUpperCase()} · {p.status}{p.reviewReason && tracking.status === "rejected" ? ` · Reason: ${p.reviewReason}` : ""}</p>)}</div>}</section>
    <section id="open-plays" className="border border-[#dce5e8] bg-white p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Play together</p><h2 className="font-display mt-1 text-3xl text-[#16384d]">Open Plays</h2><p className="mt-3 text-sm leading-6 text-[#60747d]">Discover upcoming sessions and play together.</p><a href="/open-plays" className="mt-4 inline-block text-sm font-semibold text-[#a55500] underline underline-offset-4">View open plays</a></section><section className="grid gap-5 bg-white p-6 shadow-sm md:grid-cols-2 md:p-8"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Find us</p><h2 className="font-display mt-2 text-3xl text-[#16384d]">Your neighborhood court.</h2><p className="mt-4 text-sm leading-6 text-[#687980]">Daylor Village, Abucayan, Balamban, Cebu.</p></div><div className="grid min-h-36 place-items-center bg-[#e7f0f3] text-xs font-bold uppercase tracking-widest text-[#58717e]">Balamban, Cebu</div></section><section className="border border-[#dce5e8] bg-white p-6 md:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">FAQ</p><h2 className="font-display mt-2 text-3xl text-[#16384d]">Quick answers before you play.</h2><div className="mt-6 grid gap-6 md:grid-cols-2"><div><h3 className="font-bold text-[#405966]">Do I need an account?</h3><p className="mt-2 text-sm leading-6 text-[#718189]">No. Book as a guest and track your request with your private link or tracking details.</p></div><div><h3 className="font-bold text-[#405966]">When is my booking confirmed?</h3><p className="mt-2 text-sm leading-6 text-[#718189]">Staff review your payment before confirming your reservation.</p></div></div></section></div><footer className="bg-[#16384d] px-5 py-10 text-sm text-white/70 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row"><div><div className="flex items-center gap-3"><img src="/ethn-courts-mark.png" alt="" className="h-9 w-9 object-cover"/><span className="font-bold tracking-[.12em] text-white">ETHN <span className="text-[#f28500]">COURTS</span></span></div><p className="mt-4 max-w-xs leading-6 text-white/55">Your neighborhood court for better rallies in Balamban.</p></div><div><p className="font-bold text-white">Visit</p><p className="mt-3 text-white/60">Daylor Village<br/>Abucayan, Balamban<br/>Cebu, Philippines</p></div><div><p className="font-bold text-white">Explore</p><div className="mt-3 flex gap-4"><a href="/contact" className="hover:text-white">Contact</a><a href="/terms" className="hover:text-white">Terms</a><a href="/privacy" className="hover:text-white">Privacy</a></div></div></div></footer></main></div>;
}
