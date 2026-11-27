"use client";

import { formatScheduleRange, formatScheduleTime } from "@/lib/booking/schedule-label";
import { useEffect, useState } from "react";
import { EmptyIcon } from "@/components/ui/empty-icon";
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
      ? "rounded-xl border border-border bg-muted p-5 sm:p-8"
      : "rounded-xl border border-border bg-card p-4 sm:px-5"}>
      <h3 className={`font-display font-bold [overflow-wrap:anywhere] ${featured ? "text-4xl sm:text-5xl" : "text-2xl"}`}>{event.title}</h3>
      <p className={`mt-2 font-semibold ${featured ? "text-lg" : "text-sm"}`}>
        {live ? <>Until <time dateTime={event.endsAt}>{endDateLabel} · {formatScheduleTime(end)}</time></> : formatScheduleRange(start, end)}
      </p>
      {featured && <p role="timer" className="mt-3 inline-block rounded-md bg-card px-3 py-1.5 text-sm font-semibold tabular-nums">{formatCountdown(start.getTime() - now)}</p>}
      <p className="mt-3 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
        {event.courtNames.join(" · ")}<span className="mx-2" aria-hidden="true">/</span>{event.fee === null ? "Customer-hosted" : `Posted fee: ${fee.format(Number(event.fee))}`}
      </p>
      {event.description && <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{event.description}</p>}
      {!past && event.eventUrl && <a href={event.eventUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center public-cta-primary rounded-lg px-4 text-sm font-semibold">View on Reclub</a>}
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
