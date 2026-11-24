import { Suspense } from "react";
import ResetPasswordForm from "./reset-password-form";

export const metadata = {
  title: "Set New Password — ETHN Courts",
};

export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-4 overflow-hidden bg-[#447244] p-6 text-white md:p-10"><div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(242,133,0,.2),transparent_38%),linear-gradient(135deg,#447244,#447244)]"/>
      <div className="relative z-10 w-full max-w-sm">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
