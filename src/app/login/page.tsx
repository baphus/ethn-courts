import { Suspense } from "react";
import { redirect } from "next/navigation";
import { setupAvailable } from "@/lib/admin/ethn-setup-server";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Staff Sign In — ETHN Courts",
};

export default async function LoginPage() {
  let needsSetup = false;
  try { needsSetup = await setupAvailable(); } catch { /* Unavailable setup must not block sign-in. */ }
  if (needsSetup) redirect("/setup");
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-4 overflow-hidden bg-[#447244] p-6 text-white md:p-10"><div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(242,133,0,.2),transparent_38%),linear-gradient(135deg,#447244,#447244)]"/>
      <div className="relative z-10 w-full max-w-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>

      <p className="relative z-10 text-xs text-white/70">
        <a href="/" className="underline-offset-4 hover:underline">
          ← Back to site
        </a>
      </p>
    </main>
  );
}
