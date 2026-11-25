import { EmptyIcon } from "@/components/ui/empty-icon";
import Link from "next/link";
import { getCheckoutPool } from "@/db/checkout-client";
import { listPublicOpenPlays } from "@/lib/admin/ethn-open-plays";

export const dynamic = "force-dynamic";
export const metadata = { title: "Open Plays — ETHN Courts" };
const format = (date: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

export default async function OpenPlaysPage() {
  let events: Awaited<ReturnType<typeof listPublicOpenPlays>> | null = null;
  try { events = await listPublicOpenPlays({ connect: () => getCheckoutPool().connect() }); } catch { /* Show a safe unavailable state. */ }
  return <main className="min-h-screen bg-[#f3f7f8] text-[#447244]">

    <div className="mx-auto max-w-6xl px-5 py-12 sm:py-20"><div className="max-w-2xl"><h1 className="font-display text-5xl font-black uppercase leading-[.9] tracking-tight sm:text-7xl">Open Plays</h1><p className="mt-5 text-base leading-7 text-[#58717e]">Find open play sessions at the courts. Fees are informational only.</p></div>
      <section aria-labelledby="sessions" className="mt-12"><div className="flex items-end justify-between border-b border-[#cbd9dd] pb-4"><h2 id="sessions" className="font-display text-3xl">Sessions</h2><span className="text-xs font-bold uppercase tracking-widest text-[#718189]">Local time</span></div>
      {events === null ? <p role="alert" className="mt-6 rounded-2xl bg-white p-6">Open plays are unavailable right now. Please try again later.</p> : events.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[#b8cbd0] bg-white p-8 text-center"><EmptyIcon className="size-8" /><h3 className="font-display text-2xl">Nothing on the calendar yet.</h3><p className="mt-2 text-sm text-[#58717e]">No sessions to show right now.</p></div> : <div className="mt-6 grid gap-4 md:grid-cols-2">{events.map(event => <article key={event.id} className="rounded-2xl border border-[#dce5e8] bg-white p-6 shadow-sm"><h3 className="font-display break-words text-3xl">{event.title}</h3><p className="mt-2 text-sm text-[#58717e]">{event.courtNames.join(" · ")}</p><p className="mt-4 text-sm font-semibold">{format(event.startsAt)} – {format(event.endsAt)}</p>{event.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#58717e]">{event.description}</p>}<p className="mt-5 border-t border-[#e7eef0] pt-4 text-sm">Informational fee: ₱{event.fee}</p></article>)}</div>}</section>
    </div><footer className="bg-[#447244] px-5 py-8 text-sm text-white/70"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3"><span className="font-bold tracking-widest text-white">ETHN <span className="text-[#f28500]">COURTS</span></span><span>Daylor Village, Abucayan, Balamban, Cebu</span></div></footer>
  </main>;
}
