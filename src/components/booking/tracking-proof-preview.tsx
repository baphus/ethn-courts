"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function TrackingProofPreview({ href }: { href: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  return <div className="mt-4 rounded-xl border border-border bg-muted p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-foreground">Payment proof</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Private image. Load only on a device you trust.</p></div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-input bg-background px-4 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {open ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}{open ? "Hide proof" : "Show proof"}
      </button>
    </div>
    {open && <div className="mt-4" aria-live="polite">{failed ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">Could not load payment proof. It may no longer be available. Try again later.</p> : <img src={href} alt="Submitted payment proof" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="mx-auto max-h-[32rem] w-full rounded-lg border border-border bg-background object-contain" />}</div>}
  </div>;
}
