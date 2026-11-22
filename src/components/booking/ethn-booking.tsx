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

/* ──────────────────────────────────────────────────────────────
   IMAGE SLOTS — paste your image paths here (e.g. "/hero-court.jpg").
   Leave a value as "" to show the placeholder.
   ────────────────────────────────────────────────────────────── */
const IMAGES = {
  hero: "/hero-court.svg", // put hero-court.svg in /public. Set "" to show the placeholder
  overview: "/stock/overview.jpg",   // large photo tile in the booking-guide grid
  book: "/stock/book.jpg",       // "Book a court" card
  openPlays: "/stock/openPlays.jpg",  // "Open plays" card
  track: "/stock/track.jpg",      // "Track a booking" card
  visit: "/stock/visit.jpg",      // "Visit us" card
};

function Photo({ src, label, className = "" }: { src: string; label: string; className?: string }) {
  if (src) return <img src={src} alt="" className={`object-cover ${className}`} />;
  return (
    <div role="img" aria-label={`${label} placeholder`} className={`grid place-items-center bg-[repeating-linear-gradient(135deg,#1d4a63_0_12px,#16384d_12px_24px)] p-4 text-center text-[11px] font-bold uppercase tracking-widest text-white/55 ${className}`}>
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
      <g fill="#16384d" opacity=".8">{dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" />)}</g>
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
      <rect x="40" y="108" width="20" height="56" rx="8" fill="#16384d" />
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

/* Fixed 3D pickleball: spins with scroll, progress arc fills around it. Click = back to top. */
function ScrollBall() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const box = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const cv = canvas.current, ring = arc.current, el = box.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ring || !el || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SIZE = 72, R = 29, C = SIZE / 2, CIRC = 2 * Math.PI * 43;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.height = SIZE * dpr; ctx.scale(dpr, dpr);
    const N = 26;
    const pts = Array.from({ length: N }, (_, i) => { const y = 1 - ((i + 0.5) * 2) / N, r = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5)); return [Math.cos(th) * r, y, Math.sin(th) * r]; });
    const TILT = 0.4, cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    const draw = (angle: number) => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const body = ctx.createRadialGradient(C - 9, C - 11, 3, C, C, R);
      body.addColorStop(0, "#ffd9a0"); body.addColorStop(0.6, "#ffad4c"); body.addColorStop(1, "#e8890f");
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.fill();
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      for (const [x, y, z] of pts) {
        const x1 = x * cosA + z * sinA, z1 = -x * sinA + z * cosA;
        const y2 = y * cosT - z1 * sinT, z2 = y * sinT + z1 * cosT;
        if (z2 <= 0.04) continue;
        ctx.save(); ctx.translate(C + x1 * R, C - y2 * R); ctx.rotate(Math.atan2(-y2, x1));
        ctx.fillStyle = "rgba(22,56,77,.85)"; ctx.beginPath(); ctx.ellipse(0, 0, 3.6 * z2, 3.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      const shade = ctx.createRadialGradient(C - 9, C - 11, 2, C, C, R);
      shade.addColorStop(0, "rgba(255,255,255,.45)"); shade.addColorStop(0.35, "rgba(255,255,255,0)"); shade.addColorStop(0.75, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,.3)");
      ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.fill();
    };
    const progressOf = (y: number) => { const max = document.documentElement.scrollHeight - window.innerHeight; return max > 0 ? Math.min(1, Math.max(0, y / max)) : 0; };
    const render = (y: number) => {
      draw(reduce ? 0.6 : y * 0.012);
      ring.style.strokeDashoffset = String(CIRC * (1 - progressOf(y)));
      const show = y > 60;
      el.style.opacity = show ? "1" : "0"; el.style.pointerEvents = show ? "auto" : "none";
      el.style.transform = show ? "translateY(0) scale(1)" : "translateY(16px) scale(.9)";
    };
    let shownY = window.scrollY, raf = 0;
    const tick = () => {
      const t = window.scrollY;
      shownY += (t - shownY) * (reduce ? 1 : 0.14);
      if (Math.abs(t - shownY) < 0.3) shownY = t;
      render(shownY);
      raf = shownY !== t ? requestAnimationFrame(tick) : 0;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    render(shownY);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <button ref={box} type="button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })} className="fixed bottom-4 right-4 z-50 h-24 w-24 rounded-full bg-[#16384d] shadow-[0_8px_24px_rgba(0,0,0,.3)] ring-1 ring-white/15 transition-[opacity,transform] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffad4c] sm:bottom-6 sm:right-6" style={{ opacity: 0, transform: "translateY(16px) scale(.9)", pointerEvents: "none" }}>
      <svg viewBox="0 0 96 96" aria-hidden="true" className="absolute inset-0 h-full w-full -rotate-90"><circle cx="48" cy="48" r="43" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="5" /><circle ref={arc} cx="48" cy="48" r="43" fill="none" stroke="#ffad4c" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 43} strokeDashoffset={2 * Math.PI * 43} /></svg>
      <canvas ref={canvas} aria-hidden="true" className="absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2" />
    </button>
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
  const heroRef = useRef<HTMLElement>(null);
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
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => heroRef.current?.style.setProperty("--sy", String(Math.min(window.scrollY, 1400)))); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

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

  const navLink = "px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-[#16384d] hover:text-[#f28500]";
  const sectionTitle = "font-display text-4xl font-black uppercase leading-[.85] tracking-tight text-[#16384d] sm:text-5xl";
  const darkBtn = "inline-flex min-h-10 items-center justify-center self-start rounded-md bg-[#16384d] px-4 text-xs font-bold text-white transition hover:bg-[#f28500]";
  const tileBtn = "mt-5 inline-flex min-h-9 items-center rounded-md bg-white px-3 text-xs font-bold text-[#16384d] transition hover:bg-[#16384d] hover:text-white";
  const card = "rounded-2xl border border-[#dce5e8] bg-white p-5 shadow-sm sm:p-7";

  const playCards = [
    { href: "#booking", label: "Book a court", image: IMAGES.book, caption: "Book a court" },
    { href: "/open-plays", label: "Open plays", image: IMAGES.openPlays, caption: "Open plays" },
    { href: "#track", label: "Track a booking", image: IMAGES.track, caption: "Track a booking" },
    { href: "#find-us", label: "Visit us", image: IMAGES.visit, caption: "Visit us" },
  ];

  return <div className="min-h-screen bg-[#16384d] text-[#17252e]">
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
    <ScrollBall />
    <main>
      {/* HERO */}
      <section ref={heroRef} className="relative isolate overflow-hidden bg-[#16384d] px-4 pt-5 text-center text-white sm:px-6">
        <Guides />
        {/* Floating stickers: they drift on their own and rise faster than the page as you scroll */}
        <Sticker kind="paddle" className="left-[3%] top-[24%] w-12 sm:w-16 lg:w-24" speed={0.35} rot={-18} />
        <Sticker kind="ball" className="right-[5%] top-[19%] w-10 sm:w-14 lg:w-20" speed={0.55} rot={10} delay={0.8} />
        <Sticker kind="paddle" className="right-[3%] top-[46%] hidden w-14 sm:block lg:w-24" speed={0.25} rot={24} delay={1.6} />
        <Sticker kind="ball" className="left-[7%] top-[52%] w-8 sm:w-12 lg:w-16" speed={0.45} rot={-8} delay={0.4} />
        <Sticker kind="ball" className="left-[19%] top-[68%] hidden md:block md:w-12 lg:w-14" speed={0.6} rot={15} delay={1.2} />
        <Sticker kind="paddle" className="right-[16%] top-[66%] hidden md:block md:w-14 lg:w-20" speed={0.4} rot={-28} delay={2} />
        <header className="relative z-40 mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 md:gap-4">
            <a href="/" aria-label="ETHN Courts home" className="flex items-center gap-2 pr-2"><img src="/ethn-courts-mark.png" alt="" className="h-8 w-8 object-cover" /><span className="text-sm font-extrabold tracking-[.14em] text-[#16384d]">ETHN <span className="text-[#f28500]">COURTS</span></span></a>
            <nav aria-label="Booking navigation" className="hidden md:flex"><a href="#booking" className={navLink}>Book</a><a href="#open-plays" className={navLink}>Open plays</a><a href="#track" className={navLink}>Track booking</a><a href="/contact" className={navLink}>Contact</a></nav>
          </div>
          <div className="flex items-center gap-2">
            <a href="#booking" className="inline-flex min-h-10 items-center rounded-lg bg-[#f28500] px-4 text-xs font-extrabold text-white transition hover:bg-[#d97300]">Book a court</a>
            <details className="relative md:hidden"><summary aria-label="Open navigation menu" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-[#16384d]/20 text-xl text-[#16384d] [&::-webkit-details-marker]:hidden">☰</summary><nav aria-label="Mobile navigation" className="absolute right-0 top-12 w-48 rounded-xl bg-[#16384d] p-2 text-left text-xs font-bold uppercase tracking-widest text-white shadow-xl"><a href="#booking" className="block px-4 py-3 hover:bg-white/10">Book</a><a href="#open-plays" className="block px-4 py-3 hover:bg-white/10">Open plays</a><a href="/contact" className="block px-4 py-3 hover:bg-white/10">Contact</a><a href="#track" className="block px-4 py-3 hover:bg-white/10">Track booking</a></nav></details>
          </div>
        </header>

        <h1 className="font-display mx-auto mt-8 text-[clamp(5rem,19vw,13rem)] font-black uppercase leading-[.8] tracking-tight text-[#ffad4c]">
          <span className="ethn-line"><span>ETHN</span></span>
          <span className="ethn-line"><span>COURTS</span></span>
        </h1>
        <p className="ethn-fade mx-auto mt-8 max-w-md text-sm leading-6 text-white/80">Two courts, good rallies, and a community worth showing up for. Reserve your next game in a few taps.</p>
        <div className="ethn-fade mx-auto mt-7 grid max-w-lg grid-cols-2 gap-6 text-sm text-[#ffad4c]">
          <div><p className="font-extrabold uppercase tracking-wide">Find us</p><p className="mt-2 leading-6 text-white/80">Daylor Village, Abucayan,<br />Balamban, Cebu</p></div>
          <div><p className="font-extrabold uppercase tracking-wide">What to expect</p><p className="mt-2 leading-6 text-white/80">Online court booking<br />GCash payment<br />Staff-confirmed reservations</p></div>
        </div>

        <div className="ethn-fade relative z-20 mx-auto mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href="#booking" className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[#f28500] px-7 text-sm font-extrabold text-white shadow-[0_5px_0_#a55500] transition hover:translate-y-[2px] hover:bg-[#d97300] hover:shadow-[0_3px_0_#a55500] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto">Book a court <span aria-hidden="true" className="ml-2">→</span></a>
          <a href="#open-plays" className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border-2 border-white/40 px-7 text-sm font-bold text-white transition hover:border-[#ffad4c] hover:text-[#ffad4c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto">See open plays</a>
          <a href="#track" className="inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-sm font-bold text-white/80 underline underline-offset-4 transition hover:text-[#ffad4c] sm:w-auto">Track booking</a>
        </div>

        {/* HERO IMAGE — set IMAGES.hero above to replace the placeholder court */}
        <div className={IMAGES.hero ? "ethn-court mx-auto mt-10 w-[min(92%,680px)]" : "ethn-court relative mx-auto mt-10 h-[260px] w-[min(94%,920px)] overflow-hidden rounded-t-[2.5rem] border-[5px] border-b-0 border-white bg-[#f28500] sm:h-[320px]"}>
          {IMAGES.hero ? <img src={IMAGES.hero} alt="Pickleball court at ETHN Courts" className="block h-auto w-full" /> : <>
            <div className="absolute inset-x-0 top-0 grid h-[58%] grid-cols-2 border-b-[5px] border-white"><div className="border-r-[2.5px] border-white" /><div className="border-l-[2.5px] border-white" /></div>
            <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[#ffad4c]" />
            <div className="absolute inset-x-0 bottom-0 h-[6px] bg-white/90" />
            <p className="absolute inset-x-0 top-[24%] -translate-y-1/2 px-4 text-[11px] font-extrabold uppercase tracking-widest text-white/90">Hero image placeholder · pickleball court</p>
          </>}
        </div>
      </section>

      {/* BOOK INTRO BAND */}
      <section className="bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-7 sm:px-8">
          <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#16384d] text-[#ffad4c]"><Ball className="h-6 w-6" /></span><h2 className={sectionTitle}>Book your<br />court</h2></div>
          <div className="flex max-w-sm flex-col gap-4 text-xs leading-5 text-[#405966]"><p>Pick an open time on either court, pay through GCash, and staff confirm your reservation.</p><a href="#booking" className={darkBtn}>Check availability <span aria-hidden="true" className="ml-2">→</span></a></div>
        </div>
      </section>

      {/* BOOKING + GUIDE GRID */}
      <section id="booking" className="relative isolate scroll-mt-4 bg-[#16384d] px-4 py-4 sm:px-6">
        <Guides />
        <div className="mx-auto max-w-7xl space-y-4">
    {error && <p role="alert" className="rounded-2xl border border-destructive/30 bg-white p-4 text-sm text-foreground">{error}</p>}
    {result ? <section className="rounded-2xl border bg-card p-6"><h2 className="text-xl font-bold">{result.booked ? "Request pending review" : "Not booked"}</h2><p className="mt-2 text-sm">{result.booked ? "Your reservation is not confirmed until staff verify your payment." : "Your payment evidence requires staff review. Your court is not booked."}</p>{result.code && <p className="mt-4">Tracking code: <strong>{result.code}</strong></p>}{result.trackingToken && <a className="mt-4 inline-block font-semibold text-primary underline" href={`/checkout/track/${result.trackingToken}`}>View reservation status</a>}<div className="mt-5"><Button variant="outline" onClick={() => { setResult(null); void load(); }}>Choose another time</Button></div></section> : draft ? <section className={`space-y-6 ${card}`}><div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#dce5e8] pb-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Your checkout</p><h2 className="font-display mt-1 text-3xl font-bold text-[#16384d]">{money(draft.checkout.total)}</h2><p className="text-sm text-[#718189]">Operating date: {formatDisplayDate(draft.date)}</p></div><p className="rounded-lg border border-[#f2d8b4] bg-[#fff0dc] px-4 py-3 text-sm font-bold text-[#8a4a00]">{!clockReady ? "Time unavailable; refresh availability" : expired ? "Hold expired" : `Hold remaining ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</p></div>
      {restored && <p className="rounded-lg bg-muted p-3 text-sm">Checkout restored on this device. Availability and status will be checked by the server; this is not a guarantee.</p>}
      {!clockReady && <Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh server time</Button>}
      <ul className="divide-y border-y">{draft.checkout.items.map((item, i) => <li key={i} className="py-3 text-sm"><strong>Court {item.courtId}</strong> · {formatDate(item.start)} – {formatDate(item.end)} · {item.minutes} min · {money(item.rate)}/hour · <strong>{money(item.amount)}</strong></li>)}</ul>
      {draft.checkout.acknowledgementRequired && <label className="flex gap-2 rounded-lg border border-primary p-4 text-sm"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>Price or settings changed. I acknowledge the updated total of {money(draft.checkout.total)}.</span></label>}
      {expired ? <p className="rounded-lg bg-muted p-4 text-sm">This hold expired and the court is not booked. If you paid and already uploaded proof, submit it below for staff review. No new upload can be authorized.</p> : <div className="rounded-lg bg-muted p-4 text-sm"><strong>GCash recipient configured by venue</strong><p className="mt-2 whitespace-pre-wrap">{draft.checkout.merchant}</p><p className="mt-2">Pay only the official configured recipient. Confirm payment details with the venue before paying.</p></div>}
      <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Full name<Input maxLength={200} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label className={field}>Email<Input type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label><label className={field}>Contact number<Input maxLength={50} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label><label className={field}>GCash reference<Input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label></div>
      <div className="space-y-3"><label className={field}>Payment proof (JPG, PNG or WebP, up to 5 MiB)<Input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || expired || !clockReady} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy || !clockReady || expired || !file || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void upload()}>{busy ? "Please wait…" : "Upload proof"}</Button><span className="text-sm text-muted-foreground">{draft.uploaded ? "Proof uploaded." : draft.reservationId ? "Upload not confirmed; submission will check proof." : "After a reload, reattach your file if it was not uploaded."}</span></div></div>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !draft.reservationId || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void submit()}>{busy ? "Please wait…" : expired ? "Submit evidence for staff review" : "Submit for review"}</Button><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm("Leave this checkout? Its hold will expire. If you paid, keep your proof and contact the venue.")) { finishCheckout(); setError(""); void load(); } }}>Leave checkout</Button></div>
    </section> : <section className={`space-y-5 ${card}`}><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Your schedule</p><h2 className="font-display mt-1 text-2xl font-bold text-[#16384d]">Choose your time</h2><p className="mt-1 text-sm text-[#718189]">Select a continuous start-to-end range inside one opening window.</p></div><div className="flex flex-wrap items-end gap-3"><label className={field}>Operating date<Input type="date" value={chosenDate} min={availability?.operatingDate} max={availability ? addDays(availability.operatingDate, availability.settings.horizonDays - 1) : undefined} disabled={loading} onChange={e => { setChosenDate(e.target.value); if (e.target.value) void load(e.target.value); }} /></label><Button variant="outline" disabled={loading} onClick={() => void load(chosenDate || undefined)}>Refresh</Button></div></div>
      {loading ? <p role="status" className="py-6 text-sm text-muted-foreground">Loading availability…</p> : !availability ? <p className="py-6 text-sm">Availability is unavailable.</p> : <>{!availability.configured && <p className="rounded-lg bg-muted p-4 text-sm">{availability.message || "Booking and payment are not configured yet."}</p>}{availability.courts.length === 0 && <p className="py-6 text-sm text-muted-foreground">No courts available for this date.</p>}
      <div className="grid gap-4 md:grid-cols-2">{availability.courts.map(court => <div key={court.id} className="rounded-xl border border-[#dce5e8] bg-[#f7fafb] p-4"><div className="flex items-center justify-between gap-3 border-b border-[#dce5e8] pb-3"><h3 className="font-display text-lg font-bold text-[#16384d]">{court.name}</h3>{ranges.some(r => r.courtId === court.id) && <button className="text-sm text-primary underline" onClick={() => setRanges(ranges.filter(r => r.courtId !== court.id))}>Clear selection</button>}</div>{court.windows.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Closed on this operating date.</p>}{court.windows.map((window, wi) => { const grid = slots(window, court.occupied, availability.settings.intervalMinutes, now); const selected = ranges.find(r => r.courtId === court.id); return <div key={wi} className="mt-4"><p className="text-sm text-muted-foreground">{formatDate(window.opensAt)} – {formatDate(window.closesAt)} · {window.hourlyRate === null ? "Rate unavailable" : `${money(window.hourlyRate)}/hour`}</p><div className="mt-2 flex flex-wrap gap-2">{grid.map((slot, index) => { const active = selected?.window === wi && slot.start >= Date.parse(selected.start) && slot.end <= Date.parse(selected.end); return <button key={slot.start} type="button" disabled={!slot.available || window.hourlyRate === null} aria-pressed={!!active} onClick={() => { const next = selectRange(court.id, wi, window, grid, index, selected); if (next) setRanges([...ranges.filter(r => r.courtId !== court.id), next]); }} className="rounded-md border px-3 py-2 text-xs font-medium hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-35">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(slot.start))}</button>; })}</div></div>; })}</div>)}</div>
      {ranges.length > 0 && <div className="grid gap-5 border-t border-[#dce5e8] pt-5 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f28500]">Your selection</p><h3 className="font-display mt-1 text-xl font-bold text-[#16384d]">Review chosen times</h3><ul className="mt-3 space-y-2">{ranges.map(r => <li key={r.courtId} className="text-sm">{availability.courts.find(c => c.id === r.courtId)?.name} · {formatDate(r.start)} – {formatDate(r.end)} · {(Date.parse(r.end) - Date.parse(r.start)) / 60_000} min · {money(r.rate)}/hour</li>)}</ul><p className="font-bold">Estimated total: {total ? money(total) : "Unavailable"}</p>{!validRanges && <p className="text-sm text-muted-foreground">Each range must be at least {availability.settings.minimumMinutes} minutes and start in the future.</p>}</div><div className="md:min-w-52"><p className="text-sm text-[#718189]">Estimated total</p><p className="font-display text-2xl font-bold text-[#16384d]">{total ? money(total) : "Unavailable"}</p><Button className="mt-3 w-full" disabled={busy || !availability.configured || !validRanges || !total} onClick={() => void beginCheckout()}>{busy ? "Starting checkout…" : "Continue to checkout"}</Button></div></div>}</>}
    </section>}

          {/* GUIDE GRID */}
          <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
            <div className="relative min-h-[420px] overflow-hidden rounded-2xl md:col-span-2 md:row-span-2">
              <Photo src={IMAGES.overview} label="Players on court" className="absolute inset-0 h-full w-full" />
              <div className="absolute bottom-4 left-4 w-[min(300px,calc(100%-2rem))] rounded-2xl bg-[#0f2938] p-4 text-white shadow-xl">
                <div className="flex items-start justify-between gap-3"><p className="text-base font-semibold leading-tight">How booking<br />works</p><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#16384d]"><Ball className="h-5 w-5" /></span></div>
                <div className="mt-5 flex items-end justify-between"><p className="font-display text-4xl font-black text-[#ffad4c]">3 steps</p><p className="text-right text-xs leading-4 text-white/70">Reserve, pay,<br />get confirmed</p></div>
                <div aria-hidden="true" className="mt-3 flex h-12 items-end gap-[3px]">{Array.from({ length: 24 }, (_, i) => <span key={i} className={`flex-1 rounded-full ${i < 16 ? "bg-[#ffad4c]" : "bg-white/15"}`} style={{ height: "100%" }} />)}</div>
              </div>
            </div>
            <div className="rounded-2xl bg-[#ffad4c] p-6 text-[#16384d]"><Ball className="h-8 w-8" /><h3 className="font-display mt-4 text-2xl font-black uppercase leading-none">Pick your time</h3><p className="mt-3 text-xs leading-5">Choose a continuous range inside one opening window on either court.</p><a href="#booking" className={tileBtn}>See open times <span aria-hidden="true" className="ml-2">→</span></a></div>
            <div className="rounded-2xl bg-[#cfe3ec] p-6 text-[#16384d]"><Ball className="h-8 w-8" /><h3 className="font-display mt-4 text-2xl font-black uppercase leading-none">Pay with GCash</h3><p className="mt-3 text-xs leading-5">Pay the venue&apos;s GCash recipient, upload your proof, and staff confirm your booking.</p><a href="#track" className={tileBtn}>Track booking <span aria-hidden="true" className="ml-2">→</span></a></div>
          </div>
        </div>
      </section>

      {/* PLAY YOUR WAY */}
      <section id="open-plays" className="scroll-mt-4 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-7 sm:px-8">
          <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#16384d] text-[#ffad4c]"><Ball className="h-6 w-6" /></span><h2 className={sectionTitle}>Play your<br />way</h2></div>
          <div className="flex max-w-sm flex-col gap-4 text-xs leading-5 text-[#405966]"><p>Discover upcoming open plays, or reserve a court for your own group.</p><a href="/open-plays" className={darkBtn}>View open plays</a></div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-4 px-5 pb-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {playCards.map(c => <a key={c.label} href={c.href} className="group block"><div className="relative aspect-[3/4] overflow-hidden rounded-2xl"><Photo src={c.image} label={c.label} className="h-full w-full transition-transform duration-500 group-hover:scale-105" /><span className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm font-semibold text-[#16384d] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{c.label}<span aria-hidden="true">↗</span></span></div><p className="mt-2 text-xs font-medium text-[#405966]">{c.caption}</p></a>)}
        </div>
      </section>

      {/* TRACK */}
      <section id="track" className="relative isolate scroll-mt-4 bg-[#16384d] px-4 py-14 text-center text-white sm:px-6">
        <Guides />
        <h2 className="font-display mx-auto max-w-2xl text-[clamp(2.5rem,7vw,4.5rem)] font-black uppercase leading-[.85] tracking-tight text-[#ffad4c]">Track your<br />reservation</h2>
        <p className="mx-auto mt-5 max-w-sm text-xs leading-5 text-white/75">Use the tracking code and email from your request to see where your booking stands.</p>
        <div className="mx-auto mt-8 max-w-3xl rounded-2xl bg-white p-5 text-left text-[#17252e] sm:p-7">
          <form onSubmit={lookup} className="flex flex-wrap items-end gap-3"><label className={field}>Tracking code<Input aria-label="Tracking code" required maxLength={5} value={trackCode} onChange={e => setTrackCode(e.target.value)} /></label><label className={field}>Email<Input aria-label="Email" required type="email" value={trackEmail} onChange={e => setTrackEmail(e.target.value)} /></label><Button disabled={trackBusy} type="submit">{trackBusy ? "Checking…" : "Track"}</Button></form>
          {trackError && <p role="alert" className="mt-3 text-sm text-destructive">{trackError}</p>}
          {tracking && <div role="status" className="mt-5 space-y-2 border-t pt-4 text-sm"><p>Reservation: <strong className="capitalize">{tracking.status}</strong> · {formatDisplayDate(tracking.operatingDate)} · {money(tracking.total)}</p>{tracking.status === "pending" && <p>Pending review; not yet confirmed.</p>}{tracking.items.map((item, i) => <p key={i}>{item.court}: {formatDate(item.startsAt)} – {formatDate(item.endsAt)}</p>)}{tracking.payments.map((p, i) => <p key={i}>Payment: {p.method.toUpperCase()} · {p.status}{p.reviewReason && tracking.status === "rejected" ? ` · Reason: ${p.reviewReason}` : ""}</p>)}</div>}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#16384d] text-[#ffad4c]"><Ball className="h-6 w-6" /></span><h2 className={sectionTitle}>Quick answers<br />before you play</h2></div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-[#e7f0f3] p-6"><h3 className="font-bold text-[#16384d]">Do I need an account?</h3><p className="mt-2 text-sm leading-6 text-[#405966]">No. Book as a guest and track your request with your private link or tracking details.</p></div>
            <div className="rounded-2xl bg-[#fff0dc] p-6"><h3 className="font-bold text-[#16384d]">When is my booking confirmed?</h3><p className="mt-2 text-sm leading-6 text-[#405966]">Staff review your payment before confirming your reservation.</p></div>
          </div>
        </div>
      </section>

      {/* FIND US + FOOTER */}
      <section id="find-us" className="relative isolate scroll-mt-4 bg-[#16384d] px-4 py-16 text-center text-white sm:px-6">
        <Guides />
        <h2 className="font-display mx-auto max-w-3xl text-[clamp(2.5rem,7vw,4.5rem)] font-black uppercase leading-[.85] tracking-tight text-[#ffad4c]">Your neighborhood<br />court</h2>
        <p className="mx-auto mt-5 max-w-sm text-xs leading-5 text-white/75">Daylor Village, Abucayan, Balamban, Cebu. Better rallies, right where you live.</p>
        <a href="#booking" className="mt-7 inline-flex min-h-10 items-center rounded-md bg-white px-5 text-xs font-bold text-[#16384d] transition hover:bg-[#ffad4c]">Book a court</a>
      </section>
      <footer className="border-t border-white/10 bg-[#16384d] px-5 py-10 text-sm text-white/70 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row"><div><div className="flex items-center gap-3"><img src="/ethn-courts-mark.png" alt="" className="h-9 w-9 object-cover" /><span className="font-bold tracking-[.12em] text-white">ETHN <span className="text-[#f28500]">COURTS</span></span></div><p className="mt-4 max-w-xs leading-6 text-white/55">Your neighborhood court for better rallies in Balamban.</p></div><div><p className="font-bold text-white">Visit</p><p className="mt-3 text-white/60">Daylor Village<br />Abucayan, Balamban<br />Cebu, Philippines</p></div><div><p className="font-bold text-white">Explore</p><div className="mt-3 flex gap-4"><a href="/contact" className="hover:text-white">Contact</a><a href="/terms" className="hover:text-white">Terms</a><a href="/privacy" className="hover:text-white">Privacy</a></div></div></div></footer>
    </main></div>;
}