"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, MapPin, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { BookingStatusBadge } from "@/components/booking/booking-status";
import { VENUE_PHONE_DISPLAY, VENUE_PHONE_LINK } from "@/lib/booking/constants";
import { BookingInvoice } from "@/components/booking/ethn-booking-invoice";
import { VENUE_ADDRESS, VENUE_FACEBOOK_LINK, VENUE_MAP_EMBED, VENUE_MAP_LINK } from "@/lib/venue";

type Props = {
  receipt: {
    status: string;
    customerName: string;
    maskedEmail: string;
    operatingDate: string;
    total: string;
    paymentMethod: string;
    items: { court: string; startsAt: string; endsAt: string; amount: string; durationMinutes: number; intervalMinutes: number; hourlyRate: string }[];
  };
  trackingToken: string;
  code: string;
  openPlaySaved?: boolean;
  onAnotherBooking: () => void;
};

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function EthnBookingReceipt({ receipt, trackingToken, code, openPlaySaved, onAnotherBooking }: Props) {
  const [url, setUrl] = useState("");
  const [feedback, setFeedback] = useState({ text: "", count: 0 });
  const qrRef = useRef<HTMLCanvasElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const path = `/checkout/track/${encodeURIComponent(trackingToken)}`;

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
    headingRef.current?.focus();
  }, [path]);

  const announce = (text: string) => setFeedback(previous => ({ text, count: previous.count + 1 }));
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      announce("Link copied.");
    } catch {
      announce("Could not copy link. Open View status and copy it from the address bar.");
    }
  };
  const download = () => {
    try {
      if (!qrRef.current) throw new Error("QR unavailable");
      const link = document.createElement("a");
      link.href = qrRef.current.toDataURL("image/png");
      link.download = "ethn-private-status-qr.png";
      link.click();
      announce("QR download started.");
    } catch {
      announce("Could not download QR code. Please try again.");
    }
  };

  return <div className="mx-auto w-full max-w-3xl space-y-4 pb-6 text-foreground">
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-2 bg-primary" />
      <div className="p-5 sm:p-6">
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-black tracking-tight outline-none sm:text-4xl">{receipt.status.toLowerCase() === "pending" ? "Payment proof submitted" : "Request received"}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Thank you, {receipt.customerName}. Keep this receipt to check your reservation status.</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">Current status:</span> <BookingStatusBadge state={receipt.status} /></div>
        <p className="mt-3 text-sm">{openPlaySaved === true ? "Open Play details saved. Your listing stays private until your booking is confirmed. " : openPlaySaved === false ? "Your booking request was received, but your Open Play listing could not be added because the court times no longer qualify. " : null}<a href="/track" className="font-semibold underline">{openPlaySaved === true ? "Manage your Open Play" : "Hosting an Open Play?"}</a> Use your tracking code and booking email.</p>
        {receipt.status.toLowerCase() === "pending" && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">Pending review. Your reservation is not yet confirmed; staff must verify your payment.</p>}
      </div>
    </section>

    <div className="space-y-4">
    <section aria-labelledby="private-status" className="@container rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-foreground"><QrCode className="size-5" aria-hidden="true" /></span><div><h2 id="private-status" className="text-xl font-bold">Your private status link</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Scan to view your reservation status. This is not a check-in pass. Keep the QR and link private; do not share them widely.</p></div></div>
      <div className="mt-6 flex flex-col items-center gap-5 text-center @lg:flex-row @lg:items-start @lg:gap-6 @lg:text-left">
        <div className="shrink-0 rounded-2xl border border-border bg-white p-3">{url ? <QRCodeCanvas ref={qrRef} value={url} size={280} level="M" marginSize={4} style={{ width: 160, height: 160 }} aria-label="QR code for your private reservation status" /> : <div className="grid h-40 w-40 place-items-center text-sm text-muted-foreground">Preparing QR…</div>}</div>
        <div className="w-full min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground">Tracking code</p>
          <p className="mt-2 break-all tabular-nums text-2xl font-bold tracking-wider">{code}</p>
          <div className="mt-4 flex flex-col gap-2 @lg:flex-row @lg:flex-wrap">
            <a href={path} className={`${button} public-cta-primary`}>View status</a>
            <button type="button" onClick={copyLink} className={`${button} border border-input bg-background hover:bg-accent`}><Copy className="size-4" aria-hidden="true" /> Copy link</button>
            <button type="button" onClick={download} className={`${button} border border-input bg-background hover:bg-accent`}><Download className="size-4" aria-hidden="true" /> Download QR</button>
          </div>
          <p role="status" className="mt-3 min-h-5 text-sm text-primary"><span key={feedback.count}>{feedback.text}</span></p>
        </div>
      </div>
    </section>

      <BookingInvoice date={receipt.operatingDate} items={receipt.items} paymentMethod={receipt.paymentMethod} email={receipt.maskedEmail} total={receipt.total} />
    </div><section aria-labelledby="venue-location" className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-foreground"><MapPin className="size-5" aria-hidden="true" /></span><div><h2 id="venue-location" className="text-xl font-bold">Find ETHN Courts</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{VENUE_ADDRESS}</p></div></div><iframe title="Map showing ETHN Courts" src={VENUE_MAP_EMBED} loading="lazy" referrerPolicy="no-referrer" className="mt-5 h-56 w-full rounded-xl border border-border" /><div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-bold"><a href={VENUE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-primary underline underline-offset-2">Get directions <ExternalLink className="size-4" aria-hidden="true" /></a><a href={VENUE_PHONE_LINK} className="text-primary underline underline-offset-2">{VENUE_PHONE_DISPLAY}</a><a href={VENUE_FACEBOOK_LINK} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Message on Facebook</a></div></section>
    <button type="button" onClick={onAnotherBooking} className={`${button} w-full border border-input bg-card hover:bg-accent sm:w-auto`}>Book another time</button>
  </div>;
}
