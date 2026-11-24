"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDisplayDate } from "@/lib/display-date";

type Tracking = { status: string; operatingDate: string; total: string; items: { court: string; startsAt: string; endsAt: string }[]; payments: { status: string; method: string; reviewReason?: string }[] };
const formatDate = (s: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(s));

export default function TrackLookup() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState<Tracking | null>(null);

  async function lookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setTracking(null);
    try {
      const response = await fetch("/api/checkout/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim().toUpperCase(), email: email.trim() }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTracking(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message === "NOT_FOUND" ? "No reservation found for that code and email." : message === "INVALID_INPUT" ? "Check your details and try again." : "Could not complete that request. Please try again later.");
    } finally { setBusy(false); }
  }

  return <div className="relative -mt-10 rounded-2xl border border-[#dce5e8] bg-white p-5 shadow-[0_20px_50px_rgba(68,114,68,.12)] sm:p-8">
    <h2 className="font-display text-2xl font-black uppercase text-[#447244]">Find your booking</h2>
    <p className="mt-2 text-sm leading-6 text-[#405966]">Enter both details from your booking request.</p>
    <form method="post" onSubmit={lookup} className="mt-6 grid gap-5 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold text-[#447244]">Tracking code (required)<Input name="code" required maxLength={5} value={code} onChange={e => setCode(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-describedby="tracking-code-help" className="min-h-12 text-base" /><span id="tracking-code-help" className="text-sm font-normal leading-5 text-[#405966]">The 5-character code from your confirmation email.</span></label>
      <label className="grid gap-2 text-sm font-bold text-[#447244]">Email (required)<Input name="email" required type="email" autoComplete="email" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} aria-describedby="tracking-email-help" className="min-h-12 text-base" /><span id="tracking-email-help" className="text-sm font-normal leading-5 text-[#405966]">Use the email address you booked with.</span></label>
      <Button disabled={busy} type="submit" className="min-h-12 w-full bg-[#447244] px-7 text-base text-white hover:bg-[#447244] sm:col-span-2 sm:w-auto sm:justify-self-start">{busy ? "Checking…" : "Track reservation"}</Button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {tracking && <div role="status" className="mt-5 space-y-2 border-t pt-4 text-sm text-[#447244]"><p>Reservation: <strong className="capitalize">{tracking.status}</strong> · {formatDisplayDate(tracking.operatingDate)} · ₱{tracking.total}</p>{tracking.status === "pending" && <p>Pending review; not yet confirmed.</p>}{tracking.items.map((item, i) => <p key={i}>{item.court}: {formatDate(item.startsAt)} – {formatDate(item.endsAt)}</p>)}{tracking.payments.map((payment, i) => <p key={i}>Payment: {payment.method.toUpperCase()} · {payment.status}{payment.reviewReason && tracking.status === "rejected" ? ` · Reason: ${payment.reviewReason}` : ""}</p>)}</div>}
  </div>;
}
