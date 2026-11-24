import SetupForm from "./setup-form";

export const metadata = {
  title: "First Owner Setup — ETHN Courts",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center gap-4 overflow-hidden bg-[#447244] p-6 text-white md:p-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(242,133,0,.2),transparent_38%),linear-gradient(135deg,#447244,#447244)]" />
      <div className="relative z-10 w-full max-w-sm">
        <SetupForm />
      </div>
      <a href="/" className="relative z-10 text-xs text-white/70 underline-offset-4 hover:underline">← Back to site</a>
    </main>
  );
}
