import { daylightFonts } from "@/app/daylight-fonts";
import TrackLookup from "@/components/booking/track-lookup";

export const metadata = { title: "Track a reservation — ETHN Courts" };

export default function TrackPage() {
  return (
    <main className={`daylight ${daylightFonts} min-h-svh bg-background text-foreground`}>
      <div className="mx-auto max-w-[70rem] px-4 py-12 sm:px-8 sm:py-16">
        <header className="max-w-2xl">
          <h1 className="landing-heading text-foreground">Track your reservation</h1>
          <p className="mt-4 max-w-prose text-base leading-7 text-muted-foreground">Use the tracking code and email from your request to see where your booking stands.</p>
        </header>
        <section className="public-card mt-8 max-w-3xl rounded-xl border border-border bg-card p-5 sm:mt-10 sm:p-7">
          <TrackLookup />
        </section>
        <p className="mt-6 text-sm leading-6 text-muted-foreground">Looking to make a reservation? <a href="/book" className="font-bold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Book a court</a></p>
      </div>
    </main>
  );
}
