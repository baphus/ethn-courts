import TrackLookup from "@/components/booking/track-lookup";

export const metadata = { title: "Track a reservation — ETHN Courts" };

export default function TrackPage() {
  return (
    <main className="min-h-svh bg-surface text-on-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
        <header className="max-w-2xl">
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight text-[#26422A] sm:text-6xl">Track your reservation</h1>
          <p className="mt-4 max-w-prose text-base leading-7 text-[#3C3835]">Use the tracking code and email from your request to see where your booking stands.</p>
        </header>
        <section className="mt-8 max-w-3xl rounded-xl border border-[#E8DDC8] bg-white p-5 sm:mt-10 sm:p-7">
          <TrackLookup />
        </section>
        <p className="mt-6 text-sm leading-6 text-[#3C3835]">Looking to make a reservation? <a href="/book" className="font-bold text-[#7f2a00] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Book a court</a></p>
      </div>
    </main>
  );
}
