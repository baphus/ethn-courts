import { daylightFonts } from "@/app/daylight-fonts";
import { getCheckoutPool } from "@/db/checkout-client";
import { listPublicOpenPlays, listPublicOpenPlayById } from "@/lib/admin/ethn-open-plays";
import { OpenPlaySchedule } from "./open-play-schedule";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open Plays — ETHN Courts" };

export default async function OpenPlaysPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const requestedEvent = (await searchParams).event;
  const id = typeof requestedEvent === "string" ? requestedEvent : undefined;
  const pool = { connect: () => getCheckoutPool().connect() };
  let events: Awaited<ReturnType<typeof listPublicOpenPlays>> | null = null;
  let targetEvent: Awaited<ReturnType<typeof listPublicOpenPlayById>> = null;
  try {
    events = await listPublicOpenPlays(pool, "schedule");
    if (id) {
      targetEvent = await listPublicOpenPlayById(pool, id);
      if (!targetEvent) events = events.filter(event => event.id !== id);
    }
  } catch {
    if (id && events) events = events.filter(event => event.id !== id);
    /* Show a safe unavailable state. */
  }

  return (
    <main className={`daylight ${daylightFonts} min-h-svh bg-background text-foreground`}>
      <div className="mx-auto max-w-[70rem] px-4 py-12 sm:px-8 sm:py-16">
        <header className="max-w-2xl">
          <h1 className="landing-heading text-foreground">Find a game</h1>
        </header>
        <div className="mt-10 sm:mt-14">
          {events === null ? (
            <section className="public-card rounded-xl border border-border bg-card p-6">
              <h2 className="font-display text-2xl font-bold text-foreground">Open plays are temporarily unavailable</h2>
              <a href="/open-plays" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Try again</a>
            </section>
          ) : <OpenPlaySchedule events={events} initialNow={Date.now()} targetEvent={targetEvent} />}
        </div>
      </div>
    </main>
  );
}
