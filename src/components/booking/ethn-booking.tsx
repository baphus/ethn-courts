"use client";
import { TrackingSummary, type Tracking } from "@/components/booking/tracking-summary";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";
import HowItWorks from "@/components/landing/how-it-works";
import Faq from "@/components/landing/faq";
import CourtGallery from "@/components/landing/court-gallery";
import RallyCourt from "./rally-court";
import EthnHeroLogo from "./ethn-hero-logo";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { checkoutFailure, holdExpiry } from "./checkout-feedback";
import { BookingInvoice } from "@/components/booking/ethn-booking-invoice";
import EthnBookingReceipt from "./ethn-booking-receipt";
import type { CheckoutReceipt } from "@/lib/booking/ethn-receipt";
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, ClipboardList, Clock3, CreditCard, Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { priceItems, validateGuest } from "@/lib/booking/core";
import { manilaDateStr } from "@/lib/booking/slots";
import { acceptedDate, addDays, bookingDate, gridSlotCount, gridTimes, handoffRanges, toggleSlot, slotDate, slotEndDate, slots, validDate, type Window, type Occupied, type Range } from "./ethn-selection";
import { formatDisplayDate } from "@/lib/display-date";
import { availabilityCache } from "./ethn-availability-cache";
import { VENUE_ADDRESS, VENUE_MAP_EMBED, VENUE_MAP_LINK } from "@/lib/venue";

type Availability = { date: string; operatingDate: string; serverNow: string; configured: boolean; message: string | null; merchant: string | null; settings: { version: string; intervalMinutes: number; minimumMinutes: number; horizonDays: number }; courts: { id: string; name: string; description?: string | null; photoVersion?: string; windows: Window[]; occupied: Occupied[] }[] };
type DayAvailability = Pick<Availability, "date" | "configured" | "message" | "courts">;
type SharedAvailability = Omit<Availability, keyof DayAvailability>;
type MonthAvailability = SharedAvailability & { days: DayAvailability[] };
type Checkout = { checkoutId: string; total: string; expiresAt: string; intervalMinutes?: number; paymentMethods?: {id:string; name:string; instructions:string; qrAvailable:boolean; version:string}[]; acknowledgementRequired: boolean; items: { courtId: string; start: string; end: string; rate: string; minutes: number; amount: string }[] };
type OpenPlay = { title: string; description: string; eventUrl: string };
type Progress = { name: string; email: string; phone: string; reference: string; methodId: string; ack: boolean; openPlayEnabled: boolean; openPlay: OpenPlay };
const reclubMeet = /^https:\/\/reclub\.co\/m\/[A-Za-z0-9_-]+$/;
const validOpenPlay = ({ title, description, eventUrl }: OpenPlay) => Boolean(title.trim()) && title.trim().length <= 100 && description.length <= 500 && !title.includes("\0") && !description.includes("\0") && eventUrl.trim().length <= 256 && (!eventUrl.trim() || reclubMeet.test(eventUrl.trim()));
const emptyProgress: Progress = { name: "", email: "", phone: "", reference: "", methodId: "", ack: false, openPlayEnabled: false, openPlay: { title: "", description: "", eventUrl: "" } };
type Draft = { owner: string; checkout: Checkout; date: string; progress?: Progress; releaseRequested?: boolean; reservationId?: string; uploaded?: boolean; proofFile?: string; proofKey?: string; submitHash?: string; submitKey?: string };
type ReceiptRef = { checkoutId: string; submitKey: string };
type Result = CheckoutReceipt | { booked: true; trackingToken: string; code: string; openPlaySaved?: boolean };
const STORAGE = "ethn-checkout-v1";
const OWNER = "ethn-owner-v1";
const RECEIPT = "ethn-checkout-receipt-v1";
const formatTime = (time: number) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(time));
const pesos = (cents: bigint) => `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
const money = (s: string) => `₱${s}`;
const slotLabel = (count: number) => `${count} ${count === 1 ? "slot" : "slots"}`;
const slotDetail = (minutes: number, intervalMinutes?: number) => {
  const count = gridSlotCount(minutes, intervalMinutes);
  return count === undefined ? "" : ` · ${slotLabel(count)}`;
};
const rangeMinutes = ({ start, end }: Pick<Range, "start" | "end">) => (Date.parse(end) - Date.parse(start)) / 60_000;
const field = "grid gap-1.5 text-sm font-medium";
const statusStyles = {
  Available: "bg-[#dcf4e6] text-[#145c39] border-[#a7d9bb]",
  Selected: "bg-[#447244] text-white border-[#447244]",
  Unavailable: "bg-[#fde5e3] text-[#922f29] border-[#efbbb6]",
  Closed: "bg-[#eee7f8] text-[#603786] border-[#d6c3e8]",
  "Rate unavailable": "bg-[#fff0d5] text-[#805000] border-[#efcf93]",
} as const;

function Ball({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="7" r="1" fill="currentColor" /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="16.5" cy="11" r="1" fill="currentColor" />
      <circle cx="9.5" cy="16" r="1" fill="currentColor" /><circle cx="14.5" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function Guides() {
  return (
    <div aria-hidden="true" className="ethn-guides pointer-events-none absolute inset-0 -z-10 mx-auto grid max-w-7xl grid-cols-4 [&>*:last-child]:border-r">
      <span className="border-l border-dashed border-white/10" /><span className="border-l border-dashed border-white/10" /><span className="border-l border-dashed border-white/10" /><span className="border-l border-dashed border-white/10" />
    </div>
  );
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal });
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
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [restored, setRestored] = useState(false);
  const [progress, setProgress] = useState(emptyProgress);
  const [openPlayInfo, setOpenPlayInfo] = useState(false);
  const [openPlayError, setOpenPlayError] = useState("");
  const { name, email, phone, reference, methodId, ack, openPlayEnabled, openPlay } = progress;
  const [now, setNow] = useState(0);
  const [clockReady, setClockReady] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", toasted: false });
  const setError = useCallback((message: string) => setFeedback({ message, toasted: false }), []);
  const observedHold = useRef<ReturnType<typeof holdExpiry>["observation"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  // shortcut: preview is local until reload; add a checkout-authorized read only if restored previews are needed.
  const [proofPreview, setProofPreview] = useState<File>();
  const attachProofPreview = useCallback((image: HTMLImageElement | null) => {
    if (!image || !proofPreview) return;
    const url = URL.createObjectURL(proofPreview);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [proofPreview]);
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);
  const proofInput = useRef<HTMLInputElement>(null);
  const proofLabel = useId();
  useEffect(() => {
    if (!showUploadSuccess) return;
    const timeout = window.setTimeout(() => setShowUploadSuccess(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [showUploadSuccess]);
  const [methods, setMethods] = useState<{id:string; name:string; instructions:string; qrAvailable:boolean; version:string}[] | null>(null);
  const checkoutMethods = draft ? draft.checkout.paymentMethods ?? [] : methods;
  useEffect(() => { if (!bookingPage) return; const controller = new AbortController(); fetch("/api/ethn/payment-methods", { cache: "no-store", signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => setMethods(data.methods)).catch(() => { if (!controller.signal.aborted) setMethods([]); }); return () => controller.abort(); }, [bookingPage]);
  const [result, setResult] = useState<Result | null>(null);
  const [receiptRef, setReceiptRef] = useState<ReceiptRef | null>(null);
  const [receiptState, setReceiptState] = useState<"loading" | "error" | null>(null);
  const recoverReceipt = useCallback(async (reference: ReceiptRef, ownerToken: string, signal?: AbortSignal) => {
    setReceiptState("loading");
    try {
      const receipt = await post<CheckoutReceipt>("/api/checkout/receipt", { ...reference, ownerToken }, signal);
      if (!signal?.aborted) { setResult(receipt); setReceiptState(null); }
    } catch { if (!signal?.aborted) setReceiptState("error"); }
  }, []);
  const [trackCode, setTrackCode] = useState(""); const [trackEmail, setTrackEmail] = useState(""); const [tracking, setTracking] = useState<Tracking | null>(null);
  const [trackError, setTrackError] = useState(""); const [trackBusy, setTrackBusy] = useState(false);
  const lock = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (reviewing && !draft) reviewHeading.current?.focus(); }, [reviewing, draft]);
  const clock = useRef({ server: 0, monotonic: 0 });
  const sequence = useRef(0);
  const monthCache = useRef<ReturnType<typeof availabilityCache<DayAvailability, SharedAvailability>> | null>(null);
  const checkoutKeys = useRef<Record<string, string>>({});

  const save = (next: Draft) => { setDraft(next); sessionStorage.setItem(STORAGE, JSON.stringify(next)); };
  const finishCheckout = () => {
    monthCache.current?.clear();
    checkoutKeys.current = {}; setDraft(null); setProgress(emptyProgress); setRestored(false);
    setProofPreview(undefined); setShowUploadSuccess(false);
    sessionStorage.removeItem("ethn-checkout-keys-v1"); sessionStorage.removeItem(STORAGE);
  };
  function updateProgress(change: Partial<Progress>) {
    if (lock.current || draft?.releaseRequested) return;
    const next = { ...progress, ...change };
    setProgress(next);
    if (draft) {
      try { save({ ...draft, progress: next }); }
      catch { setError("Could not save checkout changes in this tab. Keep this page open."); }
    }
  }
  const load = useCallback(async (date?: string, fallback = false, handoff?: { raw: string; date: string | null }) => {
    const seq = ++sequence.current; setError("");
    const cache = monthCache.current ??= availabilityCache<DayAvailability, SharedAvailability>();
    try {
      let entry = date ? cache.get(date) : undefined;
      let fellBack = false;
      if (!entry) {
        setLoading(true); setClockReady(false);
        if (date && validDate(date)) {
          const month = date.slice(0, 7);
          const response = await fetch(`/api/ethn/availability?month=${month}`, { cache: "no-store" }).catch(() => null);
          if (response?.ok) {
            const snapshot: MonthAvailability = await response.json();
            if (seq !== sequence.current) return;
            cache.put(month, snapshot);
            entry = cache.get(date);
          }
        }
        if (!entry) {
          if (seq !== sequence.current) return;
          let response = await fetch(`/api/ethn/availability${date ? `?date=${encodeURIComponent(date)}` : ""}`, { cache: "no-store" });
          fellBack = response.status === 400 && fallback;
          if (fellBack) response = await fetch("/api/ethn/availability", { cache: "no-store" });
          if (!response.ok) throw new Error("UNAVAILABLE");
          entry = { data: await response.json() as Availability, monotonic: performance.now() };
        }
      }
      if (seq !== sequence.current) return;
      const { data, monotonic } = entry;
      clock.current = { server: Date.parse(data.serverNow), monotonic };
      const serverNow = clock.current.server + performance.now() - monotonic;
      const selected = handoff ? handoffRanges(handoff.raw, handoff.date, data, serverNow) : [];
      const accepted = acceptedDate(date, data.date, fellBack);
      setNow(serverNow); setClockReady(true); setAvailability(data); setChosenDate(accepted); setRanges(accepted ? selected || [] : []);
      if (accepted) setDateStatus(`Availability updated for ${bookingDate(accepted)}.`);
      if (fellBack) setError("That date is unavailable. Choose another date.");
      if (handoff && !selected) setError("Your selected times are no longer available or could not be verified. Please select your times again.");
      return true;
    } catch { if (seq === sequence.current) { setAvailability(null); setRanges([]); setError("Availability is unavailable. Please refresh and try again."); } }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [setError]);
  useEffect(() => {
    let savedDate: string | undefined;
    const controller = new AbortController();
    try {
      const receipt = bookingPage ? sessionStorage.getItem(RECEIPT) : null;
      const owner = receipt ? sessionStorage.getItem(OWNER) : null;
      if (receipt && owner) {
        const reference = JSON.parse(receipt) as ReceiptRef;
        if (typeof reference?.checkoutId === "string" && typeof reference.submitKey === "string") {
          setReceiptRef(reference);
          void recoverReceipt(reference, owner, controller.signal);
          return () => controller.abort();
        }
      }
      const stored = bookingPage ? sessionStorage.getItem(STORAGE) : null;
      if (stored) {
        const value = JSON.parse(stored) as Draft;
        if (value.owner && value.checkout?.checkoutId && validDate(value.date)) {
          setDraft(value); setProgress({ ...emptyProgress, ...value.progress }); setRestored(true); savedDate = value.date;
        }
      }
    } catch { /* Ignore invalid session draft. */ }
    const params = new URLSearchParams(window.location.search);
    const date = params.getAll("date").length === 1 ? params.get("date") : null;
    const raw = bookingPage && !savedDate && params.has("ranges") ? params.getAll("ranges").length === 1 ? params.get("ranges")! : "" : null;
    const defaultDate = manilaDateStr(new Date());
    if (!validDate(date)) setChosenDate(defaultDate);
    void load(savedDate ?? (validDate(date) ? date : defaultDate), true, raw !== null ? { raw, date: params.getAll("date").length === 1 ? date : null } : undefined);
    controller.abort();
  }, [load, bookingPage, recoverReceipt]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (clock.current.server) setNow(clock.current.server + performance.now() - clock.current.monotonic); }, 1000);
    return () => window.clearInterval(timer);
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

  const selectionSlots = gridSlotCount(ranges.reduce((minutes, range) => minutes + rangeMinutes(range), 0), availability?.settings.intervalMinutes);
  const validRanges = availability && ranges.length > 0 && ranges.length <= 100 && ranges.every(r => Date.parse(r.end) - Date.parse(r.start) >= availability.settings.minimumMinutes * 60_000 && Date.parse(r.start) >= now);
  let total = "0.00";
  try { if (ranges.length) total = pesos(priceItems(ranges.map(r => ({ rate: r.rate, minutes: (Date.parse(r.end) - Date.parse(r.start)) / 60_000 })))); } catch { total = ""; }
  const expired = draft ? now > 0 && now >= Date.parse(draft.checkout.expiresAt) : false;
  const proofUploadDisabled = busy || draft?.releaseRequested || expired || !clockReady || (draft?.checkout.acknowledgementRequired && !ack);
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

  function reviewSelection() {
    if (openPlayEnabled) {
      const orderedRanges = [...ranges].sort((a, b) => a.courtId.localeCompare(b.courtId) || a.start.localeCompare(b.start));
      const windows = new Map<string, { start: string; end: string }>();
      const continuous = orderedRanges.every(range => {
        const window = windows.get(range.courtId);
        if (window && window.end !== range.start) return false;
        windows.set(range.courtId, { start: window?.start ?? range.start, end: range.end });
        return true;
      }) && new Set(Array.from(windows.values(), window => `${window.start}/${window.end}`)).size === 1;
      if (!continuous) { setOpenPlayError("Open Plays need one continuous time shared by every selected court. Turn off Open Play or change your selection."); return; }
      if (!validOpenPlay(openPlay)) { setOpenPlayError("Enter an Open Play title. Reclub link is optional; when provided, use a direct event link. Notes are optional (up to 500 characters)."); return; }
    }
    setOpenPlayError(""); setError(""); setReviewing(true);
  }

  async function beginCheckout() {
    if (lock.current) return;
    if (!validateGuest({ kind: "online", name, email, phone })) { setError("Enter a full name, valid email, and contact number."); return; }
    if (!reviewing || !availability || !availability.configured || !clockReady || !validRanges || ranges.some(r => Date.parse(r.start) < clock.current.server + performance.now() - clock.current.monotonic) || !total) { setError("Your selected times are no longer valid. Return to slots and choose again."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      let owner = sessionStorage.getItem(OWNER);
      if (!owner) { owner = crypto.randomUUID(); sessionStorage.setItem(OWNER, owner); }
      const payload = { date: chosenDate, ranges: ranges.map(({ courtId, start, end }) => ({ courtId, start, end })).sort((a, b) => a.courtId.localeCompare(b.courtId) || a.start.localeCompare(b.start)), displayedTotal: total, displayedVersion: availability.settings.version };
      const fingerprint = JSON.stringify(payload);
      const storedKeys = JSON.parse(sessionStorage.getItem("ethn-checkout-keys-v1") || "{}");
      const idempotencyKey = checkoutKeys.current[fingerprint] ?? storedKeys[fingerprint] ?? crypto.randomUUID();
      checkoutKeys.current[fingerprint] = idempotencyKey;
      sessionStorage.setItem("ethn-checkout-keys-v1", JSON.stringify({ ...storedKeys, [fingerprint]: idempotencyKey }));
      const checkout = await post<Checkout>("/api/checkout", { ownerToken: owner, idempotencyKey, ...payload });
      if (Date.parse(checkout.expiresAt) <= clock.current.server + performance.now() - clock.current.monotonic) {
        delete storedKeys[fingerprint];
        sessionStorage.setItem("ethn-checkout-keys-v1", JSON.stringify(storedKeys));
        delete checkoutKeys.current[fingerprint];
        setError(`This hold expired. If you already paid, contact the venue with checkout ID ${checkout.checkoutId} before paying again. Otherwise, confirm again for a new hold.`);
        return;
      }
      const checkoutProgress = { ...progress, ack: false };
      setProgress(checkoutProgress); setRestored(false); setReviewing(false);
      try { save({ owner, checkout, date: chosenDate, progress: checkoutProgress }); }
      catch { setFeedback({ message: "This checkout could not be saved in your browser. Keep this page open.", toasted: true }); }
      const serverNow = clock.current.server + performance.now() - clock.current.monotonic;
      setNow(serverNow);
      if (Date.parse(checkout.expiresAt) <= serverNow) {
        toast.warning("This checkout hold has already expired.");
      } else {
        toast.success("Your selected times are temporarily held.");
      }
    } catch (e) {
      if (e instanceof Error && ["SLOT_TAKEN", "COURT_UNAVAILABLE", "CLOSED"].includes(e.message)) {
        monthCache.current?.clear();
        setReviewing(false);
        if (await load(chosenDate)) setError("Those times are no longer available. Choose new times.");
        requestAnimationFrame(() => document.getElementById("court-availability")?.focus());
      } else reportFailure("Slot hold", e);
    } finally { lock.current = false; setBusy(false); }
  }
  async function leaveCheckout() {
    if (!draft || lock.current) return;
    if (!draft.releaseRequested && !window.confirm("Release your held times and leave checkout? If you already paid, stay and submit your proof or contact the venue first.")) return;
    lock.current = true; setBusy(true); setError("");
    try {
      try { save({ ...draft, releaseRequested: true }); } catch { /* Release is still possible without browser storage. */ }
      await post("/api/checkout/release", { ownerToken: draft.owner, checkoutId: draft.checkout.checkoutId });
      try { finishCheckout(); }
      catch { toast.warning("Hold released, but this browser could not clear the saved checkout."); }
      await load(draft.date, true);
    } catch {
      setError("Could not confirm the hold was released. Retry leaving checkout. If you paid or already submitted proof, contact the venue before paying again.");
    } finally { lock.current = false; setBusy(false); }
  }

  async function upload(file: File) {
    if (!draft || proofUploadDisabled || lock.current) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP image up to 5 MiB."); return; }
    lock.current = true; setBusy(true); setUploading(true); setError("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) throw new Error("NOT_CONFIGURED");
      const signature = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
      const retry = !draft.uploaded && draft.proofFile === signature;
      const proofKey = (retry && draft.proofKey) || crypto.randomUUID();
      const next = { ...draft, reservationId: retry ? draft.reservationId : undefined, proofFile: signature, proofKey, uploaded: false };
      setProofPreview(undefined); setShowUploadSuccess(false);
      save(next);
      const reservation = await post<{ reservationId: string; path: string; token: string }>("/api/checkout/proofs", { ownerToken: draft.owner, checkoutId: draft.checkout.checkoutId, idempotencyKey: proofKey, mimeType: file.type, byteSize: file.size, ...(draft.checkout.acknowledgementRequired ? { acknowledgedTotal: draft.checkout.total } : {}) });
      const reserved = { ...next, reservationId: reservation.reservationId }; save(reserved);
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      const uploaded = await client.storage.from("proofs").uploadToSignedUrl(reservation.path, reservation.token, file, { contentType: file.type }).catch(() => null);
      if (!uploaded || uploaded.error) throw new Error("UPLOAD_UNCERTAIN");
      try { save({ ...reserved, uploaded: true }); }
      catch { setFeedback({ message: "Proof was uploaded, but this browser could not save the latest checkout state. Keep this page open.", toasted: true }); }
      setProofPreview(file);
      setShowUploadSuccess(true);
    } catch (e) {
      reportFailure("Payment proof upload", e, e instanceof Error && e.message === "UPLOAD_UNCERTAIN" ? "Upload could not be confirmed. You may submit this proof for verification, or choose the screenshot again before the hold expires." : friendly(e));
    }
    finally { lock.current = false; setBusy(false); setUploading(false); }
  }
  async function submit() {
    if (!draft?.reservationId || draft.releaseRequested || lock.current || (draft.checkout.acknowledgementRequired && !ack)) return;
    if (!validateGuest({ kind: "online", name, email, phone }) || !checkoutMethods?.some(m => m.id === methodId)) { setError("Enter your contact details and choose a payment method."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const payload = { ownerToken: draft.owner, checkoutId: draft.checkout.checkoutId, reservationId: draft.reservationId, customer: { name: name.trim(), email: email.trim(), phone: phone.trim() }, paymentMethodId: methodId, ...(reference.trim() ? { reference: reference.trim() } : {}), ...(draft.checkout.acknowledgementRequired ? { acknowledgedTotal: draft.checkout.total } : {}), ...(openPlayEnabled ? { openPlay: { title: openPlay.title.trim(), description: openPlay.description, eventUrl: openPlay.eventUrl.trim() } } : {}) };
      if (openPlayEnabled && !validOpenPlay(openPlay)) { setError("Enter an Open Play title. Reclub link is optional; when provided, use a direct event link. Notes are optional (up to 500 characters)."); return; }
      const hash = await digest(JSON.stringify(payload));
      const key = draft.submitHash === hash && draft.submitKey ? draft.submitKey : crypto.randomUUID();
      save({ ...draft, submitHash: hash, submitKey: key });
      const submitted = await post<Result>("/api/checkout/submit", { ...payload, idempotencyKey: key });
      const receiptReference = { checkoutId: draft.checkout.checkoutId, submitKey: key };
      setReceiptRef(receiptReference);
      setResult(submitted.booked ? submitted : { booked: false, checkoutId: receiptReference.checkoutId });
      try { sessionStorage.setItem(RECEIPT, JSON.stringify(receiptReference)); }
      catch { toast.warning("This tab could not save your submission reference. Keep this page open."); }
      try { finishCheckout(); }
      catch { setError("Your proof was submitted, but this browser could not clear the saved checkout. Do not submit it again."); }
      if (submitted.booked) {
        toast.success("Payment proof submitted for review.");
        await recoverReceipt(receiptReference, draft.owner);
      } else toast.info("Payment proof recorded. Contact the venue; your court is not booked.");
    } catch (e) {
      reportFailure("Payment proof submission", e, e instanceof Error && e.message === "STORAGE_UNAVAILABLE"
        ? "Could not verify your screenshot. Do not pay again. Retry submission or contact the venue if your hold expires."
        : friendly(e));
    }
    finally { lock.current = false; setBusy(false); }
  }
  function anotherBooking() {
    try { sessionStorage.removeItem(RECEIPT); }
    catch { toast.warning("This browser could not clear the saved receipt."); }
    setReceiptRef(null); setReceiptState(null); setResult(null);
    void load(manilaDateStr(new Date()), true);
  }

  function retryReceipt() {
    try {
      const owner = sessionStorage.getItem(OWNER);
      if (receiptRef && owner) { void recoverReceipt(receiptRef, owner); return; }
    } catch { /* Browser storage is unavailable. */ }
    toast.error("This tab cannot access the saved receipt. Contact the venue if you need help.");
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault(); if (trackBusy) return; setTrackBusy(true); setTrackError(""); setTracking(null);
    try { setTracking(await post<Tracking>("/api/checkout/track", { code: trackCode.trim().toUpperCase(), email: trackEmail.trim() })); }
    catch (err) { setTrackError(friendly(err)); } finally { setTrackBusy(false); }
  }

  const sectionTitle = "font-display text-4xl font-black uppercase leading-[.85] tracking-tight text-[#447244] sm:text-5xl";
  const sectionCta = "inline-flex min-h-12 items-center justify-center self-start rounded-md px-6 py-3 text-base font-bold transition-colors";
  const tileBtn = "mt-5 inline-flex min-h-9 items-center rounded-md px-3 text-xs font-bold transition-colors public-cta-secondary";
  const card = "rounded-2xl border border-[#dce5e8] bg-white p-5 shadow-sm sm:p-7";

  const contactFields = <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Full name<Input required maxLength={200} value={name} onChange={e => updateProgress({ name: e.target.value })} autoComplete="name" /></label><label className={field}>Email<Input required type="email" maxLength={254} value={email} onChange={e => updateProgress({ email: e.target.value })} autoComplete="email" /></label><label className={field}>Contact number<Input required type="tel" maxLength={50} value={phone} onChange={e => updateProgress({ phone: e.target.value })} autoComplete="tel" /></label></div>;

  return <div className={`min-h-screen bg-[#447244] text-[#17252e]${ranges.length && !reviewing && !draft && !result ? " max-lg:[&+footer]:pb-[calc(9rem+env(safe-area-inset-bottom))] max-lg:[&+footer_.developer-promo]:hidden" : ""}`}>
    <style>{`
      @keyframes ethn-court{from{transform:translateY(45%);opacity:0}to{transform:none;opacity:1}}
      @keyframes ethn-fade{from{opacity:0}to{opacity:1}}
      @keyframes ethn-trail-shot{0%{clip-path:inset(0 100% 0 0)}14%,100%{clip-path:inset(0)}86%{opacity:1}96%,100%{opacity:0}}
      @keyframes ethn-ball-shot{0%{opacity:0;transform:translate(-475px,80px)}4%{opacity:1}14%,100%{transform:none}86%{opacity:1}96%,100%{opacity:0}}
      @media (prefers-reduced-motion:no-preference){
        .ethn-hero{--wordmark-duration:.35s;--shot-duration:.48s;--after-shot:calc(var(--wordmark-duration) + var(--shot-duration));--shot-ease:cubic-bezier(.2,.8,.2,1)}
        .ethn-logo-wordmark{animation:ethn-fade var(--wordmark-duration) backwards}
        .ethn-logo-trail{transform-box:fill-box;--shot:ethn-trail-shot}
        .ethn-logo-ball{--shot:ethn-ball-shot}
        .ethn-hero :is(.ethn-logo-trail,.ethn-logo-ball){animation:var(--shot) 3.5s ease-in var(--wordmark-duration) infinite backwards}
        .ethn-hero>.ethn-guides,.ethn-fade{animation:ethn-fade .45s var(--after-shot) backwards}
        .ethn-court{animation:ethn-court .65s var(--after-shot) var(--shot-ease) backwards}
        .ethn-fade:focus-within{animation:none}
      }
    `}</style>
    <main>
      {!bookingPage && <>{/* HERO */}
      <section className="ethn-hero relative isolate -mt-14 overflow-hidden bg-[#447244] px-4 pt-[calc(3.5rem+.75rem)] pb-16 text-center text-white sm:-mt-24 sm:px-6 sm:pt-[calc(6rem+.75rem)] sm:pb-24">
        <img src="/court-gallery/c9Uh1G3i.jpg" alt="" fetchPriority="high" className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-[center_58%] sm:object-[center_55%]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(20,69,36,.94)_0%,rgba(38,94,49,.76)_34%,rgba(45,105,55,.35)_58%,rgba(30,76,40,.3)_100%)]" />
        <Guides />


        <h1 className="relative z-10 mx-auto mt-4 w-[min(80%,38rem)]">
          <EthnHeroLogo />
        </h1>

        <div className="ethn-fade relative z-20 mx-auto mt-4 flex items-center justify-center gap-2 sm:gap-3">
          <a href="/book" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg public-cta-primary public-cta-on-dark px-3 text-xs font-extrabold shadow-[0_5px_0_#a55500] transition hover:shadow-[0_3px_0_#a55500] motion-safe:hover:translate-y-[2px] sm:min-h-12 sm:w-auto sm:px-7 sm:text-sm">Book a court <span aria-hidden="true" className="ml-2">→</span></a>
          <a href="/open-plays" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg public-cta-secondary public-cta-on-dark [--public-cta-surface:var(--color-cocoa)] px-3 text-xs font-bold transition-[filter] hover:brightness-90 active:brightness-75 sm:min-h-12 sm:w-auto sm:px-7 sm:text-sm">See open plays</a>
        </div>

        <div className="ethn-court pointer-events-none mx-auto -mt-24 grid h-[min(62vw,22rem)] w-full max-w-5xl place-items-center sm:-mt-36 sm:h-[min(34vw,26rem)]">
          <img src="/pickleball_centered_animated.svg" alt="Isometric pickleball court with two paddles rallying a ball" className="h-full w-full object-contain" />
        </div>
      </section>

      {/* BOOK INTRO BAND */}
      <section className="bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-7 sm:px-8">
          <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#447244] text-[#ffad4c]"><Ball className="h-6 w-6" /></span><h2 className={sectionTitle}>Book your<br />court</h2></div>
          <div className="flex max-w-sm flex-col gap-4 text-[11px] leading-5 text-[#405966]"><a href="/book" className={`${sectionCta} public-cta-primary`}><CalendarDays aria-hidden="true" className="mr-2 size-4" />Check availability</a><p>Pick an open time on either court, pay using an available method, and staff confirm your reservation.</p></div>
        </div>
      </section>

      </>}
      {/* BOOKING + GUIDE GRID */}
      <section id="booking" className="relative isolate scroll-mt-28 pt-20 sm:scroll-mt-32 sm:pt-24 bg-[#447244] px-4 pb-4 sm:px-6">
        <Guides />
        <div className="mx-auto max-w-7xl space-y-4">
    {feedback.message && (!bookingPage || reviewing || draft || result || !ranges.length || loading) && <p role={feedback.toasted ? undefined : "alert"} className="rounded-2xl border border-destructive/30 bg-white p-4 text-sm text-foreground">{feedback.message}</p>}
    {bookingPage && <ol aria-label="Booking progress" role="list" className={`grid w-full grid-cols-4 py-3 text-white ${receiptRef || result ? "mx-auto max-w-3xl" : draft || (reviewing && availability) ? "mx-auto max-w-2xl" : ""}`}>
      {[["Date & time", CalendarDays], ["Review", ClipboardList], ["Payment", CreditCard], ["Result", CircleCheck]].map(([label, Icon], index) => {
        const current = receiptRef || result ? 3 : draft ? 2 : reviewing ? 1 : 0;
        const completed = index < current;
        const StepIcon = completed ? Check : Icon as typeof CalendarDays;
        return <li key={label as string} aria-current={index === current ? "step" : undefined} className="relative flex min-w-0 flex-col items-center text-center">
          {index < 3 && <span aria-hidden="true" className={`absolute left-1/2 top-5 h-0.5 w-full ${completed ? "bg-white" : "bg-white/40"}`} />}
          <span className={`relative grid size-10 place-items-center rounded-full border-2 ${index === current ? "border-[#ffad4c] bg-[#ffad4c] text-[#1b3520]" : completed ? "border-white bg-white text-[#447244]" : "border-white/60 bg-[#447244] text-white"}`}>
            <StepIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="mt-2 block px-1 text-xs font-bold leading-tight sm:text-sm">{label as string}</span>
          <span className="sr-only">{completed ? "Completed" : index === current ? "Current" : "Upcoming"}</span>
        </li>;
      })}
    </ol>}
    {bookingPage && (receiptRef || result) ? (
      result?.booked && "receipt" in result ? <EthnBookingReceipt receipt={result.receipt} trackingToken={result.trackingToken} code={result.code} openPlaySaved={result.openPlaySaved} onAnotherBooking={anotherBooking} /> :
        <section className="mx-auto w-full max-w-3xl space-y-3 rounded-2xl border bg-white p-6 text-ink">
          {result && !result.booked ? <>
            <h2 className="text-xl font-bold">Not booked</h2>
            <p className="text-sm">Your payment proof was recorded, but your court is not booked. Do not pay again.</p>
            <p className="text-sm"><a className="underline" href="/contact">Contact the venue</a> with your payment receipt and checkout ID: <strong className="break-all">{result.checkoutId}</strong>.</p>
            <Button variant="outline" className="public-cta-secondary" onClick={anotherBooking}>Choose another time</Button>
          </> : <>
            <h2 className="text-xl font-bold">Booking receipt</h2>
            {receiptState === "error" ? <>
              <p role="alert" className="text-sm">Could not load this submission. Do not pay or submit proof again. Retry loading, or <a className="underline" href="/contact">contact the venue</a> with checkout ID <strong className="break-all">{receiptRef?.checkoutId}</strong>.</p>
              {result?.booked && <p className="text-sm">Tracking code: <strong>{result.code}</strong> · <a className="underline" href={`/checkout/track/${result.trackingToken}`}>View status</a></p>}
              <Button type="button" className="public-cta-primary" onClick={retryReceipt}>Retry loading receipt</Button>
              <Button type="button" variant="outline" className="public-cta-secondary ml-2" onClick={anotherBooking}>Return to booking</Button>
            </> : <p role="status" className="text-sm">Loading your submission…</p>}
          </>}
        </section>
    ) : bookingPage && draft ? <section className="mx-auto grid w-full max-w-6xl gap-4 rounded-2xl border border-[#d5e2ce] bg-[#fffdf7] p-4 text-[#17252e] shadow-sm sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2"><h2 className="font-display text-3xl font-bold text-[#17252e]">Payment &amp; proof</h2><p className="rounded-lg border border-[#f2d8b4] bg-[#fff0dc] px-4 py-3 text-sm font-bold text-[#8a4a00]">{!clockReady ? "Time unavailable; refresh availability" : expired ? "Hold expired" : `Hold remaining ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</p></div>
      <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-2">{restored && <p className="rounded-lg bg-[#edf3e8] p-3 text-sm">Checkout restored in this tab. Refreshing does not reset your hold timer. If you already paid, do not pay again.</p>}
      {!clockReady && <Button variant="outline" className="public-cta-secondary mx-auto flex" disabled={loading} onClick={() => void load()}>Refresh server time</Button>}
      <BookingInvoice heading="Booking summary" date={draft.date} total={draft.checkout.total} totalLabel="Total due" items={draft.checkout.items.map(item => ({ court: availability?.courts.find(c => c.id === item.courtId)?.name ?? `Court ${item.courtId}`, startsAt: item.start, endsAt: item.end, durationMinutes: item.minutes, intervalMinutes: draft.checkout.intervalMinutes, hourlyRate: item.rate, amount: item.amount }))} />
      </div><div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">{draft.checkout.acknowledgementRequired && <label className="flex gap-2 rounded-lg border border-primary p-4 text-sm"><input type="checkbox" checked={ack} disabled={busy || draft.releaseRequested} onChange={e => updateProgress({ ack: e.target.checked })} /><span>Price or settings changed. I acknowledge the updated total of {money(draft.checkout.total)}.</span></label>}
      {draft.releaseRequested && <p role="status" className="rounded-lg bg-[#edf3e8] p-4 text-sm">Release not confirmed yet. Retry leaving checkout. Do not send another payment.</p>}
      {clockReady && !expired && !draft.releaseRequested && <p className="text-sm">Pay, upload your screenshot, and submit it before the hold timer ends. If you don’t have enough time to finish, don’t send payment.</p>}
      {expired && !draft.releaseRequested && <p className="rounded-lg bg-[#edf3e8] p-4 text-sm">Your hold expired and your slots are no longer reserved. If you already paid, do not pay again. {draft.reservationId && "If your screenshot uploaded, submit it below. "}<a className="underline" href="/contact">Contact the venue</a> with your receipt and checkout ID: <strong className="break-all">{draft.checkout.checkoutId}</strong>.</p>}
      <fieldset className="space-y-3" disabled={busy || draft.releaseRequested}><legend className="mb-3 text-lg font-bold text-[#17252e]">Payment method</legend>{checkoutMethods === null ? <p className="text-sm">Loading payment methods…</p> : checkoutMethods.length === 0 ? <p role="alert" className="text-sm">Payment methods are unavailable. Refresh or contact the venue before paying.</p> : <div className="grid gap-2">{checkoutMethods.map(m => <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-semibold transition ${methodId === m.id ? "border-[#447244] bg-[#edf3e8] text-[#17252e]" : "border-[#d5e2ce] bg-white text-[#17252e]"}`}><input type="radio" name="payment-method" value={m.id} checked={methodId === m.id} onChange={e => updateProgress({ methodId: e.target.value })} className="size-4 accent-[#447244]" />{m.name}</label>)}</div>}{clockReady && !expired && !draft.releaseRequested && checkoutMethods?.filter(m => m.id === methodId).map(m => <div key={m.id} className="rounded-xl border border-[#d5e2ce] bg-[#edf3e8] p-4 text-sm text-[#17252e]"><p className="whitespace-pre-wrap break-words">{m.instructions}</p>{m.qrAvailable && <div className="mt-4 flex flex-col items-center gap-3"><img src={`/api/ethn/payment-methods/${encodeURIComponent(m.id)}/qr?v=${encodeURIComponent(m.version)}`} alt={`${m.name} payment QR code`} className="h-auto max-h-64 w-full max-w-[320px] rounded-lg bg-white p-2 object-contain" /><a href={`/api/ethn/payment-methods/${encodeURIComponent(m.id)}/qr?v=${encodeURIComponent(m.version)}`} download className="public-cta-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-bold transition-colors"><Download className="size-4" aria-hidden="true" /> Download QR</a></div>}<p className="mt-3">Confirm payment details with the venue before paying.</p></div>)}</fieldset>
      <section className="relative rounded-xl border border-[#d5e2ce] bg-white p-4 sm:p-5">
        <div className={`space-y-4${uploading ? " invisible" : ""}`}>
          <h3 className="text-lg font-bold text-[#17252e]">Payment proof</h3>
          <label className={`${field} text-left text-[#17252e]`}>Payment reference (optional)<Input className="min-h-11 border-[#a7c5a0] bg-white focus-visible:ring-[#447244]" maxLength={200} value={reference} disabled={busy || draft.releaseRequested} onChange={e => updateProgress({ reference: e.target.value })} /></label>
          <div className={field}>
            <p id={proofLabel}>Payment screenshot (JPG, PNG or WebP, up to 5 MiB)</p>
            <input ref={proofInput} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={proofUploadDisabled} onChange={e => {
              const screenshot = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (screenshot) void upload(screenshot);
            }} />
            <div className="flex flex-wrap items-center gap-3">
              {draft.uploaded && proofPreview && <img ref={attachProofPreview} alt="Uploaded payment screenshot" className="size-20 rounded-lg border border-[#d5e2ce] object-contain" />}
              {draft.uploaded && <CircleCheck className="size-5 text-[#447244]" role="img" aria-label="Upload complete" />}
              <Button type="button" variant="outline" className="public-cta-secondary min-h-12" disabled={proofUploadDisabled} aria-describedby={proofLabel} onClick={() => proofInput.current?.click()}>{draft.uploaded ? "Replace photo" : "Browse files"}</Button>
            </div>
          </div>
          {!draft.uploaded && <p role="status" className="text-sm text-[#17252e]">{draft.reservationId ? "Upload not confirmed. You can submit for verification." : expired ? "This hold expired. New screenshots can’t be uploaded." : draft.checkout.acknowledgementRequired && !ack ? "Acknowledge the updated total before choosing a screenshot." : "Choose a screenshot to upload it automatically."}</p>}
        </div>
        <p role="status" className={showUploadSuccess && draft.uploaded && !uploading ? "mt-3 text-sm font-medium text-[#447244]" : "sr-only"}>{showUploadSuccess && draft.uploaded && !uploading ? "Screenshot uploaded." : ""}</p>
        {uploading && <div className="absolute inset-0 grid place-content-center gap-1 rounded-xl bg-white text-center"><LoadingAnimation label="Uploading screenshot" /><p aria-hidden="true" className="text-sm font-semibold">Uploading screenshot…</p></div>}
      </section>
      <section className="rounded-xl border border-[#d5e2ce] bg-white p-4 text-sm"><h3 className="font-semibold text-[#17252e]">Contact details (edit if needed)</h3><p className="mt-2 text-[#17252e]">Checkout details are saved in this tab so you can refresh and continue.</p><fieldset disabled={busy || draft.releaseRequested} className="mt-4 text-left [&_input]:min-h-11 [&_input]:border-[#a7c5a0] [&_input]:bg-white [&_label]:text-[#17252e]">{contactFields}</fieldset></section>
      <div className="flex flex-wrap justify-center gap-3 border-t border-[#d5e2ce] pt-5"><Button className="public-cta-primary" disabled={busy || draft.releaseRequested || !draft.reservationId || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void submit()}>{busy ? "Please wait…" : expired ? "Record late payment evidence" : "Submit for review"}</Button><Button variant="outline" className="public-cta-secondary" disabled={busy} onClick={() => void leaveCheckout()}>{draft.releaseRequested ? "Retry leaving checkout" : "Leave checkout"}</Button></div>
    </div></section> : bookingPage && reviewing && availability ? <form className="mx-auto grid w-full max-w-6xl gap-4 rounded-2xl border border-[#d5e2ce] bg-[#fffdf7] p-4 shadow-sm sm:p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]" onSubmit={e => { e.preventDefault(); void beginCheckout(); }}>
      <div className="lg:col-span-2"><h2 ref={reviewHeading} tabIndex={-1} className="font-display text-3xl font-bold text-[#447244] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]">Review your selection</h2><p className="mt-2 text-sm text-[#405966]">Your times are not held yet. Confirm below to hold them while you complete payment.</p></div>
      <div className="space-y-3 lg:col-start-2 lg:row-start-2">{total ? <BookingInvoice heading="Booking summary" date={chosenDate} total={total} totalLabel="Estimated total" items={ranges.map(r => ({ court: availability.courts.find(c => c.id === r.courtId)?.name ?? r.courtId, startsAt: r.start, endsAt: r.end, durationMinutes: rangeMinutes(r), intervalMinutes: availability.settings.intervalMinutes, hourlyRate: r.rate, amount: pesos(priceItems([{ rate: r.rate, minutes: rangeMinutes(r) }])) }))} /> : <p className="text-sm text-[#405966]">Booking price unavailable.</p>}

      <p className="text-xs text-[#405966]">Final amount confirmed at checkout.</p></div>
      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2"><div className="rounded-xl border border-[#d5e2ce] bg-white p-4 sm:p-5"><h3 className="mb-3 text-lg font-bold text-[#294d2e]">Your contact details</h3><div className="text-left [&_input]:min-h-11 [&_input]:border-[#a7c5a0] [&_input]:bg-white [&_label]:text-[#294d2e]">{contactFields}</div></div>

      {!validRanges && <p role="status" className="text-sm text-destructive">Selected times are no longer valid. Return to slots and choose again.</p>}
      <div className="flex flex-wrap gap-3"><Button type="submit" className="public-cta-primary" disabled={busy || !clockReady || !availability.configured || !validRanges || !total}>{busy ? "Starting checkout…" : "Confirm and hold"}</Button><Button type="button" variant="outline" className="public-cta-secondary" disabled={busy} onClick={() => { setReviewing(false); setError(""); requestAnimationFrame(() => document.getElementById("court-availability")?.focus()); }}>Back to slots</Button></div>
    </div></form> : <div className={`grid items-start gap-4 ${ranges.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]" : ""}`}><section className={`min-w-0 space-y-3 ${card}`}>
      <p id={`${dateId}-help`} className="sr-only">Times after midnight may appear under the previous booking date. A time range that crosses midnight shows the next day’s date.</p>
      <div className="mx-auto w-full max-w-sm text-center">
        <p className="mb-2 block text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Booking date</p>
        <div className="flex items-center justify-center gap-2">
          <Button type="button" variant="outline" aria-label="Previous day" className="h-11 w-11 shrink-0 border-[#447244] bg-white p-0 text-[#447244] hover:bg-[#edf3e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" disabled={loading || busy || !minDate || !maxDate || !previousDate || previousDate < minDate || previousDate > maxDate} onClick={() => changeDate(previousDate)}><ChevronLeft aria-hidden="true" className="size-5" /></Button>
          <div className="min-w-0 flex-1 space-y-2">
            <button type="button" onClick={openDatePicker} aria-describedby={`${dateId}-help`} disabled={loading || busy} aria-label={`Choose booking date${validDate(chosenDate) ? `, ${bookingDate(chosenDate)}` : ""}`} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#a7c5a0] bg-white px-2 py-2 font-semibold text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244] disabled:opacity-50"><CalendarDays aria-hidden="true" className="size-4 shrink-0" /><span>{validDate(chosenDate) ? bookingDate(chosenDate) : "Choose date"}</span></button>
            <Input ref={dateInput} id={dateId} aria-label="Booking date" aria-describedby={`${dateId}-help`} tabIndex={dateFallback ? 0 : -1} className={dateFallback ? "min-h-11 w-full border-[#a7c5a0] bg-white text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" : "pointer-events-none absolute h-px w-px opacity-0"} type="date" value={chosenDate} min={minDate} max={maxDate} disabled={loading || busy} onChange={e => changeDate(e.target.value)} />
          </div>
          <Button type="button" variant="outline" aria-label="Next day" className="h-11 w-11 shrink-0 border-[#447244] bg-white p-0 text-[#447244] hover:bg-[#edf3e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" disabled={loading || busy || !minDate || !maxDate || !nextDate || nextDate < minDate || nextDate > maxDate} onClick={() => changeDate(nextDate)}><ChevronRight aria-hidden="true" className="size-5" /></Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{dateStatus}</p>
      {loading ? <LoadingAnimation label="Loading availability" className="py-6" /> : !availability ? <div className="space-y-3"><p className="text-sm">Availability is unavailable.</p><Button className="public-cta-primary" onClick={() => void load(chosenDate || undefined)}>Retry availability</Button></div> : !chosenDate ? <p className="rounded-lg bg-[#edf3f5] p-4 text-sm text-[#405966]">Choose a date to see available times.</p> : <>{!availability.configured && <p className="rounded-lg bg-muted p-4 text-sm">{availability.message || "Booking and payment are not configured yet."}</p>}{(availability.courts.length === 0 || availability.courts.every(c => c.windows.length === 0)) && <p className="py-6 text-sm text-muted-foreground">Courts are closed on this date.</p>}
      {availability.courts.some(c => c.windows.length > 0) && gridTimes(availability.courts.flatMap(c => c.windows), availability.settings.intervalMinutes, now).length === 0 && <p role="status" className="py-4 text-sm text-[#405966] text-center"><EmptyIcon /> No upcoming slots for this date.</p>}
      {bookingPage && ranges.length === 0 && <p className="text-sm font-medium text-[#405966]">0 slots selected</p>}
      {bookingPage && <section className="rounded-xl border border-[#d5e2ce] bg-white p-4 sm:p-5"><div className="flex items-center gap-2"><label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-[#294d2e]"><input type="checkbox" checked={openPlayEnabled} disabled={busy} onChange={e => { setOpenPlayError(""); updateProgress({ openPlayEnabled: e.target.checked }); }} className="size-5 accent-[#447244]" />Hosting an Open Play?</label><button type="button" aria-label="About public Open Plays" aria-expanded={openPlayInfo} aria-controls="open-play-info" onClick={() => setOpenPlayInfo(value => !value)} className="grid size-11 shrink-0 place-items-center rounded-full text-[#447244] hover:bg-[#edf3e8] focus-visible:outline-2 focus-visible:outline-[#447244]">ⓘ</button></div><p hidden={!openPlayInfo} id="open-play-info" className="mt-2 rounded-lg bg-[#edf3e8] p-3 text-sm text-[#405966]">After your booking is confirmed, we’ll publish this Open Play on our site so other players can find and join it via Reclub. Notes are public. Do not include contact or payment details. You can edit the listing later with your tracking code and booking email.</p>{openPlayEnabled && <div className="mt-4 grid gap-3"><label className={field}>Open Play title<Input required maxLength={100} value={openPlay.title} disabled={busy} onChange={e => updateProgress({ openPlay: { ...openPlay, title: e.target.value } })} /></label><label className={field}>Reclub event link (optional)<Input type="url" maxLength={256} placeholder="https://reclub.co/m/..." value={openPlay.eventUrl} disabled={busy} onChange={e => updateProgress({ openPlay: { ...openPlay, eventUrl: e.target.value } })} /></label><label className={field}>Public notes<textarea maxLength={500} rows={3} value={openPlay.description} disabled={busy} onChange={e => updateProgress({ openPlay: { ...openPlay, description: e.target.value } })} className="min-h-20 rounded-md border border-[#a7c5a0] bg-white px-3 py-2 font-normal focus-visible:outline-2 focus-visible:outline-[#447244]" /><span className="text-xs font-normal text-[#405966]">{openPlay.description.length}/500 · Visible to everyone.</span></label></div>}{openPlayError && <p role="alert" className="mt-3 text-sm text-destructive">{openPlayError}</p>}</section>}
      <div id="court-availability" role="region" aria-label="Court availability" tabIndex={0} className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm"><caption className="sr-only">Court availability by time</caption><thead className="text-[#447244]"><tr><th scope="col" className="px-1 py-3 text-center text-xs sm:p-3 sm:text-sm"><span className="inline-flex items-center justify-center gap-1"><Clock3 aria-hidden="true" className="size-4 shrink-0" />Time</span></th>{availability.courts.map(c => <th scope="col" key={c.id} className="px-0.5 py-1 text-center text-xs sm:px-2 sm:text-sm"><span className="inline-flex items-center justify-center"><span>{c.name}</span><button type="button" aria-label={`View ${c.name} photo`} onClick={() => { setPreviewCourt(c.name); previewDialog.current?.showModal(); }} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#447244] hover:bg-[#edf3f5] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#ffad4c]`}><ImageIcon aria-hidden="true" className="size-4" /></button></span></th>)}</tr></thead><tbody>
          {gridTimes(availability.courts.flatMap(c => c.windows), availability.settings.intervalMinutes, now).map(start => {
            const end = start + availability.settings.intervalMinutes * 60000;
            const endDate = slotEndDate(start, end);
            return <tr key={start}><th scope="row" className="bg-white px-1 py-2 text-center"><span className="inline-flex max-w-full flex-col items-center rounded-full bg-[#edf3f5] px-2 py-2 text-[10px] font-bold leading-4 text-[#447244] sm:flex-row sm:gap-1 sm:px-3 sm:text-xs"><span>{formatTime(start)} <span aria-hidden="true">–</span></span><span>{endDate && `${endDate} · `}{formatTime(end)}</span></span></th>{availability.courts.map(court => {
            const wi = court.windows.findIndex(w => slots(w, court.occupied, availability.settings.intervalMinutes, now).some(s => s.start === start));
            const window = court.windows[wi]; const grid = window ? slots(window, court.occupied, availability.settings.intervalMinutes, now) : []; const slot = grid.find(s => s.start === start); const active = !!slot && ranges.some(r => r.courtId === court.id && r.window === wi && start >= Date.parse(r.start) && end <= Date.parse(r.end));
            const status = !slot ? "Closed" : window.hourlyRate === null ? "Rate unavailable" : !slot.available ? "Unavailable" : "Available";
            const label = active ? "Selected" : status;
            const symbol = active ? "✓" : status === "Available" ? "+" : status === "Closed" ? "C" : status === "Rate unavailable" ? "R" : "–";
            const price = slot && window.hourlyRate !== null
              ? money(pesos(priceItems([{ rate: window.hourlyRate, minutes: availability.settings.intervalMinutes }])))
              : null;
            const content = <><span aria-hidden="true" className="sm:hidden">{symbol}</span><span className="sr-only sm:not-sr-only">{label}</span>{price && <span className="text-xs tabular-nums">{price}</span>}</>;
            const size = price ? "min-h-11 w-full min-w-11 flex-col px-1 py-1 leading-tight" : "h-11 w-11 sm:w-full";
            const style = `inline-flex ${size} items-center justify-center rounded-full border text-sm font-bold sm:px-2 sm:text-xs ${statusStyles[label]}`;
            return <td key={court.id} className="border-t border-[#dce5e8] px-1 py-2 text-center">{<button type="button" disabled={busy || status !== "Available"} aria-pressed={!!active} aria-label={`${court.name}, ${slotDate(start)} ${formatTime(start)} - ${slotDate(end)} ${formatTime(end)}, ${label}${price ? ` ${price}` : ""}`} onClick={() => { const rate = window?.hourlyRate; if (status !== "Available" || rate == null) return; setRanges(current => toggleSlot(current, court.id, wi, rate, new Date(start).toISOString(), new Date(end).toISOString())); }} className={`${style} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f28500] enabled:hover:ring-2 enabled:hover:ring-[#f28500] disabled:cursor-not-allowed`}>{content}</button>}</td>;
          })}</tr>;
          })}
        </tbody></table></div>
      <ul aria-label="Availability legend" className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-medium text-[#405966]">{([ ["Available", "+"], ["Selected", "✓"], ["Unavailable", "–"], ["Closed", "C"], ["Rate unavailable", "R"] ] as const).map(([label, symbol]) => <li key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${statusStyles[label]}`}>{symbol}</span>{label}</li>)}</ul>
      <dialog ref={previewDialog} aria-labelledby="court-preview-title" className="m-auto w-[min(90vw,28rem)] overscroll-contain rounded-2xl bg-white p-6 text-[#447244] shadow-xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-[#0f2938]/70"><h2 id="court-preview-title" className="font-display text-2xl font-bold">{previewCourt} photo</h2>{(() => { const court = availability?.courts.find(c => c.name === previewCourt); return <>{court?.photoVersion && court.photoVersion !== "0" ? <img src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(court.photoVersion)}`} alt="" className="mt-4 aspect-[4/3] w-full rounded-lg object-cover" /> : <p className="mt-4 text-sm text-[#405966]">A photo of this court is not available yet.</p>}{court?.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm text-[#405966]">{court.description}</p>}</>; })()}<form method="dialog" className="mt-6"><Button autoFocus type="submit" className="public-cta-secondary">Close</Button></form></dialog>
      </>}
    </section>
    {!loading && availability && ranges.length > 0 && <aside aria-label="Booking summary" className={bookingPage ? "min-w-0 lg:sticky lg:top-28" : "fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:sticky lg:top-24 lg:z-auto lg:p-0"}><div className={bookingPage ? "flex flex-col rounded-2xl border border-[#dce5e8] bg-white p-4 shadow-sm lg:max-h-[calc(100dvh-8rem)]" : "flex max-h-[min(50dvh,24rem)] flex-col rounded-2xl border border-[#dce5e8] bg-white px-4 pb-3 shadow-xl lg:max-h-[calc(100dvh-7rem)] lg:p-5"}>
      <div className="flex shrink-0 items-center justify-between gap-3"><h2 className="text-sm font-bold text-[#447244]">{bookingDate(chosenDate)}</h2><button type="button" className="min-h-11 shrink-0 text-sm font-bold text-[#447244] underline disabled:opacity-50" disabled={busy} onClick={() => { setRanges([]); document.getElementById("court-availability")?.focus(); }}>Clear all</button></div>
      <div tabIndex={0} aria-label="Selected times and messages" role="region" className={bookingPage ? "lg:min-h-0 lg:overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#447244]" : "min-h-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#447244]"}>
      <ul className="divide-y border-y">{ranges.map(r => <li key={`${r.courtId}:${r.start}`} className="py-1 text-sm leading-5"><strong className="text-[#447244]">{availability.courts.find(c => c.id === r.courtId)?.name}</strong>{" · "}<time dateTime={r.start}>{formatTime(Date.parse(r.start))}{manilaDateStr(new Date(r.start)) > chosenDate && " (next day)"}</time> – <time dateTime={r.end}>{formatTime(Date.parse(r.end))}{manilaDateStr(new Date(r.end)) > chosenDate && " (next day)"}</time>{bookingPage && slotDetail(rangeMinutes(r), availability.settings.intervalMinutes)} · {money(r.rate)} / hour</li>)}</ul>
      {!validRanges && <p className="mt-2 text-xs">Select at most 100 blocks. Each block must be at least {availability.settings.minimumMinutes} minutes and start in the future.</p>}{feedback.message && bookingPage && <p role={feedback.toasted ? undefined : "alert"} className="mt-2 text-sm text-destructive">{feedback.message}</p>}
      </div>
      <div className="shrink-0 pt-2">{bookingPage && selectionSlots !== undefined && <p className="text-sm font-semibold text-[#447244]">{slotLabel(selectionSlots)} selected</p>}<div className="flex flex-wrap items-baseline justify-between gap-x-3"><p className="text-sm">Estimated total</p><p className="text-base font-bold text-[#447244]">{total ? money(total) : "Unavailable"}</p></div></div>
      <div className={bookingPage ? "mt-2 hidden shrink-0 lg:block" : "mt-2 shrink-0"}>{bookingPage ? <Button className="public-cta-primary min-h-11 w-full" disabled={busy || !availability.configured || !validRanges || !total} onClick={reviewSelection}>Review selection</Button> : validRanges && total && availability.configured ? <a className="inline-flex min-h-11 w-full items-center justify-center rounded-md public-cta-primary px-4 text-sm font-bold transition-colors" href={`/book?${new URLSearchParams({ date: chosenDate, ranges: JSON.stringify(ranges.map(({ courtId, start, end }) => ({ courtId, start, end }))) })}`}>Continue booking</a> : <p className="text-sm">Choose valid times to continue.</p>}</div>
    </div>{bookingPage && <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#d5e2ce] bg-white px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl lg:hidden"><div className="flex items-center justify-between gap-3"><div className="min-w-0 text-sm"><p className="font-semibold text-[#447244]">{selectionSlots !== undefined ? slotLabel(selectionSlots) : ranges.length} selected</p><p>Estimated total <strong className="tabular-nums">{total ? money(total) : "Unavailable"}</strong></p></div><Button className="public-cta-primary min-h-11 shrink-0" disabled={busy || !availability.configured || !validRanges || !total} onClick={reviewSelection}>Review</Button></div></div>}</aside>}
    </div>}
        </div>
      </section>

      {!bookingPage && <CourtGallery />}

      {!bookingPage && <HowItWorks />}

      {!bookingPage && <div className="bg-[#447244] px-4 py-4 sm:px-6">
          <section id="track" className={`mx-auto min-w-0 max-w-7xl scroll-mt-28 text-[#17252e] sm:scroll-mt-32 ${card}`}>
              <div className="mx-auto max-w-xl text-center">
                <h2 className="font-display text-2xl font-bold text-[#447244]">Track your reservation</h2>
                <p className="mt-2 text-sm leading-5 text-[#405966]">Use the tracking code and email from your request to see where your booking stands.</p>
              </div>
              <form onSubmit={lookup} className="mx-auto mt-4 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="block text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Tracking code<Input aria-label="Tracking code" className="mt-2 min-h-11 border-[#a7c5a0] bg-white font-semibold normal-case tracking-normal text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" required maxLength={5} value={trackCode} onChange={e => setTrackCode(e.target.value)} /></label><label className="block text-xs font-bold uppercase tracking-[.16em] text-[#447244]">Email<Input aria-label="Email" className="mt-2 min-h-11 border-[#a7c5a0] bg-white font-semibold normal-case tracking-normal text-[#294d2e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#447244]" required type="email" value={trackEmail} onChange={e => setTrackEmail(e.target.value)} /></label><Button className="public-cta-primary min-h-11 px-6 font-bold" disabled={trackBusy} type="submit">{trackBusy ? "Checking…" : "Track"}</Button></form>
              {trackError && <p role="alert" className="mt-3 text-sm text-destructive">{trackError}</p>}
              <div aria-live="polite">{tracking && <div className="mt-5 text-left"><TrackingSummary booking={tracking} /></div>}</div>
          </section>
      </div>}

      {!bookingPage && <>{/* VISIT */}
      <section className="relative isolate scroll-mt-28 bg-[#447244] px-4 py-4 sm:scroll-mt-32 sm:px-6">
        <Guides />
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
        <section className="flex min-w-0 flex-col rounded-2xl bg-white p-4 text-[#447244] md:col-span-2">
          <h2 className="font-display text-2xl font-black uppercase">Visit us</h2>
          <p className="mt-1 text-xs leading-5">{VENUE_ADDRESS} &middot; <a href={VENUE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">Open in Google Maps</a></p>
          <iframe title="Google map of ETHN Courts" src={VENUE_MAP_EMBED} className="mt-3 min-h-[300px] w-full flex-1 rounded-xl border-0" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        </section>
            <div className="grid gap-4">
              <div className="flex flex-col justify-end rounded-2xl bg-[#0f2938] p-4 text-white shadow-xl">
                <div className="flex items-start justify-between gap-3"><p className="text-base font-semibold leading-tight">How booking<br />works</p><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#447244]"><Ball className="h-5 w-5" /></span></div>
                <div className="mt-5 flex items-end justify-between"><p className="font-display text-4xl font-black text-[#ffad4c]">3 steps</p><p className="text-right text-xs leading-4 text-white/70">Reserve, pay,<br />get confirmed</p></div>
                <div aria-hidden="true" className="mt-3 flex h-12 items-end gap-[3px]">{Array.from({ length: 24 }, (_, i) => <span key={i} className={`flex-1 rounded-full ${i < 16 ? "bg-[#ffad4c]" : "bg-white/15"}`} style={{ height: "100%" }} />)}</div>
              </div>
              <div className="rounded-2xl bg-[#cfe3ec] p-6 text-[#447244]"><Ball className="h-8 w-8" /><h3 className="font-display mt-4 text-2xl font-black uppercase leading-none">Pay and upload</h3><p className="mt-3 text-xs leading-5">Pay using a listed method, upload your proof, and staff confirm your booking.</p><a href="/track" className={tileBtn}>Track booking <span aria-hidden="true" className="ml-2">→</span></a></div>
              <div className="rounded-2xl bg-[#ffad4c] p-6 text-[#447244]"><Ball className="h-8 w-8" /><h3 className="font-display mt-4 text-2xl font-black uppercase leading-none">Pick your time</h3><p className="mt-3 text-xs leading-5">Select any available times. Gaps between selected times are not booked.</p><a href="/book" className={tileBtn}>See open times <span aria-hidden="true" className="ml-2">→</span></a></div>
            </div>
        </div>
      </section>

      {/* FIND US */}
      <section id="find-us" className="relative isolate scroll-mt-28 sm:scroll-mt-32 bg-[#447244] px-4 py-16 text-center text-white sm:px-6">
        <Guides />
        <h2 className="font-display mx-auto max-w-3xl text-[clamp(2.5rem,7vw,4.5rem)] font-black uppercase leading-[.85] tracking-tight text-[#ffad4c]">Your neighborhood<br />court</h2>
        <p className="mx-auto mt-5 max-w-sm text-xs leading-5 text-white/75">{VENUE_ADDRESS}. Better rallies, right where you live.</p>
        <a href="/book" className="mt-7 inline-flex min-h-10 items-center rounded-md public-cta-primary public-cta-on-dark px-5 text-xs font-bold transition-colors">Book a court</a>
      </section>
      <Faq />
    </>}
    </main></div>;
}