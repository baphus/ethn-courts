"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, MapPin, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { BookingStatusBadge } from "@/components/booking/booking-status";
import { VENUE_PHONE_DISPLAY, VENUE_PHONE_LINK } from "@/lib/booking/constants";
import { formatDisplayDate } from "@/lib/display-date";
import { VENUE_ADDRESS, VENUE_FACEBOOK_LINK, VENUE_MAP_EMBED, VENUE_MAP_LINK } from "@/lib/venue";

type Props = {
  receipt: {
    status: string;
    customerName: string;
    maskedEmail: string;
    operatingDate: string;
    total: string;
    paymentMethod: string;
    items: { court: string; startsAt: string; endsAt: string; amount: string }[];
  };
  trackingToken: string;
  code: string;
  onAnotherBooking: () => void;
};

const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f28500]";

export default function EthnBookingReceipt({ receipt, trackingToken, code, onAnotherBooking }: Props) {
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

  return <div className="mx-auto w-full max-w-3xl space-y-4 pb-6 text-[#17252e]">
    <section className="overflow-hidden rounded-2xl border border-[#d5e2ce] bg-[#fffdf7] shadow-sm">
      <div className="h-2 bg-[#447244]" />
      <div className="p-5 sm:p-6">
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-black tracking-tight outline-none sm:text-4xl">Request received.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#405966]">Thank you, {receipt.customerName}. Keep this receipt to check your reservation status.</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">Current status:</span> <BookingStatusBadge state={receipt.status} /></div>
        {receipt.status.toLowerCase() === "pending" && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">Pending review. Your reservation is not yet confirmed; staff must verify your payment.</p>}
      </div>
    </section>

    <div className="space-y-4"><section aria-labelledby="receipt-details" className="rounded-2xl border border-[#d5e2ce] bg-[#fffdf7] p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#dce5dc] pb-4"><h2 id="receipt-details" className="font-display text-xl font-bold">Booking details</h2><p className="text-sm text-[#405966]">Operating date · {formatDisplayDate(receipt.operatingDate)}</p></div>
      <ul className="divide-y divide-[#e5ebe3]">{receipt.items.map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-4"><div><p className="font-bold">{item.court}</p><p className="mt-1 text-sm leading-relaxed text-[#405966]">{dateTime(item.startsAt)} – {dateTime(item.endsAt)} <span className="whitespace-nowrap">(Manila time)</span></p></div><p className="font-semibold tabular-nums">₱{item.amount}</p></li>)}</ul>
      <dl className="space-y-2 border-t border-[#dce5dc] pt-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-[#405966]">Payment method</dt><dd className="text-right font-semibold">{receipt.paymentMethod}</dd></div><div className="flex justify-between gap-4"><dt className="text-[#405966]">Email</dt><dd className="break-all text-right font-semibold">{receipt.maskedEmail}</dd></div><div className="flex justify-between gap-4 pt-2 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">₱{receipt.total}</dd></div></dl>
    </section>

    <section aria-labelledby="private-status" className="@container rounded-2xl border border-[#d5e2ce] bg-[#fffdf7] p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f0e3] text-[#447244]"><QrCode className="size-5" aria-hidden="true" /></span><div><h2 id="private-status" className="text-xl font-bold">Your private status link</h2><p className="mt-1 text-sm leading-relaxed text-[#405966]">Scan to view your reservation status. This is not a check-in pass. Keep the QR and link private; do not share them widely.</p></div></div>
      <div className="mt-6 flex flex-col items-center gap-5 text-center @lg:flex-row @lg:items-start @lg:gap-6 @lg:text-left">
        <div className="shrink-0 rounded-2xl border border-[#dce5dc] bg-white p-3">{url ? <QRCodeCanvas ref={qrRef} value={url} size={280} level="M" marginSize={4} style={{ width: 160, height: 160 }} aria-label="QR code for your private reservation status" /> : <div className="grid h-40 w-40 place-items-center text-sm text-[#405966]">Preparing QR…</div>}</div>
        <div className="w-full min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#447244]">Tracking code</p>
          <p className="mt-2 break-all font-mono text-2xl font-bold tracking-wider">{code}</p>
          <div className="mt-4 flex flex-col gap-2 @lg:flex-row @lg:flex-wrap">
            <a href={path} className={`${button} bg-[#447244] text-white hover:bg-[#315b34]`}>View status</a>
            <button type="button" onClick={copyLink} className={`${button} border border-[#b9cbb6] bg-white hover:bg-[#eef5eb]`}><Copy className="size-4" aria-hidden="true" /> Copy link</button>
            <button type="button" onClick={download} className={`${button} border border-[#b9cbb6] bg-white hover:bg-[#eef5eb]`}><Download className="size-4" aria-hidden="true" /> Download QR</button>
          </div>
          <p role="status" className="mt-3 min-h-5 text-sm text-[#315f35]"><span key={feedback.count}>{feedback.text}</span></p>
        </div>
      </div>
    </section>

    </div><section aria-labelledby="venue-location" className="rounded-2xl border border-[#d5e2ce] bg-[#fffdf7] p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f0e3] text-[#447244]"><MapPin className="size-5" aria-hidden="true" /></span><div><h2 id="venue-location" className="text-xl font-bold">Find ETHN Courts</h2><p className="mt-2 text-sm leading-relaxed text-[#405966]">{VENUE_ADDRESS}</p></div></div><iframe title="Map showing ETHN Courts" src={VENUE_MAP_EMBED} loading="lazy" referrerPolicy="no-referrer" className="mt-5 h-56 w-full rounded-xl border border-[#dce5dc]" /><div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-bold"><a href={VENUE_MAP_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-[#315f35] underline underline-offset-2">Get directions <ExternalLink className="size-4" aria-hidden="true" /></a><a href={VENUE_PHONE_LINK} className="text-[#315f35] underline underline-offset-2">{VENUE_PHONE_DISPLAY}</a><a href={VENUE_FACEBOOK_LINK} target="_blank" rel="noopener noreferrer" className="text-[#315f35] underline underline-offset-2">Message on Facebook</a></div></section>
    <button type="button" onClick={onAnotherBooking} className={`${button} w-full border border-[#b9cbb6] bg-[#fffdf7] hover:bg-[#eef5eb] sm:w-auto`}>Book another time</button>
  </div>;
}
