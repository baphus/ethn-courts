import { getCheckoutPool } from "@/db/checkout-client";
import { listPublicOpenPlays } from "@/lib/admin/ethn-open-plays";
import { OpenPlaySchedule } from "./open-play-schedule";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open Plays — ETHN Courts" };

export default async function OpenPlaysPage() {
  let events: Awaited<ReturnType<typeof listPublicOpenPlays>> | null = null;
  try { events = await listPublicOpenPlays({ connect: () => getCheckoutPool().connect() }, false, "schedule"); } catch { /* Show a safe unavailable state. */ }

  return (
    <main className="public-surface min-h-svh bg-white text-on-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
        <header className="max-w-2xl">
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight text-[#26422A] sm:text-6xl">Find a game</h1>
        </header>
        <div className="mt-10 sm:mt-14">
          {events === null ? (
            <section className="public-card rounded-xl border border-[#dce5e8] bg-white p-6">
              <h2 className="font-display text-2xl font-bold text-[#26422A]">Open plays are temporarily unavailable</h2>
              <a href="/open-plays" className="mt-3 inline-flex min-h-11 items-center font-semibold text-[#7f2a00] underline underline-offset-4">Try again</a>
            </section>
          ) : <OpenPlaySchedule events={events} initialNow={Date.now()} />}
        </div>
      </div>
    </main>
  );
}
