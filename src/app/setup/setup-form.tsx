"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingAnimation } from "@/components/ui/loading-animation";

const messages: Record<string, string> = {
  INVALID_INPUT: "Enter a valid email and a password between 12 and 128 characters.",
  INVALID_SETUP_KEY: "Setup key is incorrect. Check it and try again.",
  SETUP_CLOSED: "First owner setup is already complete. Sign in instead.",
  ACCOUNT_UNAVAILABLE: "This account cannot be used. Try a different email address.",
  SETUP_UNAVAILABLE: "Setup is currently unavailable. Please try again later.",
};

export default function SetupForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "open" | "closed" | "unavailable" | "created">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ethn/setup", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (typeof body.available !== "boolean") throw new Error();
        setStatus(body.available ? "open" : "closed");
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("unavailable"); });
    return () => controller.abort();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current || status !== "open") return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ethn/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, setupKey }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === "SETUP_CLOSED") {
          setStatus("closed");
        } else {
          setError(messages[body.error as string] ?? "Setup could not be completed. Please try again later.");
        }
        return;
      }
      if (body.created !== true) throw new Error();
      setStatus("created");
      setSetupKey("");
      setPassword("");
      try {
        const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInError) {
          router.push("/admin");
          router.refresh();
        }
      } catch {
        // Account already exists; sign in separately if automatic sign-in fails.
      }
    } catch {
      setError("Setup could not be completed. Please try again later.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-white/15 bg-white p-0 text-[#17252e] shadow-2xl shadow-black/25">
      <CardContent className="p-0">
        <div className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <img src="/ethn-courts-logo.svg" alt="ETHN Courts" className="h-auto w-40" />
            <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-[#447244]">First owner setup</h1>
            <p className="text-balance text-sm text-muted-foreground">Create the first owner account for ETHN Courts.</p>
          </div>
          {status === "checking" && <p role="status" className="text-center text-sm text-muted-foreground">Checking setup availability…</p>}
          {status === "open" && (
            <form onSubmit={onSubmit}>
              <FieldGroup>
                <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com" required disabled={busy} /></Field>
                <Field><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} /></Field>
                <Field><FieldLabel htmlFor="setup-key">Setup key</FieldLabel><Input id="setup-key" type="password" autoComplete="off" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} required disabled={busy} /><p className="text-xs text-muted-foreground">Enter the setup key provided by your administrator.</p></Field>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={busy} className="w-full rounded-lg bg-[#f28500] font-bold text-white hover:bg-[#d97300]">
                  {busy ? <span className="flex items-center justify-center gap-2"><LoadingAnimation size="compact" label="Creating account" />Creating account…</span> : "Create owner account"}
                </Button>
              </FieldGroup>
            </form>
          )}
          {status === "closed" && <p role="status" className="text-center text-sm text-muted-foreground">First owner setup is already complete.</p>}
          {status === "unavailable" && <p role="alert" className="text-center text-sm text-muted-foreground">Setup is currently unavailable. Please try again later.</p>}
          {status === "created" && <p role="status" className="text-center text-sm text-muted-foreground">Your owner account was created. If you are not signed in automatically, sign in below.</p>}
          {status !== "checking" && <a href="/login" className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-[#447244]">Go to staff sign in</a>}
        </div>
      </CardContent>
    </Card>
  );
}
