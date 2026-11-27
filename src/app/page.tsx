import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { daylightFonts } from "./daylight-fonts";
import EthnBooking from "@/components/booking/ethn-booking";
import Link from "next/link";
import { connection } from "next/server";
import { getCheckoutPool } from "@/db/checkout-client";
import { listUpcomingOpenPlays } from "@/lib/admin/ethn-open-plays";

export const metadata = { title: "ETHN Courts — Book a court", description: "Choose a court and request a reservation." };

export default async function Home() {
  await connection();
  let events: Awaited<ReturnType<typeof listUpcomingOpenPlays>> = [];
  try { events = await listUpcomingOpenPlays({ connect: () => getCheckoutPool().connect() }); } catch { /* Booking page remains available when event listing is unavailable. */ }

  const openPlays = events.length > 0 ? (
    <section aria-labelledby="upcoming-open-plays" className="landing-type bg-background px-5 py-12 text-foreground sm:py-16">
      <div className="mx-auto max-w-[70rem]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="upcoming-open-plays" className="landing-heading">Upcoming Open Plays</h2>
          <Link href="/open-plays" className="font-semibold underline underline-offset-4">View all Open Plays</Link>
        </div>
        <div className={`mt-7 grid gap-4 ${events.length === 2 ? "md:grid-cols-2" : events.length > 2 ? "md:grid-cols-3" : ""}`}>
          {events.map((event, index) => <article key={event.id} className={`public-card rounded-2xl border border-border p-5 ${index === 0 ? "bg-primary text-primary-foreground" : "bg-background"}`}>
            <h3 className="break-words text-xl font-semibold">{event.title}</h3>
            <div className={`mt-4 grid gap-3 text-sm sm:grid-cols-2 ${index === 0 ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
              <p className="flex items-start gap-2"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{formatScheduleRange(event.startsAt, event.endsAt)}</p>
              <p className="flex items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{event.courtNames.join(" · ")}</p>
              <p className="flex items-start gap-2"><Users aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{event.fee === null ? "Community game" : `Hosted by ETHN Courts · Informational fee: ₱${event.fee}`}</p>
            </div>
            {event.description && <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 ${index === 0 ? "text-primary-foreground/90" : "text-muted-foreground"}`}>{event.description}</p>}
            {event.eventUrl ? <a href={event.eventUrl} target="_blank" rel="noreferrer" className={`mt-4 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${index === 0 ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90" : "underline underline-offset-4"}`}>Join on Reclub</a> : <p className={`mt-4 text-sm ${index === 0 ? "text-primary-foreground/80" : "text-muted-foreground"}`}>No Reclub link posted</p>}
          </article>)}
        </div>
      </div>
    </section>
  ) : null;

  return <div className={`daylight ${daylightFonts}`}><EthnBooking afterBooking={openPlays} /></div>;
}
