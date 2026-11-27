"use client";
import { formatScheduleRange, formatScheduleTime } from "@/lib/booking/schedule-label";
import { TrackingSummary, type Tracking } from "@/components/booking/tracking-summary";
import { BookingDateStrip } from "./booking-date-strip";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";

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
import { CalendarDays, Check, CircleCheck, ClipboardList, Clock3, CreditCard, Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { priceItems, validateGuest } from "@/lib/booking/core";
import { manilaDateStr } from "@/lib/booking/slots";
import { acceptedDate, addDays, bookingDate, gridSlotCount, gridTimes, handoffRanges, toggleSlot, slotDate, slots, validDate, type Window, type Occupied, type Range } from "./ethn-selection";
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
  Available: "bg-muted text-primary border-input",
  Selected: "bg-primary text-primary-foreground border-primary",
  Unavailable: "bg-accent text-muted-foreground border-border",
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
  if (code === "TOO_CLOSE_TO_START") return "There is not enough time to pay and upload proof before the first slot. Choose a later time or contact the venue.";
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

function CourtPhoto({ court }: { court: Availability["courts"][number] }) {
  return <figure className="min-w-0">
    {court.photoVersion && court.photoVersion !== "0" ? <img src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(court.photoVersion)}`} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" /> : <div className="grid aspect-[4/3] place-items-center rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground">Photo unavailable</div>}
    <figcaption className="mt-2 text-sm font-semibold text-foreground">{court.name}</figcaption>
  </figure>;
}

export default function EthnBooking({ bookingPage = false, afterBooking }: { bookingPage?: boolean; afterBooking?: React.ReactNode }) {
  const confirm = useConfirm();
  const [previewCourt, setPreviewCourt] = useState("");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [chosenDate, setChosenDate] = useState("");
  const [dateStatus, setDateStatus] = useState("");
  const dateId = useId();
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
  const checkoutMethods = draft?.checkout.paymentMethods ?? [];
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

  async function changeDate(date: string) {
    if (date === chosenDate || (bookingPage && (!validDate(date) || (minDate && date < minDate) || (maxDate && date > maxDate)))) return;
    const previousDate = chosenDate;
    const previousRanges = ranges;
    if (bookingPage && previousRanges.length > 0 && !await confirm("Changing the date clears your selected times. Continue?")) return;
    if (chosenDate !== previousDate || ranges !== previousRanges) return;
    setRanges([]); setChosenDate(date); setError("");
    setDateStatus("Date changed. Choose your times again.");
    if (date) void load(date);
    else { sequence.current++; setLoading(false); }
  }

  const minDate = availability?.operatingDate;
  const maxDate = availability ? addDays(availability.operatingDate, availability.settings.horizonDays - 1) : undefined;
  const showLandingSummary = !bookingPage && !loading && !!availability && ranges.length > 0;
  const landingBookingHref = showLandingSummary ? `/book?${new URLSearchParams({ date: chosenDate, ranges: JSON.stringify(ranges.map(({ courtId, start, end }) => ({ courtId, start, end }))) })}` : undefined;
  const selectedCourts = bookingPage || showLandingSummary ? availability?.courts.filter(court => ranges.some(range => range.courtId === court.id)) ?? [] : [];
  const selectionSlots = gridSlotCount(ranges.reduce((minutes, range) => minutes + rangeMinutes(range), 0), availability?.settings.intervalMinutes);
  const validRanges = availability && ranges.length > 0 && ranges.length <= 100 && ranges.every(r => Date.parse(r.end) - Date.parse(r.start) >= availability.settings.minimumMinutes * 60_000 && Date.parse(r.start) >= now);
  let total = "0.00";
  try { if (ranges.length) total = pesos(priceItems(ranges.map(r => ({ rate: r.rate, minutes: (Date.parse(r.end) - Date.parse(r.start)) / 60_000 })))); } catch { total = ""; }
  const selectionBlockingReason = !availability?.configured ? availability?.message || "Booking is not configured yet." : !clockReady ? "Checking current availability…" : !ranges.length ? "Pick at least one available time." : ranges.length > 100 ? "Select at most 100 blocks." : ranges.some(r => Date.parse(r.start) < now) ? "A selected time has passed. Choose another time." : ranges.some(r => rangeMinutes(r) < availability.settings.minimumMinutes) ? `Choose at least ${availability.settings.minimumMinutes} consecutive minutes per block.` : !total ? "Price is unavailable for this selection." : "";
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
    setOpenPlayError(""); setError(""); setReviewing(true);
  }

  function openPlayValidationError() {
    if (!openPlayEnabled) return "";
    const orderedRanges = [...ranges].sort((a, b) => a.courtId.localeCompare(b.courtId) || a.start.localeCompare(b.start));
    const windows = new Map<string, { start: string; end: string }>();
    const continuous = orderedRanges.every(range => {
      const window = windows.get(range.courtId);
      if (window && window.end !== range.start) return false;
      windows.set(range.courtId, { start: window?.start ?? range.start, end: range.end });
      return true;
    }) && new Set(Array.from(windows.values(), window => `${window.start}/${window.end}`)).size === 1;
    if (!continuous) return "Open Plays need one continuous time shared by every selected court. Turn off Open Play or change your selection.";
    if (!validOpenPlay(openPlay)) return "Enter an Open Play title. Reclub link is optional; when provided, use a direct event link. Notes are optional (up to 500 characters).";
    return "";
  }

  async function beginCheckout() {
    if (lock.current) return;
    if (!validateGuest({ kind: "online", name, email, phone })) { setError("Enter a full name, valid email, and contact number."); return; }
    if (!reviewing || !availability || !availability.configured || !clockReady || !validRanges || ranges.some(r => Date.parse(r.start) < clock.current.server + performance.now() - clock.current.monotonic) || !total) { setError("Your selected times are no longer valid. Return to slots and choose again."); return; }
    const listingError = openPlayValidationError();
    setOpenPlayError(listingError);
    if (listingError) return;
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
    const currentDraft = draft;
    if (!currentDraft.releaseRequested && !await confirm("Release your held times and leave checkout? If you already paid, stay and submit your proof or contact the venue first.")) return;
    if (draft !== currentDraft || lock.current) return;
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
    if (openPlayEnabled && !validOpenPlay(openPlay)) { setError("Check your Open Play title, notes, and optional Reclub link."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const payload = { ownerToken: draft.owner, checkoutId: draft.checkout.checkoutId, reservationId: draft.reservationId, customer: { name: name.trim(), email: email.trim(), phone: phone.trim() }, paymentMethodId: methodId, ...(reference.trim() ? { reference: reference.trim() } : {}), ...(draft.checkout.acknowledgementRequired ? { acknowledgedTotal: draft.checkout.total } : {}), ...(openPlayEnabled ? { openPlay: { title: openPlay.title.trim(), description: openPlay.description, eventUrl: openPlay.eventUrl.trim() } } : {}) };
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

  const sectionTitle = "landing-heading text-foreground";
  const sectionCta = "inline-flex min-h-12 items-center justify-center self-start rounded-md px-6 py-3 text-base font-bold transition-colors";
  const tileBtn = "mt-5 inline-flex min-h-9 items-center rounded-md px-3 text-xs font-bold transition-colors public-cta-secondary";
  const card = bookingPage ? "rounded-2xl border border-border bg-card p-4 sm:p-5" : "rounded-2xl border border-border bg-background p-5 sm:p-7";

  const contactFields = <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Full name<Input placeholder="Alex Reyes" className="public-field" required maxLength={200} value={name} onChange={e => updateProgress({ name: e.target.value })} autoComplete="name" /></label><label className={field}>Email<Input placeholder="name@example.com" className="public-field" required type="email" maxLength={254} value={email} onChange={e => updateProgress({ email: e.target.value })} autoComplete="email" /></label><label className={field}>Contact number<Input placeholder="0917 123 4567" className="public-field" required type="tel" maxLength={50} value={phone} onChange={e => updateProgress({ phone: e.target.value })} autoComplete="tel" /></label></div>;

  return <div className="min-h-screen bg-background text-foreground">
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
      <section className="ethn-hero relative isolate -mt-14 overflow-hidden bg-[#447244] px-4 pt-[calc(3.5rem+.75rem)] pb-4 text-center text-white sm:-mt-24 sm:px-6 sm:pt-[calc(6rem+.75rem)] sm:pb-24">
        <img src="/court-gallery/c9Uh1G3i.jpg" alt="" fetchPriority="high" className="pointer-events-none absolute inset-0 -z-10 size-full object-cover object-[center_58%] sm:object-[center_55%]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(20,69,36,.94)_0%,rgba(38,94,49,.76)_34%,rgba(45,105,55,.35)_58%,rgba(30,76,40,.3)_100%)]" />
        <Guides />


        <h1 className="relative z-10 mx-auto w-[min(80%,38rem)]">
          <EthnHeroLogo />
        </h1>

        <div className="ethn-fade relative z-20 mx-auto mt-4 flex items-center justify-center gap-2 sm:gap-3">
          <a href="/book" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg public-cta-primary public-cta-on-dark px-3 text-xs font-extrabold transition-colors sm:min-h-12 sm:w-auto sm:px-7 sm:text-sm">Book a court <span aria-hidden="true" className="ml-2">→</span></a>
          <a href="/open-plays" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg public-cta-secondary public-cta-on-dark px-3 text-xs font-bold transition-colors sm:min-h-12 sm:w-auto sm:px-7 sm:text-sm">See open plays</a>
        </div>

        <div className="ethn-court pointer-events-none mx-auto mt-4 grid h-[min(62vw,22rem)] w-full max-w-5xl place-items-center sm:-mt-40 sm:h-[min(34vw,26rem)]">
          <img src="/pickleball_centered_animated.svg" alt="Isometric pickleball court with two paddles rallying a ball" className="h-full w-full object-contain" />
        </div>
      </section>

      {/* BOOK INTRO BAND */}
      <section className="landing-type bg-background">
        <div className="mx-auto flex max-w-[70rem] flex-wrap items-center justify-between gap-6 px-5 py-7 sm:px-8">
          <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-[var(--daylight-lime)]"><Ball className="h-6 w-6" /></span><h2 className={sectionTitle}>Book a court</h2></div>
          <div className="flex max-w-sm flex-col gap-4 text-[11px] leading-5 text-muted-foreground"><a href="/book" className={`${sectionCta} public-cta-primary`}><CalendarDays aria-hidden="true" className="mr-2 size-4" />Check availability</a><p>Pick an open time on either court, pay using an available method, and staff confirm your reservation.</p></div>
        </div>
      </section>

      </>}
      {/* BOOKING + GUIDE GRID */}
      <section id="booking" className={`relative isolate scroll-mt-28 px-4 pb-4 sm:px-6 ${bookingPage ? "bg-background pt-4 sm:pt-6" : "bg-muted py-8 sm:scroll-mt-32 sm:py-20"}`}>
        <Guides />
        <div className={`mx-auto max-w-7xl space-y-4 ${bookingPage ? "pb-20 lg:pb-4" : ""}`}>
    {feedback.message && (!bookingPage || reviewing || draft || result || !ranges.length || loading) && <p role={feedback.toasted ? undefined : "alert"} className="rounded-2xl border border-destructive/30 bg-background p-4 text-sm text-foreground">{feedback.message}</p>}
    {bookingPage && <><ol aria-label="Booking progress" role="list" className={`mx-auto grid w-full grid-cols-4 gap-1 py-3 text-foreground ${receiptRef || result ? "max-w-3xl" : draft || (reviewing && availability) ? "max-w-2xl" : "max-w-6xl"}`}>
      {[["Court & time", CalendarDays], ["Your details", ClipboardList], ["Payment", CreditCard], ["Receipt", CircleCheck]].map(([label, Icon], index) => {
        const current = receiptRef || result ? 3 : draft ? 2 : reviewing ? 1 : 0;
        const completed = index < current;
        const StepIcon = completed ? Check : Icon as typeof CalendarDays;
        return <li key={label as string} aria-current={index === current ? "step" : undefined} className="relative flex min-w-0 flex-col items-center text-center">
          {index < 3 && <span aria-hidden="true" className={`absolute left-1/2 top-5 h-0.5 w-full ${completed ? "bg-primary" : "bg-border"}`} />}
          <span className={`relative grid size-10 place-items-center rounded-full border-2 ${index === current ? "border-primary bg-primary text-primary-foreground" : completed ? "border-primary bg-background text-foreground" : "border-border bg-background text-muted-foreground"}`}>
            <StepIcon className="size-5" aria-hidden="true" />
          </span>
          <span className="mt-2 block px-1 text-xs font-bold leading-tight sm:text-sm">{label as string}</span>
          <span className="sr-only">{completed ? "Completed" : index === current ? "Current" : "Upcoming"}</span>
        </li>;
      })}
    </ol></>}
    {bookingPage && (receiptRef || result) ? (
      result?.booked && "receipt" in result ? <EthnBookingReceipt receipt={result.receipt} trackingToken={result.trackingToken} code={result.code} openPlaySaved={result.openPlaySaved} onAnotherBooking={anotherBooking} /> :
        <section className="mx-auto w-full max-w-3xl space-y-3 rounded-2xl border bg-background p-6 text-foreground public-card">
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
    ) : bookingPage && draft ? <section className="mx-auto grid w-full max-w-6xl gap-4 rounded-2xl border border-border bg-card p-4 text-foreground public-card sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2"><h2 className="font-display text-2xl font-bold text-foreground">Payment &amp; proof</h2></div>
      <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-2">{restored && <p className="rounded-lg bg-accent p-3 text-sm">Checkout restored in this tab. Refreshing does not reset your hold timer. If you already paid, do not pay again.</p>}
      {!clockReady && <Button variant="outline" className="public-cta-secondary mx-auto flex" disabled={loading} onClick={() => void load()}>Refresh server time</Button>}
      <BookingInvoice heading="Booking summary" date={draft.date} total={draft.checkout.total} totalLabel="Total due" items={draft.checkout.items.map(item => ({ court: availability?.courts.find(c => c.id === item.courtId)?.name ?? `Court ${item.courtId}`, startsAt: item.start, endsAt: item.end, durationMinutes: item.minutes, intervalMinutes: draft.checkout.intervalMinutes, hourlyRate: item.rate, amount: item.amount }))} />
      </div><div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
       <p className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-[var(--daylight-warning)] px-4 py-3 text-sm font-bold text-[var(--daylight-warning-text)]"><span>{expired ? "Checkout total" : "Total due"}: {money(draft.checkout.total)}</span><span className="tabular-nums">{!clockReady ? "Time unavailable" : expired ? "Hold expired" : `Hold remaining ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</span></p>
       {draft.checkout.acknowledgementRequired && <label className="flex gap-2 rounded-lg border border-primary p-4 text-sm"><input type="checkbox" checked={ack} disabled={busy || draft.releaseRequested} onChange={e => updateProgress({ ack: e.target.checked })} /><span>Price or settings changed. I acknowledge the updated total of {money(draft.checkout.total)}.</span></label>}
      {draft.releaseRequested && <p role="status" className="rounded-lg bg-accent p-4 text-sm">Release not confirmed yet. Retry leaving checkout. Do not send another payment.</p>}
      {clockReady && !expired && !draft.releaseRequested && !(draft.checkout.acknowledgementRequired && !ack) && <p className="text-sm">Pay only if you have time to upload and submit your screenshot before the hold ends.</p>}
      {expired && !draft.releaseRequested && <p className="rounded-lg bg-accent p-4 text-sm">Your hold expired and your slots are no longer reserved. If you already paid, do not pay again. {draft.reservationId && "If your screenshot uploaded, submit it below. "}<a className="underline" href="/contact">Contact the venue</a> with your receipt and checkout ID: <strong className="break-all">{draft.checkout.checkoutId}</strong>.</p>}
      <fieldset className="space-y-3" disabled={busy || draft.releaseRequested}><legend className="mb-3 text-lg font-bold text-foreground">Payment method</legend>{checkoutMethods === null ? <p className="text-sm">Loading payment methods…</p> : checkoutMethods.length === 0 ? <p role="alert" className="text-sm">Payment methods are unavailable. Refresh or contact the venue before paying.</p> : <div className="grid gap-2">{checkoutMethods.map(m => <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-semibold transition ${methodId === m.id ? "border-primary bg-accent text-foreground" : "border-border bg-background text-foreground"}`}><input type="radio" name="payment-method" value={m.id} checked={methodId === m.id} onChange={e => updateProgress({ methodId: e.target.value })} className="size-4 accent-primary" />{m.name}</label>)}</div>}{clockReady && !expired && !draft.releaseRequested && !(draft.checkout.acknowledgementRequired && !ack) && checkoutMethods?.filter(m => m.id === methodId).map(m => <div key={m.id} className="rounded-xl border border-border bg-accent p-4 text-sm text-foreground"><p className="whitespace-pre-wrap break-words">{m.instructions}</p>{m.qrAvailable && <div className="mt-4 flex flex-col items-center gap-3"><img src={`/api/ethn/payment-methods/${encodeURIComponent(m.id)}/qr?v=${encodeURIComponent(m.version)}`} alt={`${m.name} payment QR code`} className="h-auto max-h-64 w-full max-w-[320px] rounded-lg bg-white p-2 object-contain" /><a href={`/api/ethn/payment-methods/${encodeURIComponent(m.id)}/qr?v=${encodeURIComponent(m.version)}`} download className="public-cta-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-bold transition-colors"><Download className="size-4" aria-hidden="true" /> Download QR</a></div>}<p className="mt-3">Confirm payment details with the venue before paying.</p></div>)}</fieldset>
      <section className="relative rounded-2xl border border-border bg-card p-4 public-card sm:p-5">
        <div className={`space-y-4${uploading ? " invisible" : ""}`}>
          <h3 className="text-lg font-bold text-foreground">Payment proof</h3>
          <label className={`${field} text-left text-foreground`}>Payment reference (optional)<Input placeholder="Reference from your receipt" className="public-field" maxLength={200} value={reference} disabled={busy || draft.releaseRequested} onChange={e => updateProgress({ reference: e.target.value })} /></label>
          <div className={field}>
            <p id={proofLabel}>Payment screenshot (JPG, PNG or WebP, up to 5 MiB)</p>
            <input ref={proofInput} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={proofUploadDisabled} onChange={e => {
              const screenshot = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (screenshot) void upload(screenshot);
            }} />
            <div className="flex flex-wrap items-center gap-3">
              {draft.uploaded && proofPreview && <img ref={attachProofPreview} alt="Uploaded payment screenshot" className="size-20 rounded-lg border border-border object-contain" />}
              {draft.uploaded && <CircleCheck className="size-5 text-foreground" role="img" aria-label="Upload complete" />}
              <Button type="button" variant="outline" className="public-cta-secondary min-h-12" disabled={proofUploadDisabled} aria-describedby={proofLabel} onClick={() => proofInput.current?.click()}>{draft.uploaded ? "Replace photo" : "Browse files"}</Button>
            </div>
          </div>
          {!draft.uploaded && <p role="status" className="text-sm text-foreground">{draft.reservationId ? "Upload not confirmed. Submit to check whether we received your screenshot." : expired ? "This hold expired. New screenshots can’t be uploaded." : draft.checkout.acknowledgementRequired && !ack ? "Acknowledge the updated total before choosing a screenshot." : "Choose a screenshot to upload it automatically."}</p>}
        </div>
        <p role="status" className={showUploadSuccess && draft.uploaded && !uploading ? "mt-3 text-sm font-medium text-foreground" : "sr-only"}>{showUploadSuccess && draft.uploaded && !uploading ? "Screenshot uploaded. Submit it for review." : ""}</p>
        {uploading && <div className="absolute inset-0 grid place-content-center gap-1 rounded-xl bg-background text-center"><LoadingAnimation label="Uploading screenshot" /><p aria-hidden="true" className="text-sm font-semibold">Uploading screenshot…</p></div>}
      </section>
      <section className="rounded-2xl border border-border bg-card p-4 text-sm"><h3 className="font-semibold text-foreground">Contact details (edit if needed)</h3><p className="mt-2 text-foreground">Checkout details are saved in this tab so you can refresh and continue.</p><fieldset disabled={busy || draft.releaseRequested} className="mt-4 text-left [&_label]:text-foreground">{contactFields}</fieldset></section>
      <div className="flex flex-wrap justify-center gap-3 border-t border-border pt-5"><Button className="public-cta-primary" disabled={busy || draft.releaseRequested || !draft.reservationId || (draft.checkout.acknowledgementRequired && !ack)} onClick={() => void submit()}>{busy ? "Please wait…" : expired ? "Record late payment evidence" : "Submit for review"}</Button><Button variant="outline" className="public-cta-secondary" disabled={busy} onClick={() => void leaveCheckout()}>{draft.releaseRequested ? "Retry leaving checkout" : "Leave checkout"}</Button></div>
    </div></section> : bookingPage && reviewing && availability ? <form id="booking-review-form" className="mx-auto grid w-full max-w-6xl gap-4 bg-background p-4 pb-24 sm:p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]" onSubmit={e => { e.preventDefault(); void beginCheckout(); }}>
      <div className="lg:col-span-2"><h2 ref={reviewHeading} tabIndex={-1} className="font-display text-3xl font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Review your selection</h2><p className="mt-2 text-sm text-muted-foreground">Your times are not held yet. Confirm below to hold them while you complete payment.</p></div>
      <div className="order-first space-y-3 lg:order-none lg:col-start-2 lg:row-start-2">{total ? <BookingInvoice heading="Booking summary" date={chosenDate} total={total} totalLabel="Estimated total" items={ranges.map(r => ({ court: availability.courts.find(c => c.id === r.courtId)?.name ?? r.courtId, startsAt: r.start, endsAt: r.end, durationMinutes: rangeMinutes(r), intervalMinutes: availability.settings.intervalMinutes, hourlyRate: r.rate, amount: pesos(priceItems([{ rate: r.rate, minutes: rangeMinutes(r) }])) }))} /> : <p className="text-sm text-muted-foreground">Booking price unavailable.</p>}

      <p className="text-xs text-muted-foreground">Final amount confirmed at checkout.</p></div>
      <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2"><div className="rounded-2xl border border-border bg-card p-4 public-card sm:p-5"><h3 className="mb-3 text-lg font-bold text-foreground">Your contact details</h3><div className="text-left [&_label]:text-foreground">{contactFields}</div></div>

       <section className="rounded-2xl border border-border bg-card p-4 public-card sm:p-5"><div className="flex items-center gap-2"><label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-foreground"><input type="checkbox" checked={openPlayEnabled} disabled={busy} onChange={e => { setOpenPlayError(""); updateProgress({ openPlayEnabled: e.target.checked }); }} className="size-5 accent-primary" />Hosting an Open Play?</label><button type="button" aria-label="About public Open Plays" aria-expanded={openPlayInfo} aria-controls="open-play-info" onClick={() => setOpenPlayInfo(value => !value)} className="grid size-11 shrink-0 place-items-center rounded-full text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">ⓘ</button></div><p hidden={!openPlayInfo} id="open-play-info" className="mt-2 rounded-lg bg-accent p-3 text-sm text-muted-foreground">After your booking is confirmed, we’ll publish this Open Play on our site so other players can find and join it via Reclub. Notes are public. Do not include contact or payment details. You can edit the listing later with your tracking code and booking email.</p>{openPlayEnabled && <div className="mt-4 grid gap-3"><label className={field}>Open Play title<Input placeholder="Saturday Pickleball" required maxLength={100} value={openPlay.title} disabled={busy} onChange={e => updateProgress({ openPlay: { ...openPlay, title: e.target.value } })} /></label><label className={field}>Reclub event link (optional)<Input type="url" maxLength={256} placeholder="https://reclub.co/m/..." value={openPlay.eventUrl} disabled={busy} onChange={e => updateProgress({ openPlay: { ...openPlay, eventUrl: e.target.value } })} /></label><label className={field}>Public notes<Textarea placeholder="Skill level, format, or what to bring" maxLength={500} rows={3} value={openPlay.description} disabled={busy} onChange={e => updateProgress({ openPlay: { ...openPlay, description: e.target.value } })} className="public-field min-h-20" /><span className="text-xs font-normal text-muted-foreground">{openPlay.description.length}/500 · Visible to everyone.</span></label></div>}{openPlayError && <p role="alert" className="mt-3 text-sm text-destructive">{openPlayError}</p>}</section>
      {!validRanges && <p role="status" className="text-sm text-destructive">Selected times are no longer valid. Return to slots and choose again.</p>}
      <div className="hidden flex-wrap gap-3 lg:flex"><Button type="submit" className="public-cta-primary" disabled={busy || !clockReady || !availability.configured || !validRanges || !total}>{busy ? "Starting checkout…" : "Confirm and hold"}</Button><Button type="button" variant="outline" className="public-cta-secondary" disabled={busy} onClick={() => { setReviewing(false); setError(""); requestAnimationFrame(() => document.getElementById("court-availability")?.focus()); }}>Back to slots</Button></div>
    </div><div data-daylight-booking-bar className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl lg:hidden"><span className="text-sm">Estimated total <strong className="tabular-nums">{money(total)}</strong></span><Button type="submit" form="booking-review-form" className="public-cta-primary min-h-11" disabled={busy || !clockReady || !availability.configured || !validRanges || !total}>{busy ? "Starting…" : "Continue to payment"}</Button></div></form> : <div className={`grid items-start gap-4 ${bookingPage || showLandingSummary ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]" : ""}`}><section className={`min-w-0 space-y-3 ${bookingPage ? "" : card}`}>
      <p id={`${dateId}-help`} className="sr-only">Times after midnight may appear under the previous booking date. “Plus one day” means the range ends on the next calendar day.</p>
      {availability && <BookingDateStrip value={chosenDate} anchor={chosenDate || availability.operatingDate} onChange={changeDate} min={minDate} max={maxDate} disabled={loading || busy} spacious={!bookingPage} describedBy={`${dateId}-help`} popupClassName="daylight" />}
      <p role="status" aria-live="polite" className="sr-only">{dateStatus}</p>
      {loading ? <LoadingAnimation label="Loading availability" className="py-6" /> : !availability ? <div className="space-y-3"><p className="text-sm">Availability is unavailable.</p><Button className="public-cta-primary" onClick={() => void load(chosenDate || undefined)}>Retry availability</Button></div> : !chosenDate ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Choose a date to see available times.</p> : <>{!availability.configured && <p className="rounded-lg bg-muted p-4 text-sm">{availability.message || "Booking and payment are not configured yet."}</p>}{(availability.courts.length === 0 || availability.courts.every(c => c.windows.length === 0)) && <p className="py-6 text-sm text-muted-foreground">Courts are closed on this date.</p>}
      {availability.courts.some(c => c.windows.length > 0) && gridTimes(availability.courts.flatMap(c => c.windows), availability.settings.intervalMinutes, now).length === 0 && <p role="status" className="py-4 text-sm text-muted-foreground text-center"><EmptyIcon /> No upcoming slots for this date.</p>}
      {bookingPage && ranges.length === 0 && <p className="text-sm font-medium text-muted-foreground">0 slots selected</p>}
       {bookingPage && ranges.length > 0 && <p className="text-sm text-muted-foreground">{ranges.length} selected · {total ? money(total) : "Price unavailable"}</p>}
      <div id="court-availability" role="region" aria-label="Court availability" tabIndex={0} className={`max-w-full ${bookingPage ? "overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]" : "overflow-x-auto"}`}>
        <table style={bookingPage ? { minWidth: `${6 + 6.5 * availability.courts.length}rem` } : undefined} className="w-full table-fixed border-separate border-spacing-0 text-sm"><caption className="sr-only">Court availability by time</caption><thead className="text-foreground"><tr><th scope="col" className={`px-1 py-3 text-center text-xs sm:p-3 sm:text-sm ${bookingPage ? "sticky left-0 z-20 w-[6rem] bg-background" : "w-[6rem]"}`}><span className="inline-flex items-center justify-center gap-1"><Clock3 aria-hidden="true" className="size-4 shrink-0" />Time</span></th>{availability.courts.map(c => <th scope="col" key={c.id} className="px-0.5 py-1 text-center text-xs sm:px-2 sm:text-sm"><span className="inline-flex items-center justify-center"><span>{c.name}</span><button type="button" aria-label={`View ${c.name} photo`} onClick={() => { setPreviewCourt(c.name); previewDialog.current?.showModal(); }} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring`}><ImageIcon aria-hidden="true" className="size-4" /></button></span></th>)}</tr></thead><tbody>
          {gridTimes(availability.courts.flatMap(c => c.windows), availability.settings.intervalMinutes, now).map(start => {
            const end = start + availability.settings.intervalMinutes * 60000;
            const rangeLabel = formatScheduleRange(start, end, chosenDate);
            return <tr key={start}><th scope="row" className={`bg-background px-1 py-2 text-center ${bookingPage ? "sticky left-0 z-10" : ""}`}><span className={`inline-block max-w-full wrap-break-word whitespace-pre-line font-medium tabular-nums ${bookingPage ? "text-sm leading-tight text-muted-foreground" : "rounded-full bg-muted px-2 py-2 text-xs font-bold leading-4 text-foreground sm:px-3"}`}>{rangeLabel.replace(" (+1 day)", "\n(+1 day)")}</span></th>{availability.courts.map(court => {
            const wi = court.windows.findIndex(w => slots(w, court.occupied, availability.settings.intervalMinutes, now).some(s => s.start === start));
            const window = court.windows[wi]; const grid = window ? slots(window, court.occupied, availability.settings.intervalMinutes, now) : []; const slot = grid.find(s => s.start === start); const active = !!slot && ranges.some(r => r.courtId === court.id && r.window === wi && start >= Date.parse(r.start) && end <= Date.parse(r.end));
            const status = !slot ? "Closed" : !slot.available || window.hourlyRate === null ? "Unavailable" : "Available";
            const label = active ? "Selected" : status;
            const price = status === "Available" && window.hourlyRate !== null
              ? money(pesos(priceItems([{ rate: window.hourlyRate, minutes: availability.settings.intervalMinutes }])))
              : null;
            const content = price ? <span className="text-[0.65rem] leading-tight tabular-nums sm:text-xs">{price.replace(/\.00$/, "")}</span> : <span aria-hidden="true" className="text-lg leading-none">×</span>;
            const style = `inline-flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full border p-1 text-center font-bold leading-tight tabular-nums ${statusStyles[label === "Closed" ? "Unavailable" : label]}`;
            return <td key={court.id} className="border-t border-border px-1 py-2 text-center">{<button type="button" disabled={busy || status !== "Available"} aria-pressed={!!active} aria-label={`${court.name}, ${slotDate(start)} ${formatScheduleTime(start)} to ${slotDate(end)} ${formatScheduleTime(end)}, ${label}${price ? ` ${price}` : ""}`} onClick={() => { const rate = window?.hourlyRate; if (status !== "Available" || rate == null) return; setRanges(current => toggleSlot(current, court.id, wi, rate, new Date(start).toISOString(), new Date(end).toISOString())); }} className={`${style} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:hover:ring-2 enabled:hover:ring-ring disabled:cursor-not-allowed`}>{content}</button>}</td>;
          })}</tr>;
          })}
        </tbody></table></div>
      <ul aria-label="Availability legend" className="flex flex-wrap gap-x-3 gap-y-2 text-xs font-medium text-muted-foreground">{([ ["Available", "+"], ["Selected", "✓"], ["Unavailable", "×"] ] as const).map(([label, symbol]) => <li key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${statusStyles[label]}`}>{symbol}</span>{label}</li>)}</ul>
      <dialog ref={previewDialog} aria-labelledby="court-preview-title" className="dialog-surface m-auto max-h-[calc(100dvh-2rem)] w-[min(90vw,28rem)] overflow-y-auto overscroll-contain rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 backdrop:bg-black/60"><h2 id="court-preview-title" className="text-lg font-semibold">{previewCourt} photo</h2>{(() => { const court = availability?.courts.find(c => c.name === previewCourt); return <>{court?.photoVersion && court.photoVersion !== "0" ? <img src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(court.photoVersion)}`} alt="" className="mt-4 aspect-[4/3] w-full rounded-lg object-cover" /> : <p className="mt-4 text-sm text-muted-foreground">A photo of this court is not available yet.</p>}{court?.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">{court.description}</p>}</>; })()}<form method="dialog" className="mt-6"><Button autoFocus type="submit" className="public-cta-secondary">Close</Button></form></dialog>
      </>}
    </section>
    {(bookingPage || showLandingSummary) && <aside aria-label="Booking summary" className={`min-w-0 lg:sticky lg:top-20 hidden lg:block`}><div className="space-y-4"><section className={`rounded-2xl border border-border bg-card p-4 public-card`}>
      <div className="flex shrink-0 items-center justify-between gap-3"><h2 className="text-lg font-bold text-foreground">Your booking</h2><button type="button" className="min-h-11 shrink-0 text-sm font-bold text-foreground underline disabled:opacity-50" disabled={busy} onClick={() => { setRanges([]); document.getElementById("court-availability")?.focus(); }}>Clear all</button></div>
      <div tabIndex={0} aria-label="Selected times and messages" role="region" className={bookingPage ? "lg:min-h-0 lg:overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring" : "min-h-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"}>
      {ranges.length && availability ? <ul className="divide-y border-y">{ranges.map(r => <li key={`${r.courtId}:${r.start}`} className="py-1 text-sm leading-5"><strong className="text-foreground">{availability.courts.find(c => c.id === r.courtId)?.name}</strong>{" · "}{formatScheduleRange(r.start, r.end, chosenDate)}{bookingPage && slotDetail(rangeMinutes(r), availability.settings.intervalMinutes)} · {money(r.rate)} / hour</li>)}</ul> : <p className="py-5 text-sm text-muted-foreground">Choose open times to see your selection here.</p>}
      {!bookingPage && !validRanges && availability && <p className="mt-2 text-xs">Select at most 100 blocks. Each block must be at least {availability.settings.minimumMinutes} minutes and start in the future.</p>}{feedback.message && bookingPage && <p role={feedback.toasted ? undefined : "alert"} className="mt-2 text-sm text-destructive">{feedback.message}</p>}
      </div>
      {selectedCourts.length > 0 && <div aria-label="Selected court photos" className="mt-3 grid grid-cols-2 gap-3">{selectedCourts.map(court => <CourtPhoto key={court.id} court={court} />)}</div>}
      <div className="shrink-0 pt-2"><div className="flex flex-wrap items-baseline justify-between gap-x-3"><p className="text-sm">Total</p><p className="text-lg font-bold text-foreground">{total ? money(total) : "Unavailable"}</p></div>{selectionSlots !== undefined && <p className="text-sm text-muted-foreground">{slotLabel(selectionSlots)} selected</p>}</div>
      <div className={bookingPage ? "mt-2 hidden shrink-0 lg:block" : "mt-2 shrink-0"}>{bookingPage ? <><p role="status" className={selectionBlockingReason ? "mb-2 text-sm" : "sr-only"}>{selectionBlockingReason}</p><Button className="public-cta-primary min-h-11 w-full" disabled={busy || !validRanges || Boolean(selectionBlockingReason)} onClick={reviewSelection}>Review selection</Button></> : validRanges && total && availability.configured ? <a className="inline-flex min-h-11 w-full items-center justify-center rounded-md public-cta-primary px-4 text-sm font-bold transition-colors" href={landingBookingHref}>Continue booking</a> : <p className="text-sm">Choose valid times to continue.</p>}</div>
     </section></div></aside>}
     </div>}{((bookingPage && !reviewing && !draft && !result) || showLandingSummary) && <div data-daylight-booking-bar className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl lg:hidden"><div id="mobile-booking-summary" hidden={!mobileSummaryOpen} className="mb-3 max-h-[38vh] overflow-y-auto overscroll-contain rounded-xl bg-muted p-3"><div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">Your booking</h3><button type="button" className="min-h-11 px-2 text-sm font-semibold text-foreground underline" disabled={busy || !ranges.length} onClick={() => { setRanges([]); setMobileSummaryOpen(false); document.getElementById("court-availability")?.focus(); }}>Clear all</button></div>{ranges.length && availability ? <ul className="divide-y border-y border-border">{ranges.map(r => <li key={`${r.courtId}:${r.start}`} className="py-2 text-sm"><strong>{availability.courts.find(c => c.id === r.courtId)?.name}</strong><div>{formatScheduleRange(r.start, r.end, chosenDate)}</div><span className="text-muted-foreground">{slotDetail(rangeMinutes(r), availability.settings.intervalMinutes).replace(" · ", "")} · {money(r.rate)} / hour</span></li>)}</ul> : <p className="py-3 text-sm text-muted-foreground">Choose open times to see your selection here.</p>}{selectedCourts.length > 0 && <div aria-label="Selected court photos" className="mt-3 grid grid-cols-2 gap-3">{selectedCourts.map(court => <CourtPhoto key={court.id} court={court} />)}</div>}</div><div className="flex items-center justify-between gap-3"><button type="button" aria-expanded={mobileSummaryOpen} aria-controls="mobile-booking-summary" className="min-h-11 min-w-0 text-left" onClick={() => setMobileSummaryOpen(value => !value)}><span className="block text-sm font-semibold text-foreground">{selectionSlots !== undefined ? slotLabel(selectionSlots) : ranges.length} selected · {total ? money(total) : "Unavailable"}</span><span className="block text-xs text-foreground underline">{mobileSummaryOpen ? "Hide booking details" : "View booking details and court photos"}</span></button>{bookingPage ? <Button className="public-cta-primary min-h-11 shrink-0" disabled={busy || !validRanges || Boolean(selectionBlockingReason)} onClick={reviewSelection}>Continue</Button> : validRanges && total && availability?.configured && !busy ? <a href={landingBookingHref} className="public-cta-primary inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold">Continue booking</a> : <Button className="public-cta-primary min-h-11 shrink-0" disabled>Continue booking</Button>}</div><p role="status" className={selectionBlockingReason ? "mt-1 text-sm" : "sr-only"}>{selectionBlockingReason}</p></div>}
        </div>
      </section>

      {!bookingPage && afterBooking}
      {!bookingPage && <CourtGallery />}

      {!bookingPage && <HowItWorks />}

      {!bookingPage && <div className="bg-muted px-4 py-8 sm:px-6">
          <section id="track" className={`landing-type public-card mx-auto min-w-0 max-w-[70rem] scroll-mt-28 text-foreground sm:scroll-mt-32 ${card}`}>
              <div className="mx-auto max-w-xl text-center">
                <h2 className="landing-heading text-foreground">Track your reservation</h2>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">Use the tracking code and email from your request to see where your booking stands.</p>
              </div>
              <form onSubmit={lookup} className="mx-auto mt-4 grid max-w-3xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="block text-sm font-semibold text-foreground">Tracking code<Input placeholder="A7K2P" aria-label="Tracking code" className="public-field mt-2" required maxLength={5} value={trackCode} onChange={e => setTrackCode(e.target.value)} /></label><label className="block text-sm font-semibold text-foreground">Email<Input placeholder="name@example.com" aria-label="Email" className="public-field mt-2" required type="email" value={trackEmail} onChange={e => setTrackEmail(e.target.value)} /></label><Button className="public-cta-primary min-h-11 px-6 font-bold" disabled={trackBusy} type="submit">{trackBusy ? "Checking…" : "Check status"}</Button></form>
              {trackError && <p role="alert" className="mt-3 text-sm text-destructive">{trackError}</p>}
              <div aria-live="polite">{tracking && <div className="mt-5 text-left"><TrackingSummary booking={tracking} /></div>}</div>
          </section>
      </div>}

      {!bookingPage && <>{/* VISIT */}
      <section className="relative isolate scroll-mt-28 bg-background px-4 py-8 sm:scroll-mt-32 sm:px-6">
        <Guides />
        <div className="mx-auto grid max-w-[70rem] gap-4 md:grid-cols-3">
        <section className="flex min-w-0 flex-col rounded-2xl bg-background p-4 text-foreground md:col-span-2">
          <h2 className="landing-heading">Visit us</h2>
          <p className="mt-1 text-xs leading-5">{VENUE_ADDRESS} &middot; <a href={VENUE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">Open in Google Maps</a></p>
          <iframe title="Google map of ETHN Courts" src={VENUE_MAP_EMBED} className="mt-3 min-h-[300px] w-full flex-1 rounded-xl border-0" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        </section>
            <div className="grid gap-4">

              <div className="rounded-2xl bg-muted p-6 text-foreground"><Ball className="h-8 w-8" /><h3 className="landing-type mt-4 text-xl font-semibold">Pay and upload</h3><p className="mt-3 text-xs leading-5">Pay using a listed method, upload your proof, and staff confirm your booking.</p><a href="/track" className={tileBtn}>Track booking <span aria-hidden="true" className="ml-2">→</span></a></div>
              <div className="rounded-2xl bg-muted p-6 text-foreground"><Ball className="h-8 w-8" /><h3 className="landing-type mt-4 text-xl font-semibold">Pick your time</h3><p className="mt-3 text-xs leading-5">Select any available times. Gaps between selected times are not booked.</p><a href="/book" className={tileBtn}>See open times <span aria-hidden="true" className="ml-2">→</span></a></div>
            </div>
        </div>
      </section>

      {/* FIND US */}
      <section id="find-us" className="relative isolate scroll-mt-28 sm:scroll-mt-32 bg-muted px-4 py-12 text-center text-foreground sm:px-6">
        <Guides />
        <h2 className="landing-heading mx-auto max-w-3xl text-[var(--daylight-lime)]">Your neighborhood court</h2>
        <p className="mx-auto mt-5 max-w-sm text-xs leading-5 text-muted-foreground">{VENUE_ADDRESS}. Better rallies, right where you live.</p>
        <a href="/book" className="mt-7 inline-flex min-h-10 items-center rounded-md public-cta-primary public-cta-on-dark px-5 text-xs font-bold transition-colors">Book a court</a>
      </section>
      <Faq />
    </>}
    </main></div>;
}
