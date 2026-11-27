import { formatScheduleRange } from "@/lib/booking/schedule-label";
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
  return <div className={`daylight ${daylightFonts}`}><EthnBooking />{events.length > 0 && <section aria-labelledby="upcoming-open-plays" className="landing-type bg-background px-5 py-12 text-foreground sm:py-16"><div className="mx-auto max-w-[70rem]"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Find your next game</p><h2 id="upcoming-open-plays" className="landing-heading mt-2">Upcoming Open Plays</h2></div><Link href="/open-plays" className="font-semibold underline underline-offset-4">View all Open Plays</Link></div><div className="mt-7 grid gap-4 md:grid-cols-3">{events.map(event => <article key={event.id} className="public-card rounded-2xl border border-border bg-background p-5"><h3 className="break-words text-xl font-semibold">{event.title}</h3><p className="mt-2 text-sm text-muted-foreground">{event.courtNames.join(" · ")}</p><p className="mt-4 text-sm font-semibold">{formatScheduleRange(event.startsAt, event.endsAt)}</p>{event.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{event.description}</p>}<p className="mt-4 text-sm">{event.fee === null ? "Customer-hosted" : `Informational fee: ₱${event.fee}`}</p>{event.eventUrl && <a href={event.eventUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Join on Reclub</a>}</article>)}</div></div></section>}</div>;
}
