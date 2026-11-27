"use client";

import { formatScheduleRange, formatScheduleTime } from "@/lib/booking/schedule-label";
import { useEffect, useState } from "react";
import { EmptyIcon } from "@/components/ui/empty-icon";
import { CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import { formatCountdown, getSchedule, type OpenPlay } from "./schedule";

const manila = { timeZone: "Asia/Manila" };
const date = new Intl.DateTimeFormat("en-PH", { ...manila, weekday: "long", month: "long", day: "numeric", year: "numeric" });
const fee = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 });

function Session({ event, now, featured = false, live = false, past = false }: {
  event: OpenPlay; now: number; featured?: boolean; live?: boolean; past?: boolean;
}) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const endDateLabel = date.format(end);
  return (
    <article className={featured
      ? "relative isolate overflow-hidden rounded-2xl border border-primary/20 bg-primary p-5 text-primary-foreground sm:p-8"
      : "rounded-xl border border-border bg-card p-4 sm:px-5"}>
      {featured && <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 -z-10 h-64 w-64 rounded-full border border-white/10"><div className="absolute inset-7 rounded-full border border-white/10" /><div className="absolute inset-14 rounded-full border border-white/10" /></div>}
      <h3 className={`font-display font-bold [overflow-wrap:anywhere] ${featured ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{event.title}</h3>
      <div className={`mt-5 grid gap-3 text-sm sm:grid-cols-2 ${featured ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
        <p className="flex items-start gap-2"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{live ? <>Until <time dateTime={event.endsAt}>{endDateLabel} · {formatScheduleTime(end)}</time></> : formatScheduleRange(start, end)}</span></p>
        <p className="flex items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{event.courtNames.join(" · ")}</span></p>
        <p className="flex items-start gap-2"><Users aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{event.fee === null ? "Community game" : `Hosted by ETHN Courts · Posted fee: ${fee.format(Number(event.fee))}`}</span></p>
        <p className="flex items-start gap-2"><Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{live ? "In progress" : past ? "Session ended" : "Open play"}</span></p>
      </div>
      {featured && <p role="timer" className="mt-4 inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold tabular-nums">{formatCountdown(start.getTime() - now)}</p>}
      {event.description && <p className={`mt-4 max-w-prose whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere] ${featured ? "text-primary-foreground/90" : "text-muted-foreground"}`}>{event.description}</p>}
      {event.eventUrl ? <a href={event.eventUrl} target="_blank" rel="noreferrer" className={`mt-5 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${featured ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90" : "public-cta-primary"}`}>View on Reclub</a> : <p className={`mt-4 text-sm ${featured ? "text-primary-foreground/80" : "text-muted-foreground"}`}>No Reclub link posted</p>}
    </article>
  );
}

export function OpenPlaySchedule({ events, initialNow }: { events: OpenPlay[]; initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  const { upcoming, live, past, nextChange } = getSchedule(events, now);
  const [next, ...later] = upcoming;
  const remaining = next ? Date.parse(next.startsAt) - now : Infinity;
  const nextTick = remaining >= 60_000 ? remaining % 60_000 + 1 : Infinity;

  useEffect(() => {
    const wakeAt = Math.min(nextChange, now + nextTick);
    if (!Number.isFinite(wakeAt)) return;
    const tick = () => setNow(Date.now());
    const timeout = window.setTimeout(tick, Math.max(0, wakeAt - Date.now()));
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [nextChange, nextTick, now]);

  if (!next && !live.length && !past.length) return (
    <section className="rounded-xl border border-dashed border-input bg-card p-8 text-center">
      <EmptyIcon className="!size-8" />
      <h2 className="font-display text-2xl font-bold">No open plays scheduled yet</h2>
    </section>
  );

  return (
    <div className="grid gap-3">
      {[
        <h2 key="next" className="font-display text-2xl font-bold">{next ? "Next Open Play" : "No upcoming sessions scheduled"}</h2>,
        next && <Session key={next.id} event={next} now={now} featured />,
        live.length > 0 && <h2 key="live" className="mt-6 font-display text-2xl font-bold">In progress</h2>,
        ...live.map(event => <Session key={event.id} event={event} now={now} live />),
        later.length > 0 && <h2 key="later" className="mt-6 font-display text-2xl font-bold">Later sessions</h2>,
        ...later.map(event => <Session key={event.id} event={event} now={now} />),
        !next && past.length > 0 && <h2 key="past" className="mt-6 font-display text-2xl font-bold">Past sessions</h2>,
        ...(!next ? past.map(event => <Session key={event.id} event={event} now={now} past />) : []),
      ]}
    </div>
  );
}
