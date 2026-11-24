import TrackLookup from "@/components/booking/track-lookup";

export const metadata = { title: "Track a reservation — ETHN Courts" };

export default function TrackPage() {
  return (
    <main className="min-h-svh bg-[#f6f8f8] text-[#447244]">
      <div className="bg-[#447244] px-5 pb-20 pt-12 text-white sm:px-8 sm:pb-24 sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#ffad4c]">Your reservation</p>
          <h1 className="font-display mt-4 max-w-3xl text-5xl font-black uppercase leading-[.9] tracking-tight text-[#ffad4c] sm:text-7xl">Track your<br />reservation</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/80">Use the tracking code and email from your request to see where your booking stands.</p>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <TrackLookup />
        <p className="mt-8 text-sm leading-6 text-[#405966]">Looking to make a reservation? <a href="/book" className="font-bold text-[#447244] underline underline-offset-4 hover:text-[#a85400] focus-visible:outline-2 focus-visible:outline-offset-4">Book a court</a></p>
      </div>
    </main>
  );
}
