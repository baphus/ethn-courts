import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = {
  title: "Staff Sign In — ETHN Courts",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-4 overflow-hidden bg-[#092433] p-6 text-white md:p-10"><div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(242,133,0,.2),transparent_38%),linear-gradient(135deg,#092433,#16384d)]"/>
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
