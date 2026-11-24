"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";
import HowItWorks from "@/components/landing/how-it-works";
import Faq from "@/components/landing/faq";
import RallyCourt from "./rally-court";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { checkoutFailure, holdExpiry } from "./checkout-feedback";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Image as ImageIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { priceItems } from "@/lib/booking/core";
import { manilaDateStr } from "@/lib/booking/slots";
import { acceptedDate, addDays, bookingDate, gridTimes, handoffRanges, selectRange, slotDate, slotEndDate, slots, validDate, type Window, type Occupied, type Range } from "./ethn-selection";
import { formatDisplayDate } from "@/lib/display-date";
import { VENUE_MAP_EMBED } from "@/lib/venue";

type Availability = { date: string; operatingDate: string; serverNow: string; configured: boolean; message: string | null; merchant: string | null; settings: { version: string; intervalMinutes: number; minimumMinutes: number; horizonDays: number }; courts: { id: string; name: string; description?: string | null; photoVersion?: string; windows: Window[]; occupied: Occupied[] }[] };
type Checkout = { checkoutId: string; total: string; expiresAt: string; paymentMethods?: {id:string; name:string; instructions:string; qrAvailable:boolean; version:string}[]; acknowledgementRequired: boolean; items: { courtId: string; start: string; end: string; rate: string; minutes: number; amount: string }[] };
type Draft = { owner: string; checkout: Checkout; date: string; offset: number; reservationId?: string; uploaded?: boolean; proofFile?: string; proofKey?: string; submitHash?: string; submitKey?: string };
type Result = { booked: boolean; status: string; trackingToken?: string; code?: string; message?: string };
type Tracking = { status: string; operatingDate: string; total: string; items: { court: string; startsAt: string; endsAt: string }[]; payments: { status: string; method: string; reviewReason?: string }[] };
const STORAGE = "ethn-checkout-v1";
const formatDate = (s: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(s));
const formatTime = (time: number) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(time));
const pesos = (cents: bigint) => `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
const money = (s: string) => `₱${s}`;
const field = "grid gap-1.5 text-sm font-medium";
const statusStyles = {
  Available: "bg-[#dcf4e6] text-[#145c39] border-[#a7d9bb]",
  Selected: "bg-[#447244] text-white border-[#447244]",
  Unavailable: "bg-[#fde5e3] text-[#922f29] border-[#efbbb6]",
  Closed: "bg-[#eee7f8] text-[#603786] border-[#d6c3e8]",
  "Rate unavailable": "bg-[#fff0d5] text-[#805000] border-[#efcf93]",
} as const;

/* ──────────────────────────────────────────────────────────────
   IMAGE SLOTS — paste your image paths here (e.g. "/hero-court.jpg").
   Leave the hero empty for the animated court.
   ────────────────────────────────────────────────────────────── */
const IMAGES = {
  hero: "", // Set an image path to replace the animated court.
  book: "/stock/book.jpg",       // "Book a court" card
  openPlays: "/stock/openPlays.jpg",  // "Open plays" card
  track: "/stock/track.jpg",      // "Track a booking" card
  visit: "/stock/visit.jpg",      // "Visit us" card
};

function Photo({ src, label, className = "" }: { src: string; label: string; className?: string }) {
  if (src) return <img src={src} alt="" className={`object-cover ${className}`} />;
  return (
    <div role="img" aria-label={`${label} placeholder`} className={`grid place-items-center bg-[repeating-linear-gradient(135deg,#447244_0_12px,#447244_12px_24px)] p-4 text-center text-[11px] font-bold uppercase tracking-widest text-white/55 ${className}`}>
      <span>{label}<br />placeholder</span>
    </div>
  );
}

function Ball({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="7" r="1" fill="currentColor" /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="16.5" cy="11" r="1" fill="currentColor" />
      <circle cx="9.5" cy="16" r="1" fill="currentColor" /><circle cx="14.5" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function BallSticker() {
  const dots = [[50, 24], [33, 33], [67, 33], [24, 50], [50, 50], [76, 50], [33, 67], [67, 67], [50, 76]];
  return (
    <svg viewBox="0 0 100 100" className="block h-auto w-full drop-shadow-[0_6px_0_rgba(0,0,0,.2)]">
      <circle cx="50" cy="50" r="47" fill="#fff" />
      <circle cx="50" cy="50" r="39" fill="#ffad4c" />
      <g fill="#447244" opacity=".8">{dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" />)}</g>
      <path d="M22 38a30 30 0 0 1 16-17" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

function PaddleSticker() {
  const holes: [number, number][] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) holes.push([30 + c * 14, 32 + r * 13]);
  return (
    <svg viewBox="0 0 100 172" className="block h-auto w-full drop-shadow-[0_6px_0_rgba(0,0,0,.2)]">
      <g fill="#fff" stroke="#fff" strokeWidth="12" strokeLinejoin="round"><rect x="10" y="8" width="80" height="108" rx="38" /><rect x="40" y="108" width="20" height="56" rx="8" /></g>
      <rect x="40" y="108" width="20" height="56" rx="8" fill="#447244" />
      <g stroke="#ffad4c" strokeWidth="3" strokeLinecap="round"><path d="M44 124h12M44 134h12M44 144h12M44 154h12" /></g>
      <rect x="10" y="8" width="80" height="108" rx="38" fill="#f28500" />
      <rect x="20" y="18" width="60" height="88" rx="28" fill="#ffad4c" />
      <g fill="#f28500">{holes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />)}</g>
    </svg>
  );
}

/* Floating sticker. `speed` = extra px it rises per px of page scroll. */
function Sticker({ kind, className, speed, rot, delay = 0 }: { kind: "ball" | "paddle"; className: string; speed: number; rot: number; delay?: number }) {
  return (
    <span aria-hidden="true" className={`ethn-sticker pointer-events-none absolute z-10 ${className}`} style={{ transform: `translate3d(0, calc(var(--sy, 0) * -${speed}px), 0)` }}>
      <span className="ethn-float block" style={{ "--r": `${rot}deg`, animationDelay: `${delay}s` } as React.CSSProperties}>
        {kind === "ball" ? <BallSticker /> : <PaddleSticker />}
      </span>
    </span>
  );
}

function Guides() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 mx-auto grid max-w-7xl grid-cols-4 [&>*:last-child]:border-r">
      <span className="border-l border-dashed border-white/10" /><span className="border-l border-dashed border-white/10" /><span className="border-l border-dashed border-white/10" /><span className="border-l border-dashed border-white/10" />
    </div>
  );
}

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
  if (code === "PROOF_METADATA_MISMATCH") return "The uploaded proof does not match the selected file. Check the file before submitting again.";
  if (code === "ACKNOWLEDGEMENT_REQUIRED") return "Review and acknowledge the current total before continuing.";
  if (code === "STORAGE_UNAVAILABLE") return "Payment proof storage is unavailable. Please try again later.";
  if (code === "INVALID_ORIGIN") return "Reload checkout from the booking page and try again.";
  if (code === "IDEMPOTENCY_MISMATCH") return "This request conflicts with an earlier attempt. Check the current checkout before trying again.";
  if (code === "ALREADY_SUBMITTED") return "This checkout was already submitted. Check your tracking email or contact the venue.";
  return "Could not complete that request. If the result is uncertain, retry without changing your details.";
};
async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

export default function EthnBooking({ bookingPage = false }: { bookingPage?: boolean }) {
  const [review, setReview] = useState(false);
  const [previewCourt, setPreviewCourt] = useState("");
  const previewDialog = useRef<HTMLDialogElement>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [chosenDate, setChosenDate] = useState("");
  const [dateStatus, setDateStatus] = useState("");
  const dateId = useId();
  const [dateFallback, setDateFallback] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);
  function openDatePicker() {
    try {
      if (dateInput.current?.type === "date" && dateInput.current.showPicker) { dateInput.current.showPicker(); return; }
    } catch { /* Show editable date field when native picker cannot open. */ }
    setDateFallback(true);
    requestAnimationFrame(() => dateInput.current?.focus());
  }
  const [ranges, setRanges] = useState<Range[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restored, setRestored] = useState(false);
  const [ack, setAck] = useState(false);
  const [now, setNow] = useState(0);
  const [clockReady, setClockReady] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", toasted: false });
  const setError = useCallback((message: string) => setFeedback({ message, toasted: false }), []);
  const observedHold = useRef<ReturnType<typeof holdExpiry>["observation"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [methods, setMethods] = useState<{id:string; name:string; instructions:string; qrAvailable:boolean; version:string}[] | null>(null);
  const [methodId, setMethodId] = useState("");
  const checkoutMethods = draft ? draft.checkout.paymentMethods ?? [] : methods;
  useEffect(() => { if (!bookingPage) return; const controller = new AbortController(); fetch("/api/ethn/payment-methods", { cache: "no-store", signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setMethods(data.methods)).catch(() => { if (!controller.signal.aborted) setMethods([]); }); return () => controller.abort(); }, [bookingPage]);
  const [result, setResult] = useState<Result | null>(null);
  const [trackCode, setTrackCode] = useState(""); const [trackEmail, setTrackEmail] = useState(""); const [tracking, setTracking] = useState<Tracking | null>(null);
  const [trackError, setTrackError] = useState(""); const [trackBusy, setTrackBusy] = useState(false);
  const lock = useRef(false);
  const heroRef = useRef<HTMLElement>(null);
  const clock = useRef({ server: 0, monotonic: 0 });
  const sequence = useRef(0);
  const checkoutKeys = useRef<Record<string, string>>({});

  const save = (next: Draft) => { setDraft(next); sessionStorage.setItem(STORAGE, JSON.stringify(next)); };
  const finishCheckout = () => { sessionStorage.removeItem(STORAGE); sessionStorage.removeItem("ethn-checkout-keys-v1"); checkoutKeys.current = {}; setDraft(null); setReview(false); };
  const load = useCallback(async (date?: string, fallback = false, handoff?: { raw: string; date: string | null }) => {
    const seq = ++sequence.current; setLoading(true); setClockReady(false); setError("");
    try {
      let response = await fetch(`/api/ethn/availability${date ? `?date=${encodeURIComponent(date)}` : ""}`, { cache: "no-store" });
      const fellBack = response.status === 400 && fallback;
      if (fellBack) response = await fetch("/api/ethn/availability", { cache: "no-store" });
      if (!response.ok) throw new Error("UNAVAILABLE");
      const data: Availability = await response.json();
      if (seq !== sequence.current) return;
      clock.current = { server: Date.parse(data.serverNow), monotonic: performance.now() };
      const selected = handoff ? handoffRanges(handoff.raw, handoff.date, data, clock.current.server) : [];
      const accepted = acceptedDate(date, data.date, fellBack);
      setNow(clock.current.server); setClockReady(true); setAvailability(data); setChosenDate(accepted); setRanges(accepted ? selected || [] : []);
      if (accepted) setDateStatus(`Availability updated for ${bookingDate(accepted)}.`);
      if (fellBack) setError("That date is unavailable. Choose another date.");
      if (handoff && !selected) setError("Your selected times are no longer available or could not be verified. Please select your times again.");
    } catch { if (seq === sequence.current) { setAvailability(null); setRanges([]); setError("Availability is unavailable. Please refresh and try again."); } }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [setError]);
  useEffect(() => {
    let hasDraft = false;
    try { const stored = bookingPage ? sessionStorage.getItem(STORAGE) : null; if (stored) { const value = JSON.parse(stored) as Draft; if (value.owner && value.checkout?.checkoutId) { setDraft(value); setRestored(true); hasDraft = true; } } } catch { /* Ignore invalid session draft. */ }
    const params = new URLSearchParams(window.location.search);
    const date = params.getAll("date").length === 1 ? params.get("date") : null;
    const raw = bookingPage && !hasDraft && params.has("ranges") ? params.getAll("ranges").length === 1 ? params.get("ranges")! : "" : null;
    const defaultDate = bookingPage ? undefined : manilaDateStr(new Date());
    if (defaultDate && !validDate(date)) setChosenDate(defaultDate);
    void load(validDate(date) ? date : defaultDate, true, raw !== null ? { raw, date: params.getAll("date").length === 1 ? date : null } : undefined);
    const timer = window.setInterval(() => { if (clock.current.server) setNow(clock.current.server + performance.now() - clock.current.monotonic); }, 1000);
    return () => window.clearInterval(timer);
  }, [load, bookingPage]);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!reduce) heroRef.current?.style.setProperty("--sy", String(Math.min(window.scrollY, 1400))); }); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  function changeDate(date: string) {
    if (date === chosenDate) return;
    setRanges([]); setChosenDate(date); setError("");
    setDateStatus("Date changed. Choose your times again.");
    if (date) void load(date);
    else { sequence.current++; setLoading(false); }
  }

  const minDate = availability?.operatingDate;
  const maxDate = availability ? addDays(availability.operatingDate, availability.settings.horizonDays - 1) : undefined;
  const previousDate = validDate(chosenDate) ? addDays(chosenDate, -1) : "";
  const nextDate = validDate(chosenDate) ? addDays(chosenDate, 1) : "";

  const validRanges = availability && ranges.length > 0 && ranges.every(r => Date.parse(r.end) - Date.parse(r.start) >= availability.settings.minimumMinutes * 60_000 && Date.parse(r.start) >= now);
  let total = "0.00";
  try { if (ranges.length) total = pesos(priceItems(ranges.map(r => ({ rate: r.rate, minutes: (Date.parse(r.end) - Date.parse(r.start)) / 60_000 })))); } catch { total = ""; }
  const expired = draft ? now > 0 && now >= Date.parse(draft.checkout.expiresAt) : false;
  const seconds = draft && now ? Math.max(0, Math.floor((Date.parse(draft.checkout.expiresAt) - now) / 1000)) : 0;
  const holdId = result ? undefined : draft?.checkout.checkoutId;
  useEffect(() => {
    if (!holdId) { observedHold.current = null; return; }
    if (!clockReady) return;
    const { observation, warn } = holdExpiry(observedHold.current, holdId, expired);
    observedHold.current = observation;
    if (warn) toast.warning("Your checkout hold expired.");
  }, [clockReady, expired, holdId]);

  function reportFailure(action: string, e: unknown, guidance = friendly(e)) {
    const outcome = checkoutFailure(e);
    if (outcome === "field") { setError(guidance); return; }
    setFeedback({ message: guidance, toasted: true });
    if (outcome === "already-submitted") toast.info("This checkout was already submitted.");
    else if (outcome === "rejected") toast.error(`${action} was not accepted. See details below.`);
    else toast.warning(`Could not confirm ${action.toLowerCase()}. See details below.`);
  }

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
      setAck(false); setRestored(false);
      try { save({ owner, checkout, date: chosenDate, offset: now - Date.now() }); }
      catch { setFeedback({ message: "This checkout could not be saved in your browser. Keep this page open.", toasted: true }); }
      const serverNow = clock.current.server + performance.now() - clock.current.monotonic;
      setNow(serverNow);
      if (Date.parse(checkout.expiresAt) <= serverNow) {
        toast.warning("This checkout hold has already expired.");
      } else {
        toast.success("Your selected times are temporarily held.");
      }
    } catch (e) { reportFailure("Slot hold", e); }
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
      const uploaded = await client.storage.from("proofs").uploadToSignedUrl(reservation.path, reservation.token, file, { contentType: file.type }).catch(() => null);
      if (!uploaded || uploaded.error) throw new Error("UPLOAD_UNCERTAIN");
      try { save({ ...reserved, uploaded: true }); }
      catch { setFeedback({ message: "Proof was uploaded, but this browser could not save the latest checkout state. Keep this page open.", toasted: true }); }
      toast.success("Payment proof uploaded.");
    } catch (e) {
      reportFailure("Payment proof upload", e, e instanceof Error && e.message === "UPLOAD_UNCERTAIN" ? "Upload could not be confirmed. You may submit this proof for verification, or select a new image and upload again before expiry." : friendly(e));
    }
    finally { lock.current = false; setBusy(false); }
  }
  async function submit() {
    if (!draft?.reservationId || lock.current || (draft.checkout.acknowledgementRequired && !ack)) return;
    if (!name.trim() || !email.trim() || !phone.trim() || !checkoutMethods?.some(m => m.id === methodId)) { setError("Enter your contact details and choose a payment method."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const payload = { ownerToken: draft.owner, checkoutId: draft.checkout.checkoutId, reservationId: draft.reservationId, customer: { name: name.trim(), email: email.trim(), phone: phone.trim() }, paymentMethodId: methodId, ...(reference.trim() ? { reference: reference.trim() } : {}), ...(draft.checkout.acknowledgementRequired ? { acknowledgedTotal: draft.checkout.total } : {}) };
      const hash = await digest(JSON.stringify(payload));
      const key = draft.submitHash === hash && draft.submitKey ? draft.submitKey : crypto.randomUUID();
      save({ ...draft, submitHash: hash, submitKey: key });
      const submitted = await post<Result>("/api/checkout/submit", { ...payload, idempotencyKey: key });
      setResult(submitted);
      try { finishCheckout(); }
      catch { setError("Your proof was submitted, but this browser could not clear the saved checkout. Do not submit it again."); }
      if (submitted.booked) toast.success("Payment proof submitted for review.");
      else toast.info("Payment proof sent for review. Your court is not booked.");
    } catch (e) { reportFailure("Payment proof submission", e); }
    finally { lock.current = false; setBusy(false); }
  }
  async function lookup(e: React.FormEvent) {
    e.preventDefault(); if (trackBusy) return; setTrackBusy(true); setTrackError(""); setTracking(null);
    try { setTracking(await post<Tracking>("/api/checkout/track", { code: trackCode.trim().toUpperCase(), email: trackEmail.trim() })); }
    catch (err) { setTrackError(friendly(err)); } finally { setTrackBusy(false); }
  }

  const sectionTitle = "font-display text-4xl font-black uppercase leading-[.85] tracking-tight text-[#447244] sm:text-5xl";
  const darkBtn = "inline-flex min-h-12 items-center justify-center self-start rounded-md bg-[#447244] px-6 py-3 text-base font-bold text-white transition hover:bg-[#f28500]";
  const tileBtn = "mt-5 inline-flex min-h-9 items-center rounded-md bg-white px-3 text-xs font-bold text-[#447244] transition hover:bg-[#447244] hover:text-white";
  const card = "rounded-2xl border border-[#dce5e8] bg-white p-5 shadow-sm sm:p-7";

  const playCards = [
    { href: "/book", label: "Book a court", image: IMAGES.book, caption: "Book a court" },
    { href: "/open-plays", label: "Open plays", image: IMAGES.openPlays, caption: "Open plays" },
    { href: "/track", label: "Track a booking", image: IMAGES.track, caption: "Track a booking" },
    { href: "/contact", label: "Visit us", image: IMAGES.visit, caption: "Visit us" },
  ];

  return <div className="min-h-screen bg-[#447244] text-[#17252e]">
    <style>{`
      @keyframes ethn-rise{from{transform:translateY(105%)}to{transform:none}}
      @keyframes ethn-court{from{transform:translateY(45%);opacity:0}to{transform:none;opacity:1}}
      @keyframes ethn-fade{from{opacity:0}to{opacity:1}}
      .ethn-line{display:block;overflow:hidden;padding-bottom:.03em}
      .ethn-line>span{display:block;animation:ethn-rise .9s cubic-bezier(.2,.8,.2,1) both}
      .ethn-line:nth-child(2)>span{animation-delay:.12s}
      .ethn-court{animation:ethn-court 1.1s .35s cubic-bezier(.2,.8,.2,1) both}
      .ethn-fade{animation:ethn-fade .8s .7s both}
      @keyframes ethn-float{0%,100%{transform:translateY(0) rotate(var(--r,0deg))}50%{transform:translateY(-14px) rotate(calc(var(--r,0deg) + 5deg))}}
      .ethn-float{animation:ethn-float 5s ease-in-out infinite;will-change:transform}
      @media (prefers-reduced-motion:reduce){.ethn-line>span,.ethn-court,.ethn-fade,.ethn-float{animation:none}.ethn-sticker{transform:none!important}}
    `}</style>
    <main>
      {!bookingPage && <>{/* HERO */}
      <section ref={heroRef} className="relative isolate overflow-hidden bg-[#447244] px-4 pt-3 text-center text-white sm:px-6">
        <Guides />
        {/* Floating stickers: they drift on their own and rise faster than the page as you scroll */}
        <Sticker kind="paddle" className="left-[3%] top-[24%] w-12 sm:w-16 lg:w-24" speed={0.35} rot={-18} />
        <Sticker kind="ball" className="right-[5%] top-[19%] w-10 sm:w-14 lg:w-20" speed={0.55} rot={10} delay={0.8} />
        <Sticker kind="paddle" className="right-[3%] top-[46%] hidden w-14 sm:block lg:w-24" speed={0.25} rot={24} delay={1.6} />
        <Sticker kind="ball" className="left-[7%] top-[52%] w-8 sm:w-12 lg:w-16" speed={0.45} rot={-8} delay={0.4} />
        <Sticker kind="ball" className="left-[19%] top-[68%] hidden md:block md:w-12 lg:w-14" speed={0.6} rot={15} delay={1.2} />
        <Sticker kind="paddle" className="right-[16%] top-[66%] hidden md:block md:w-14 lg:w-20" speed={0.4} rot={-28} delay={2} />

        <h1 className="relative z-10 mx-auto mt-4 w-[min(80%,38rem)]">
          <img src="/ethn-courts-logo-hero.svg" alt="ETHN Courts" className="h-auto w-full" />
        </h1>

        <div className="ethn-fade relative z-20 mx-auto mt-4 flex items-center justify-center gap-2 sm:gap-3">
          <a href="/book" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-[#f28500] px-3 text-xs font-extrabold sm:min-h-12 sm:px-7 sm:text-sm text-white shadow-[0_5px_0_#a55500] transition hover:translate-y-[2px] hover:bg-[#d97300] hover:shadow-[0_3px_0_#a55500] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto">Book a court <span aria-hidden="true" className="ml-2">→</span></a>
          <a href="/open-plays" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border-2 border-white/40 bg-[#447244] px-3 text-xs font-bold sm:min-h-12 sm:px-7 sm:text-sm text-white transition hover:border-[#ffad4c] sm:bg-transparent hover:text-[#ffad4c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto">See open plays</a>
        </div>

        {/* HERO IMAGE — set IMAGES.hero above to replace the animated court */}
        <div className="ethn-court pointer-events-none relative mx-auto -mt-[80px] w-[80%] sm:-mt-[88px] sm:w-full sm:max-w-[720px]">
          {IMAGES.hero ? <img src={IMAGES.hero} alt="Pickleball court at ETHN Courts" className="block h-auto w-full" /> : <RallyCourt />}
          <p className="absolute inset-x-0 top-[28%] hidden -translate-y-1/2 px-5 text-xl font-extrabold text-white sm:block">Your next game starts here.</p>
        </div>
      </section>

      {/* BOOK INTRO BAND */}
      <section className="bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-7 sm:px-8">
          <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#447244] text-[#ffad4c]"><Ball className="h-6 w-6" /></span><h2 className={sectionTitle}>Book your<br />court</h2></div>
          <div className="flex max-w-sm flex-col gap-4 text-[11px] leading-5 text-[#405966]"><a href="/book" className={darkBtn}><CalendarDays aria-hidden="true" className="mr-2 size-4" />Check availability</a><p>Pick an open time on either court, pay using an available method, and staff confirm your reservation.</p></div>
        </div>
      </section>

      </>}
      {/* BOOKING + GUIDE GRID */}
      <section id="booking" className="relative isolate scroll-mt-28 sm:scroll-mt-32 bg-[#447244] px-4 py-4 sm:px-6">
        <Guides />
        <div className="mx-auto max-w-7xl space-y-4">
    {feedback.message && <p role={feedback.toasted ? undefined : "alert"} className="rounded-2xl border border-destructive/30 bg-white p-4 text-sm text-foreground">{feedback.message}</p>}
    {bookingPage && <p className="text-sm font-bold text-white">{result ? "Step 4 of 4 - Submission status" : draft ? "Step 3 of 4 - Payment and contact" : review ? "Step 2 of 4 - Review and hold" : "Step 1 of 4 - Date and slots"}</p>}
    {bookingPage && result ? <section className="rounded-2xl border bg-card p-6"><h2 className="text-xl font-bold">{result.booked ? "Request pending review" : "Not booked"}</h2><p className="mt-2 text-sm">{result.booked ? "Your reservation is not confirmed until staff verify your payment." : "Your payment evidence requires staff review. Your court is not booked."}</p>{result.code && <p className="mt-4">Tracking code: <strong>{result.code}</strong></p>}{result.trackingToken && <a className="mt-4 inline-block font-semibold text-primary underline" href={`/checkout/track/${result.trackingToken}`}>View reservation status</a>}<div className="mt-5"><Button variant="outline" onClick={() => { setResult(null); void load(); }}>Choose another time</Button></div></section> : bookingPage && draft ? <section className={`space-y-6 ${card}`}><div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#dce5e8] pb-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Your checkout</p><h2 className="font-display mt-1 text-3xl font-bold text-[#447244]">{money(draft.checkout.total)}</h2><p className="text-sm text-[#718189]">Booking date: {formatDisplayDate(draft.date)}</p></div><p className="rounded-lg border border-[#f2d8b4] bg-[#fff0dc] px-4 py-3 text-sm font-bold text-[#8a4a00]">{!clockReady ? "Time unavailable; refresh availability" : expired ? "Hold expired" : `Hold remaining ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</p></div>
      {restored && <p className="rounded-lg bg-muted p-3 text-sm">Checkout restored on this device. Availability and status will be checked by the server; this is not a guarantee.</p>}
      {!clockReady && <Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh server time</Button>}
      <ul className="divide-y border-y">{draft.checkout.items.map((item, i) => <li key={i} className="py-3 text-sm"><strong>Court {item.courtId}</strong> · {formatDate(item.start)} – {formatDate(item.end)} · {item.minutes} min · {money(item.rate)}/hour · <strong>{money(item.amount)}</strong></li>)}</ul>
      {draft.checkout.acknowledgementRequired && <label className="flex gap-2 rounded-lg border border-primary p-4 text-sm"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>Price or settings changed. I acknowledge the updated total of {money(draft.checkout.total)}.</span></label>}
      {expired && <p className="rounded-lg bg-muted p-4 text-sm">This hold expired and the court is not booked. If you paid and already uploaded proof, submit it below for staff review. No new upload can be authorized.</p>}
      <div className="space-y-3 rounded-lg bg-muted p-4 text-sm"><label className={field}>Payment method<select className="rounded-md border bg-background p-2" value={methodId} onChange={e => setMethodId(e.target.value)}><option value="">Choose a payment method</option>{checkoutMethods?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>{checkoutMethods === null ? <p>Loading payment methods…</p> : checkoutMethods.length === 0 ? <p role="alert">Payment methods are unavailable. Refresh or contact the venue before paying.</p> : null}{checkoutMethods?.filter(m => m.id === methodId).map(m => <div key={m.id}><p className="whitespace-pre-wrap">{m.instructions}</p>{m.qrAvailable && <img src={`/api/ethn/payment-methods/${encodeURIComponent(m.id)}/qr?v=${encodeURIComponent(m.version)}`} alt={`${m.name} payment QR code`} className="mt-3 max-h-64 max-w-full rounded-lg bg-white p-2" />}<p className="mt-2">Confirm payment details with the venue before paying.</p></div>)}</div>
      <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Full name<Input maxLength={200} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label className={field}>Email<Input type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label><label className={field}>Contact number<Input maxLength={50} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label><label className={field}>Payment reference (optional)<Input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label></div>
      <div className="space-y-3"><label className={field}>Payment proof (JPG, PNG or WebP, up to 5 MiB)<Input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || expired || !clockReady} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy || !clockReady || expired || !file || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void upload()}>{busy ? "Please wait…" : "Upload proof"}</Button><span className="text-sm text-muted-foreground">{draft.uploaded ? "Proof uploaded." : draft.reservationId ? "Upload not confirmed; submission will check proof." : "After a reload, reattach your file if it was not uploaded."}</span></div></div>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !draft.reservationId || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void submit()}>{busy ? "Please wait…" : expired ? "Submit evidence for staff review" : "Submit for review"}</Button><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm("Leave this checkout? Its hold will expire. If you paid, keep your proof and contact the venue.")) { finishCheckout(); setError(""); void load(); } }}>Leave checkout</Button></div>
    </section> : <section className={`${bookingPage ? "space-y-5" : "space-y-3"} ${card}`}>
      <div className={bookingPage ? "rounded-xl border border-[#f2d8b4] bg-[#fff0dc] p-4 sm:p-5" : ""}>
        {bookingPage && <><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b85f00]">Your schedule</p><h2 className="font-display mt-1 text-2xl font-bold text-[#447244]">Choose your booking date</h2></>}
        <p id={`${dateId}-help`} className={bookingPage ? "mt-2 text-sm leading-5 text-[#405966]" : "sr-only"}>Times after midnight may appear under the previous booking date. {bookingPage ? "Check the date beside each time." : "A time range that crosses midnight shows the next day’s date."}</p>
        <div className={`${bookingPage ? "mt-4 " : ""}flex flex-col gap-3 sm:flex-row sm:items-end ${bookingPage ? "" : "justify-center"}`}>
          {bookingPage ? <div className={`${field} sm:min-w-56`}><label htmlFor={dateId}>Booking date</label><Input id={dateId} aria-describedby={`${dateId}-help`} className="min-h-11 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" type="date" value={chosenDate} min={minDate} max={maxDate} disabled={loading || review} onChange={e => changeDate(e.target.value)} /></div> : <div className="mx-auto w-full max-w-sm text-center">
            <p className="mb-2 block text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Booking date</p>
            <div className="flex items-center justify-center gap-2">
              <Button type="button" variant="outline" aria-label="Previous day" className="h-11 w-11 shrink-0 border-[#447244] bg-white p-0 text-[#447244] hover:bg-[#edf3e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" disabled={loading || review || !minDate || !maxDate || !previousDate || previousDate < minDate || previousDate > maxDate} onClick={() => changeDate(previousDate)}><ChevronLeft aria-hidden="true" className="size-5" /></Button>
              <div className="min-w-0 flex-1 space-y-2">
                <button type="button" onClick={openDatePicker} disabled={loading || review} aria-label={`Choose booking date${validDate(chosenDate) ? `, ${bookingDate(chosenDate)}` : ""}`} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#a7c5a0] bg-white px-2 py-2 font-semibold text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244] disabled:opacity-50"><CalendarDays aria-hidden="true" className="size-4 shrink-0" /><span>{validDate(chosenDate) ? bookingDate(chosenDate) : "Choose date"}</span></button>
                <Input ref={dateInput} id={dateId} aria-label="Booking date" aria-describedby={`${dateId}-help`} tabIndex={dateFallback ? 0 : -1} className={dateFallback ? "min-h-11 w-full border-[#a7c5a0] bg-white text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" : "pointer-events-none absolute h-px w-px opacity-0"} type="date" value={chosenDate} min={minDate} max={maxDate} disabled={loading || review} onChange={e => changeDate(e.target.value)} />
              </div>
              <Button type="button" variant="outline" aria-label="Next day" className="h-11 w-11 shrink-0 border-[#447244] bg-white p-0 text-[#447244] hover:bg-[#edf3e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" disabled={loading || review || !minDate || !maxDate || !nextDate || nextDate < minDate || nextDate > maxDate} onClick={() => changeDate(nextDate)}><ChevronRight aria-hidden="true" className="size-5" /></Button>
            </div>
          </div>}
          {bookingPage && availability && <Button type="button" variant="outline" className="min-h-11 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" disabled={loading || review} onClick={() => changeDate(availability.operatingDate)}>Book for {bookingDate(availability.operatingDate, false)}</Button>}
        </div>
        {bookingPage && chosenDate && <div className="mt-5 flex flex-col gap-3 border-t border-[#f2d8b4] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-lg font-bold text-[#447244]">{bookingDate(chosenDate)}</p><Button variant="outline" className="min-h-11 bg-white" disabled={loading || review} onClick={() => void load(chosenDate)}>Refresh availability</Button></div>}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{dateStatus}</p>
      {loading ? <LoadingAnimation label="Loading availability" className="py-6" /> : !availability ? <div className="space-y-3"><p className="text-sm">Availability is unavailable.</p><Button variant="outline" onClick={() => void load(chosenDate || undefined)}>Retry availability</Button></div> : !chosenDate ? <p className="rounded-lg bg-[#edf3f5] p-4 text-sm text-[#405966]">Choose a date to see available times.</p> : <>{!availability.configured && <p className="rounded-lg bg-muted p-4 text-sm">{availability.message || "Booking and payment are not configured yet."}</p>}{(availability.courts.length === 0 || availability.courts.every(c => c.windows.length === 0)) && <p className="py-6 text-sm text-muted-foreground">Courts are closed on this date.</p>}
      {bookingPage && !review && <ul aria-label="Availability legend" className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-medium text-[#405966]">{([ ["Available", "+"], ["Selected", "✓"], ["Unavailable", "–"], ["Closed", "C"], ["Rate unavailable", "R"] ] as const).map(([label, symbol]) => <li key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${statusStyles[label]}`}>{symbol}</span>{label}</li>)}</ul>}
      {!review && availability.courts.some(c => c.windows.length > 0) && gridTimes(availability.courts.flatMap(c => c.windows), availability.settings.intervalMinutes, now).length === 0 && <p role="status" className="py-4 text-sm text-[#405966] text-center"><EmptyIcon /> No upcoming slots for this date.</p>}
      {!review && <div role="region" aria-label="Court availability" tabIndex={0} className={bookingPage ? "max-h-[32rem] overflow-auto rounded-xl border border-[#dce5e8]" : ""}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm"><caption className="sr-only">Court availability by time</caption><thead className={bookingPage ? "sticky top-0 z-10 bg-[#447244] text-white" : "text-[#447244]"}><tr><th scope="col" className="px-1 py-3 text-center text-xs sm:p-3 sm:text-sm"><span className="inline-flex items-center justify-center gap-1"><Clock3 aria-hidden="true" className="size-4 shrink-0" />Time</span></th>{availability.courts.map(c => <th scope="col" key={c.id} className="px-0.5 py-1 text-center text-xs sm:px-2 sm:text-sm"><span className="inline-flex items-center justify-center"><span>{c.name}</span><button type="button" aria-label={`View ${c.name} photo`} onClick={() => { setPreviewCourt(c.name); previewDialog.current?.showModal(); }} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${bookingPage ? "text-white hover:bg-white/15" : "text-[#447244] hover:bg-[#edf3f5]"} focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ffad4c]`}><ImageIcon aria-hidden="true" className="size-4" /></button></span></th>)}</tr></thead><tbody>
          {gridTimes(availability.courts.flatMap(c => c.windows), availability.settings.intervalMinutes, now).map(start => {
            const end = start + availability.settings.intervalMinutes * 60000;
            const endDate = bookingPage ? slotDate(end) : slotEndDate(start, end);
            return <tr key={start}><th scope="row" className="bg-white px-1 py-2 text-center"><span className="inline-flex max-w-full flex-col items-center rounded-full bg-[#edf3f5] px-2 py-2 text-[10px] font-bold leading-4 text-[#447244] sm:flex-row sm:gap-1 sm:px-3 sm:text-xs"><span>{bookingPage && `${slotDate(start)} · `}{formatTime(start)} <span aria-hidden="true">–</span></span><span>{endDate && `${endDate} · `}{formatTime(end)}</span></span></th>{availability.courts.map(court => {
            const wi = court.windows.findIndex(w => slots(w, court.occupied, availability.settings.intervalMinutes, now).some(s => s.start === start));
            const window = court.windows[wi]; const grid = window ? slots(window, court.occupied, availability.settings.intervalMinutes, now) : []; const index = grid.findIndex(s => s.start === start); const slot = grid[index]; const selected = ranges.find(r => r.courtId === court.id); const active = !!slot && selected?.window === wi && slot.start >= Date.parse(selected.start) && slot.end <= Date.parse(selected.end);
            const status = !slot ? "Closed" : window.hourlyRate === null ? "Rate unavailable" : !slot.available ? "Unavailable" : "Available";
            const label = active ? "Selected" : status;
            const symbol = active ? "✓" : status === "Available" ? "+" : status === "Closed" ? "C" : status === "Rate unavailable" ? "R" : "–";
            const content = <><span aria-hidden="true" className="sm:hidden">{symbol}</span><span className="sr-only sm:not-sr-only">{label}</span></>;
            const style = `inline-flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold sm:w-full sm:px-2 sm:text-xs ${statusStyles[label]}`;
            return <td key={court.id} className="border-t border-[#dce5e8] px-1 py-2 text-center">{<button type="button" disabled={status !== "Available"} aria-pressed={!!active} aria-label={`${court.name}, ${slotDate(start)} ${formatTime(start)} - ${slotDate(end)} ${formatTime(end)}, ${label}`} onClick={() => { const next = selectRange(court.id, wi, window, grid, index, selected); setRanges([...ranges.filter(r => r.courtId !== court.id), ...(next ? [next] : [])]); }} className={`${style} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f28500] enabled:hover:ring-2 enabled:hover:ring-[#f28500] disabled:cursor-not-allowed`}>{content}</button>}</td>;
          })}</tr>;
          })}
        </tbody></table></div>}
      {!bookingPage && !review && <ul aria-label="Availability legend" className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-medium text-[#405966]">{([ ["Available", "+"], ["Selected", "✓"], ["Unavailable", "–"], ["Closed", "C"], ["Rate unavailable", "R"] ] as const).map(([label, symbol]) => <li key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${statusStyles[label]}`}>{symbol}</span>{label}</li>)}</ul>}
      <dialog ref={previewDialog} aria-labelledby="court-preview-title" className="m-auto w-[min(90vw,28rem)] overscroll-contain rounded-2xl bg-white p-6 text-[#447244] shadow-xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-[#0f2938]/70"><h2 id="court-preview-title" className="font-display text-2xl font-bold">{previewCourt} photo</h2>{(() => { const court = availability?.courts.find(c => c.name === previewCourt); return <>{court?.photoVersion && court.photoVersion !== "0" ? <Photo src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(court.photoVersion)}`} label={court.name} className="mt-4 aspect-[4/3] w-full rounded-lg object-cover" /> : <p className="mt-4 text-sm text-[#405966]">A photo of this court is not available yet.</p>}{court?.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm text-[#405966]">{court.description}</p>}</>; })()}<form method="dialog" className="mt-6"><Button autoFocus type="submit">Close</Button></form></dialog>
      {!review && ranges.length > 0 && <div className="flex flex-wrap gap-3">{ranges.map(r => <button key={r.courtId} className="text-sm text-primary underline" onClick={() => setRanges(ranges.filter(item => item.courtId !== r.courtId))}>Clear {availability.courts.find(c => c.id === r.courtId)?.name}</button>)}</div>}

      {ranges.length > 0 && <section aria-labelledby="selection-heading" className="border-t border-[#dce5e8] pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b85f00]">Your selection</p><h3 id="selection-heading" className="font-display mt-1 text-2xl font-bold text-[#447244]">Review chosen times</h3></div></div>
        <ul className="mt-5 divide-y divide-[#dce5e8] overflow-hidden rounded-xl border border-[#dce5e8]">
          {ranges.map(r => {
            const minutes = (Date.parse(r.end) - Date.parse(r.start)) / 60_000;
            return <li key={r.courtId} className="grid gap-4 bg-[#f8fafb] p-4 sm:grid-cols-[1fr_auto] sm:items-start sm:p-5">
              <div className="min-w-0"><h4 className="font-display text-lg font-bold text-[#447244]">{availability.courts.find(c => c.id === r.courtId)?.name}</h4>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase tracking-wide text-[#405966]">From</dt><dd className="mt-1"><time dateTime={r.start}>{formatDate(r.start)}</time></dd></div><div><dt className="text-xs font-bold uppercase tracking-wide text-[#405966]">To</dt><dd className="mt-1"><time dateTime={r.end}>{formatDate(r.end)}</time></dd></div></dl>
                <p className="mt-3 text-sm text-[#405966]">{minutes} min · {money(r.rate)} / hour</p>
              </div><div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-wide text-[#405966]">Item estimate</p><p className="mt-1 text-lg font-bold tabular-nums text-[#447244]">{total ? money(pesos(priceItems([{ rate: r.rate, minutes }]))) : "Unavailable"}</p></div>
            </li>;
          })}
        </ul>
        {!validRanges && <p className="mt-3 text-sm text-muted-foreground">Each range must be at least {availability.settings.minimumMinutes} minutes and start in the future.</p>}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-[#447244] p-5 text-white"><div><p className="text-sm font-medium text-white/80">Estimated total</p><p className="font-display mt-1 text-3xl font-bold tabular-nums">{total ? money(total) : "Unavailable"}</p><p className="mt-1 text-xs text-white/80">Final amount confirmed at checkout.</p></div><div className="w-full sm:w-auto sm:min-w-52">{bookingPage ? <Button className="w-full" disabled={busy || !availability.configured || !validRanges || !total} onClick={() => review ? void beginCheckout() : setReview(true)}>{busy ? "Starting checkout…" : review ? "Confirm and hold" : "Review selection"}</Button> : validRanges ? <a className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#f28500] px-4 text-sm font-bold text-white" href={`/book?${new URLSearchParams({ date: chosenDate, ranges: JSON.stringify(ranges.map(({ courtId, start, end }) => ({ courtId, start, end }))) })}`}>Continue booking</a> : <p className="text-sm">Choose valid times to continue.</p>}{review && <Button variant="outline" className="mt-2 w-full" onClick={() => setReview(false)}>Back to slots</Button>}</div></div>
      </section>}</>}
    </section>}

          {!bookingPage && <>
            <section id="track" className={`min-w-0 scroll-mt-28 text-[#17252e] sm:scroll-mt-32 ${card}`}>
              <div className="mx-auto max-w-xl text-center">
                <h2 className="font-display text-2xl font-bold text-[#447244]">Track your reservation</h2>
                <p className="mt-2 text-sm leading-5 text-[#405966]">Use the tracking code and email from your request to see where your booking stands.</p>
              </div>
              <form onSubmit={lookup} className="mx-auto mt-4 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="block text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Tracking code<Input aria-label="Tracking code" className="mt-2 min-h-11 border-[#a7c5a0] bg-white font-semibold normal-case tracking-normal text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" required maxLength={5} value={trackCode} onChange={e => setTrackCode(e.target.value)} /></label><label className="block text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Email<Input aria-label="Email" className="mt-2 min-h-11 border-[#a7c5a0] bg-white font-semibold normal-case tracking-normal text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" required type="email" value={trackEmail} onChange={e => setTrackEmail(e.target.value)} /></label><Button className="min-h-11 bg-[#447244] px-6 font-bold text-white hover:bg-[#365e36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" disabled={trackBusy} type="submit">{trackBusy ? "Checking…" : "Track"}</Button></form>
              {trackError && <p role="alert" className="mt-3 text-sm text-destructive">{trackError}</p>}
              {tracking && <div role="status" className="mt-5 space-y-2 border-t pt-4 text-sm"><p>Reservation: <strong className="capitalize">{tracking.status}</strong> · {formatDisplayDate(tracking.operatingDate)} · {money(tracking.total)}</p>{tracking.status === "pending" && <p>Pending review; not yet confirmed.</p>}{tracking.items.map((item, i) => <p key={i}>{item.court}: {formatDate(item.startsAt)} – {formatDate(item.endsAt)}</p>)}{tracking.payments.map((p, i) => <p key={i}>Payment: {p.method.toUpperCase()} · {p.status}{p.reviewReason && tracking.status === "rejected" ? ` · Reason: ${p.reviewReason}` : ""}</p>)}</div>}
            </section>
          </>}
        </div>
      </section>

      {!bookingPage && <>{/* PLAY YOUR WAY */}
      <section id="open-plays" className="scroll-mt-28 sm:scroll-mt-32 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-7 sm:px-8">
          <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#447244] text-[#ffad4c]"><Ball className="h-6 w-6" /></span><h2 className={sectionTitle}>Play your<br />way</h2></div>
          <div className="flex max-w-sm flex-col gap-4 text-[11px] leading-5 text-[#405966]"><a href="/open-plays" className={darkBtn}><Users aria-hidden="true" className="mr-2 size-4" />View open plays</a><p>Discover upcoming open plays, or reserve a court for your own group.</p></div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-4 px-5 pb-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {playCards.map(c => <a key={c.label} href={c.href} className="group block"><div className="relative aspect-[3/4] overflow-hidden rounded-2xl"><Photo src={c.image} label={c.label} className="h-full w-full transition-transform duration-500 group-hover:scale-105" /><span className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-[#447244] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{c.label}<span aria-hidden="true">↗</span></span></div><p className="mt-2 text-xs font-medium text-[#405966]">{c.caption}</p></a>)}
        </div>
      </section>
    </>}

      {!bookingPage && <HowItWorks />}

      {!bookingPage && <>{/* VISIT */}
      <section className="relative isolate scroll-mt-28 bg-[#447244] px-4 py-4 sm:scroll-mt-32 sm:px-6">
        <Guides />
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
        <section className="flex min-w-0 flex-col rounded-2xl bg-white p-4 text-[#447244] md:col-span-2">
          <h2 className="font-display text-2xl font-black uppercase">Visit us</h2>
          <p className="mt-1 text-xs leading-5">Daylor Village, Abucayan, Balamban, Cebu</p>
          <iframe title="Google map of Daylor Village 1" src={VENUE_MAP_EMBED} className="mt-3 min-h-[300px] w-full flex-1 rounded-xl border-0" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        </section>
            <div className="grid gap-4">
              <div className="flex flex-col justify-end rounded-2xl bg-[#0f2938] p-4 text-white shadow-xl">
                <div className="flex items-start justify-between gap-3"><p className="text-base font-semibold leading-tight">How booking<br />works</p><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#447244]"><Ball className="h-5 w-5" /></span></div>
                <div className="mt-5 flex items-end justify-between"><p className="font-display text-4xl font-black text-[#ffad4c]">3 steps</p><p className="text-right text-xs leading-4 text-white/70">Reserve, pay,<br />get confirmed</p></div>
                <div aria-hidden="true" className="mt-3 flex h-12 items-end gap-[3px]">{Array.from({ length: 24 }, (_, i) => <span key={i} className={`flex-1 rounded-full ${i < 16 ? "bg-[#ffad4c]" : "bg-white/15"}`} style={{ height: "100%" }} />)}</div>
              </div>
              <div className="rounded-2xl bg-[#cfe3ec] p-6 text-[#447244]"><Ball className="h-8 w-8" /><h3 className="font-display mt-4 text-2xl font-black uppercase leading-none">Pay and upload</h3><p className="mt-3 text-xs leading-5">Pay using a listed method, upload your proof, and staff confirm your booking.</p><a href="/track" className={tileBtn}>Track booking <span aria-hidden="true" className="ml-2">→</span></a></div>
              <div className="rounded-2xl bg-[#ffad4c] p-6 text-[#447244]"><Ball className="h-8 w-8" /><h3 className="font-display mt-4 text-2xl font-black uppercase leading-none">Pick your time</h3><p className="mt-3 text-xs leading-5">Choose a continuous range inside one opening window on either court.</p><a href="/book" className={tileBtn}>See open times <span aria-hidden="true" className="ml-2">→</span></a></div>
            </div>
        </div>
      </section>

      {/* FIND US + FOOTER */}
      <section id="find-us" className="relative isolate scroll-mt-28 sm:scroll-mt-32 bg-[#447244] px-4 py-16 text-center text-white sm:px-6">
        <Guides />
        <h2 className="font-display mx-auto max-w-3xl text-[clamp(2.5rem,7vw,4.5rem)] font-black uppercase leading-[.85] tracking-tight text-[#ffad4c]">Your neighborhood<br />court</h2>
        <p className="mx-auto mt-5 max-w-sm text-xs leading-5 text-white/75">Daylor Village, Abucayan, Balamban, Cebu. Better rallies, right where you live.</p>
        <a href="/book" className="mt-7 inline-flex min-h-10 items-center rounded-md bg-white px-5 text-xs font-bold text-[#447244] transition hover:bg-[#ffad4c]">Book a court</a>
      </section>
      <Faq />
      <footer className="border-t border-white/10 bg-[#447244] px-5 py-10 text-sm text-white/70 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row"><div><div className="flex items-center gap-3"><img src="/ethn-courts-logo.svg" alt="ETHN Courts" className="h-auto w-36" /></div><p className="mt-4 max-w-xs leading-6 text-white/55">Your neighborhood court for better rallies in Balamban.</p></div><div><p className="font-bold text-white">Visit</p><p className="mt-3 text-white/60">Daylor Village<br />Abucayan, Balamban<br />Cebu, Philippines</p></div><div><p className="font-bold text-white">Explore</p><div className="mt-3 flex gap-4"><a href="/contact" className="hover:text-white">Contact</a><a href="/terms" className="hover:text-white">Terms</a><a href="/privacy" className="hover:text-white">Privacy</a></div></div></div></footer>
    </>}
    </main></div>;
}