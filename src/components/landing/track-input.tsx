"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

// Short tracking code: exactly 5 uppercase alphanumeric chars
const TRACKING_CODE_RE = /^[A-Z0-9]{5}$/;

export default function TrackInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(raw: string, rawEmail: string) {
    const code = raw.trim().toUpperCase().replace(/\s+/g, "");
    const cleanEmail = rawEmail.trim();
    if (!code) {
      toast.error("Enter your tracking code from the confirmation email.");
      return;
    }
    if (!TRACKING_CODE_RE.test(code)) {
      toast.error("Tracking codes are 5 characters, like AB3K7. Check your confirmation email.");
      return;
    }
    if (!cleanEmail) {
      toast.error("Enter the email address you used to book.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `/api/booking/track?code=${encodeURIComponent(code)}&email=${encodeURIComponent(cleanEmail)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No booking found. Double-check the code and email and try again.");
        return;
      }
      router.push(`/track/${encodeURIComponent(data.token)}`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        go(value, email);
      }}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="track-code" className="mb-1.5 block text-sm font-semibold text-ink">
            Tracking code
          </label>
          <input
            id="track-code"
            name="code"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder="e.g. AB3K7"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            maxLength={5}
            className="h-12 w-full rounded-xl border border-[#767676] bg-white px-4 text-base font-medium tracking-widest text-ink placeholder:tracking-normal placeholder:text-[#68635b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          />
        </div>
        <div>
          <label htmlFor="track-email" className="mb-1.5 block text-sm font-semibold text-ink">
            Email address used to book
          </label>
          <input
            id="track-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            spellCheck={false}
            className="h-12 w-full rounded-xl border border-[#767676] bg-white px-4 text-base font-medium text-ink placeholder:text-[#68635b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          />
        </div>
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-pine px-6 text-base font-bold text-white transition-colors hover:bg-pine-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>Checking…</span>
            </>
          ) : (
            <>
              <Search className="size-4" aria-hidden />
              <span>Check status</span>
            </>
          )}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-warm-muted/80">
        Use both details from your booking: the 5-character code in your confirmation email and the same email address you booked with.
      </p>
    </form>
  );
}
