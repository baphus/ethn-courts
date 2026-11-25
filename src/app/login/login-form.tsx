"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingAnimation } from "@/components/ui/loading-animation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin/bookings";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Sign-in failed.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-white/15 bg-white p-0 text-[#17252e] shadow-2xl shadow-black/25">
      <CardContent className="p-0">
        <form onSubmit={onSubmit} className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <img src="/ethn-courts-logo.svg" alt="ETHN Courts" className="h-auto w-40" />
            <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-[#447244]">Welcome back</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Sign in to your ETHN Courts staff account
            </p>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>

            <Field>
              <FieldError>{error}</FieldError>
              <Button type="submit" disabled={busy} className="public-cta-primary w-full rounded-lg font-bold">
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingAnimation size="compact" label="Signing in" />
                    Signing in…
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>
              <a
                href="/forgot-password"
                className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Forgot password?
              </a>
            </Field>
          </FieldGroup>
        </form>

      </CardContent>
    </Card>
  );
}
