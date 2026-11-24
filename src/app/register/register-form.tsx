"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingAnimation } from "@/components/ui/loading-animation";

export default function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    fetch(`/api/auth/invites/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((b: { valid?: boolean }) => setValid(b.valid === true))
      .catch(() => setValid(false));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, email, password }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(body.error?.message ?? "Registration failed.");
        return;
      }
      router.push("/login?next=/admin");
      router.refresh();
    } catch {
      setError("Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-white/15 bg-white p-0 text-[#17252e] shadow-2xl shadow-black/25">
      <CardContent className="grid p-0 md:grid-cols-2">
        <form onSubmit={onSubmit} className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <img src="/ethn-courts-logo.svg" alt="ETHN Courts" className="h-auto w-40" />
            <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight text-[#447244]">Create admin account</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Set up your ETHN Courts staff account
            </p>
          </div>

          {valid === null ? (
            <LoadingAnimation label="Checking invite" className="min-h-24" />
          ) : !valid ? (
            <FieldGroup>
              <Field>
                <FieldError>This invite link is invalid or already used.</FieldError>
              </Field>
            </FieldGroup>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </Field>

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
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </Field>

              <Field>
                <FieldError>{error}</FieldError>
                <Button type="submit" disabled={busy} className="w-full rounded-lg bg-[#f28500] font-bold text-white hover:bg-[#d97300]">
                  {busy ? (
                    <span className="flex items-center justify-center gap-2">
                      <LoadingAnimation size="compact" label="Creating account" />
                      Creating account…
                    </span>
                  ) : (
                    "Create admin account"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          )}
        </form>

        <div className="relative hidden md:block">
          <Image
            src="/images/net.jpg"
            alt="Pickleball court at ETHN Courts"
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover dark:brightness-[0.2] dark:grayscale"
          />
        </div>
      </CardContent>
    </Card>
  );
}
