import { CalendarX2, ChevronRight } from "lucide-react";
import type { Calendar, Interval } from "@/app/admin/calendar/calendar-range";
import { IntervalLead } from "./court-avatar";
import { bookingTarget, durationLabel, timelineTime, type CourtStatus, type CourtTone } from "./court-timeline-utils";

const tones: Record<CourtTone, { text: string; dot: string; bar: string; pulse: boolean }> = {
  live: { text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", bar: "bg-emerald-500", pulse: true },
  pending: { text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500", bar: "bg-amber-500", pulse: true },
  held: { text: "text-slate-600 dark:text-slate-300", dot: "bg-slate-400", bar: "bg-slate-400", pulse: false },
  block: { text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500", bar: "bg-violet-500", pulse: false },
  free: { text: "text-sky-700 dark:text-sky-400", dot: "bg-sky-500", bar: "bg-sky-500", pulse: false },
  closed: { text: "text-muted-foreground", dot: "bg-muted-foreground/50", bar: "bg-muted-foreground/40", pulse: false },
};

const nameOf = (item: Interval) => item.state === "held" ? "Unavailable" : item.kind === "booking" ? item.guestName || "Guest" : item.kind.replaceAll("_", " ");

function Person({ item, prefix, sub, onOpen }: { item: Interval; prefix?: string; sub: string; onOpen: (id: string) => void }) {
  const target = bookingTarget(item);
  const body = <>
    <IntervalLead item={item} />
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-medium"><span className={item.kind === "booking" ? "" : "capitalize"}>{prefix ? <span className="font-normal text-muted-foreground">{prefix} </span> : null}{nameOf(item)}</span></span>
      <span className="block truncate text-xs capitalize text-muted-foreground">{sub}</span>
    </span>
    {target && <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover/row:translate-x-0.5" aria-hidden="true" />}
  </>;
  const cls = "group/row flex w-full items-center gap-3";
  return target
    ? <button type="button" onClick={() => onOpen(target)} className={`${cls} rounded-lg focus-visible:outline-2 focus-visible:outline-primary`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

export function CourtCard({ court, status, now, live, onOpen }: {
  court: Calendar["courts"][number]; status: CourtStatus; now: number; live: boolean; onOpen: (id: string) => void;
}) {
  const t = tones[status.tone];
  const { current, next, freeAt } = status;
  return <div className="flex min-h-44 flex-col rounded-2xl border bg-card p-4 shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md">
    <p className="truncate text-xs text-muted-foreground">{court.name}</p>
    <div className="mt-1 flex items-center gap-2">
      {status.tone === "free" && !next ? <CalendarX2 className={`size-4 shrink-0 ${t.text}`} aria-hidden="true" /> : <span className="relative flex size-2.5" aria-hidden="true">
        {t.pulse && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${t.dot}`} />}
        <span className={`relative inline-flex size-2.5 rounded-full ${t.dot}`} />
      </span>}
      <h3 className={`text-xl font-semibold ${t.text}`}>{status.title}</h3>
    </div>
    <div className="mt-3">
      {current && freeAt ? <>
        <Person item={current} sub={current.state === "held" ? "" : current.kind === "booking" ? current.state : current.reason ?? ""} onOpen={onOpen} />
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-medium">Scheduled until {timelineTime(freeAt)}</span>
          <span className="text-muted-foreground">{durationLabel(freeAt - now)} left</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Time elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress * 100)}>
          <div className={`cv-grow h-full rounded-full ${t.bar}`} style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </div>
      </> : status.tone !== "free" && <p className="text-sm text-muted-foreground">{court.active ? "Outside the live window" : "Court inactive"}</p>}
    </div>
    {(next || status.tone !== "free") && <div className="mt-auto border-t pt-3">
      {next
        ? <Person item={next} prefix={live ? "Next:" : "First:"} sub={timelineTime(next.startsAt)} onOpen={onOpen} />
        : <p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarX2 className="size-4 shrink-0" aria-hidden="true" />{current ? "No further allocations" : "No scheduled allocation"}</p>}
    </div>}
  </div>;
}
