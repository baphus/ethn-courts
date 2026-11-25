"use client";

import { useState } from "react";

export function CopyTrackingLink() {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`);
      setMessage("Private link copied.");
    } catch {
      setMessage("Could not copy link. Please copy it from your browser address bar.");
    }
  }
  return <div className="rounded-2xl border border-[#dce5e8] bg-white p-5 sm:p-7">
    <h2 className="font-display text-xl font-bold text-[#447244]">Keep your private link</h2>
    <p className="mt-2 text-sm leading-6 text-[#405966]">Anyone with this link can view your reservation. Share it only with people you trust.</p>
    <button type="button" onClick={copy} className="public-cta-secondary mt-4 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold">Copy private link</button>
    <p role="status" aria-live="polite" className="mt-2 text-sm text-[#405966]">{message}</p>
  </div>;
}
