"use client";
import { TrackingSummary, type Tracking } from "@/components/booking/tracking-summary";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function TrackLookup() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [credentials, setCredentials] = useState<{ code: string; email: string } | null>(null);
  const [play, setPlay] = useState<{ editable: boolean; listing: { title: string; description: string; eventUrl: string; hidden: boolean } | null } | null>(null);
  const [playBusy, setPlayBusy] = useState(false);
  const [playError, setPlayError] = useState("");
  const [playMessage, setPlayMessage] = useState("");

  async function lookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || playBusy) return;
    setBusy(true); setError(""); setTracking(null); setPlay(null); setCredentials(null); setPlayError(""); setPlayMessage("");
    const submitted = { code: code.trim().toUpperCase(), email: email.trim() };
    try {
      const response = await fetch("/api/checkout/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submitted), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTracking(data);
      setCredentials(submitted);
      if (data.openPlay) setPlay(data.openPlay);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message === "NOT_FOUND" ? "No reservation found for that code and email." : message === "INVALID_INPUT" ? "Check your details and try again." : "Could not complete that request. Please try again later.");
    } finally { setBusy(false); }
  }

  async function savePlay(formElement: HTMLFormElement, remove = false) {
    if (playBusy || !credentials || !play?.editable) return;
    const form = new FormData(formElement);
    const title = String(form.get("play-title") ?? "").trim();
    const description = String(form.get("play-description") ?? "").trim();
    const eventUrl = String(form.get("play-url") ?? "").trim();
    setPlayBusy(true); setPlayError(""); setPlayMessage("");
    try {
      const response = await fetch("/api/checkout/track", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, listing: remove ? null : { title, description, eventUrl } }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setTracking(data);
      setPlay(data.openPlay);
      setPlayMessage(remove ? "Open Play removed. Your court booking is unchanged." : "Open Play details saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setPlayError(message === "INVALID_INPUT" ? "Enter a title. Reclub link is optional; when provided, use a direct event link, such as https://reclub.co/m/ABC123." : message === "OPEN_PLAY_NOT_EDITABLE" ? "This booking is no longer eligible. Track the reservation again to refresh its details." : "Could not save your Open Play details. Please try again.");
    } finally { setPlayBusy(false); }
  }

  return <div className="relative -mt-10 rounded-2xl border border-[#dce5e8] bg-white p-5 shadow-[0_20px_50px_rgba(68,114,68,.12)] sm:p-8">
    <h2 className="font-display text-2xl font-black uppercase text-[#447244]">Find your booking</h2>
    <p className="mt-2 text-sm leading-6 text-[#405966]">Enter both details from your booking request.</p>
    <form method="post" onSubmit={lookup} className="mt-6 grid gap-5 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold text-[#447244]">Tracking code (required)<Input name="code" required maxLength={5} value={code} onChange={e => setCode(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-describedby="tracking-code-help" className="min-h-12 text-base" /><span id="tracking-code-help" className="text-sm font-normal leading-5 text-[#405966]">The 5-character code from your booking receipt.</span></label>
      <label className="grid gap-2 text-sm font-bold text-[#447244]">Email (required)<Input name="email" required type="email" autoComplete="email" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} aria-describedby="tracking-email-help" className="min-h-12 text-base" /><span id="tracking-email-help" className="text-sm font-normal leading-5 text-[#405966]">Use the email address you booked with.</span></label>
      <Button disabled={busy || playBusy} type="submit" className="public-cta-primary min-h-12 w-full px-7 text-base font-bold sm:col-span-2 sm:w-auto sm:justify-self-start">{busy ? "Checking…" : "Track reservation"}</Button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    <div aria-live="polite">{tracking && <div className="mt-6"><TrackingSummary booking={tracking} />{play?.editable && <section className="mt-6 rounded-2xl border border-[#dce5e8] bg-[#f7faf8] p-5 sm:p-7" aria-labelledby="open-play-details"><h2 id="open-play-details" className="font-display text-2xl font-bold text-[#447244]">{play.listing ? "Edit Open Play" : "Hosting an Open Play?"}</h2><p className="mt-2 text-sm leading-6 text-[#405966]">Notes are public. Do not include contact or payment details. Keep your Reclub event in sync if your booked schedule changes.</p>{tracking.status === "pending" && <p className="mt-2 text-sm">Your listing goes public after your booking is confirmed.</p>}{play.listing?.hidden && <p className="mt-3 text-sm font-semibold text-[#8a4b16]">Your listing is hidden by staff.</p>}<form method="post" aria-labelledby="open-play-details" key={play.listing ? "existing" : "new"} onSubmit={event => { event.preventDefault(); void savePlay(event.currentTarget); }} className="mt-4 space-y-4"><label className="grid gap-2 text-sm font-bold text-[#447244]">Title (required)<Input name="play-title" required maxLength={100} defaultValue={play.listing?.title ?? ""} disabled={playBusy} /></label><label className="grid gap-2 text-sm font-bold text-[#447244]">Public notes<textarea name="play-description" maxLength={500} defaultValue={play.listing?.description ?? ""} disabled={playBusy} className="min-h-24 rounded-md border border-input bg-transparent p-3 text-sm font-normal" /></label><label className="grid gap-2 text-sm font-bold text-[#447244]">Reclub event link (optional)<Input name="play-url" type="url" maxLength={256} defaultValue={play.listing?.eventUrl ?? ""} disabled={playBusy} /></label><Button type="submit" disabled={playBusy}>{playBusy ? "Saving…" : play.listing ? "Save changes" : "Add listing"}</Button>{play.listing && <Button type="button" variant="outline" disabled={playBusy} onClick={event => { if (event.currentTarget.form) void savePlay(event.currentTarget.form, true); }}>Remove listing</Button>}{playError && <p role="alert" className="text-sm text-destructive">{playError}</p>}{playMessage && <p role="status" className="text-sm text-[#447244]">{playMessage}</p>}</form></section>}</div>}</div>
  </div>;
}
