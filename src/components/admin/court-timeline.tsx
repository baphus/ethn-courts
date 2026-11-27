"use client";
import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { useEffect, useRef } from "react";
import { statusStyle } from "./dashboard-status";
import { Avatar } from "./court-avatar";
import type { Calendar, Interval } from "@/app/admin/calendar/calendar-range";
import { HOUR_PX, bookingCount, bookingTarget, currentPosition, intervalLabel, position, timelineTime } from "./court-timeline-utils";

export { timelineTime };

const gridLines = `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--border) ${HOUR_PX - 1}px, var(--border) ${HOUR_PX}px)`;

function Block({ item, court, window, date, index, onBooking, onBlock }: { item: Interval; court: Calendar["courts"][number]; window: Calendar["window"]; date: string; index: number; onBooking: (id: string) => void; onBlock?: (court: string, item: Interval) => void }) {
  const p = position(window, item.startsAt, item.endsAt);
  if (!p) return null;
  const range = formatScheduleRange(item.startsAt, item.endsAt, date);
  const label = `${intervalLabel(item)} · ${range}`;
  const target = bookingTarget(item);
  const action = target ? () => onBooking(target) : item.state !== "held" && item.kind !== "booking" && onBlock ? () => onBlock(court.name, item) : undefined;
  const { icon: Icon, className: tone } = statusStyle(item.state, item.kind);
  const isBooking = item.kind === "booking" && item.state !== "held";
  const name = item.state === "held" ? "Unavailable" : isBooking ? item.guestName || "Guest" : item.kind.replaceAll("_", " ");
  const sub = item.state === "held" ? null : isBooking ? item.state : item.reason;
  const compact = p.height < 48;
  const lead = isBooking ? <Avatar name={name} size="sm" /> : <Icon className="size-3.5 shrink-0" aria-hidden="true" />;
  const nameClass = `truncate font-medium ${isBooking ? "" : "capitalize"}`;
  const content = compact
    ? <span className="flex items-center gap-1.5 whitespace-nowrap">{lead}<span className={nameClass}>{name}</span><span className="truncate opacity-70">{range}</span></span>
    : <>
        <span className="flex items-center gap-1.5">{lead}<span className={nameClass}>{name}</span></span>
        <span className="mt-0.5 block truncate opacity-80">{range}</span>
        {p.height >= 72 && sub ? <span className="mt-0.5 block truncate capitalize opacity-70">{sub}</span> : null}
      </>;
  const className = `cv-pop absolute inset-x-1.5 overflow-hidden rounded-lg border px-2 py-1.5 text-left text-xs shadow-sm transition duration-200 ${tone}`;
  const style = { top: p.top + 1, height: p.height - 2, animationDelay: `${Math.min(index, 12) * 35}ms` };
  return action
    ? <button type="button" aria-label={label} title={label} onClick={action} className={`${className} cursor-pointer hover:z-10 motion-safe:hover:-translate-y-px hover:shadow-md focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary`} style={style}>{content}</button>
    : <div aria-label={label} title={label} className={className} style={style}>{content}</div>;
}

export function CourtTimeline({ day, now, onBooking, onBlock }: { day: Calendar; now: number; onBooking: (id: string) => void; onBlock?: (court: string, item: Interval) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const start = Date.parse(day.window.startsAt), end = Date.parse(day.window.endsAt);
  const height = Math.max(0, (end - start) / 3600000 * HOUR_PX);
  const current = currentPosition(day.window, now);
  const hours = Array.from({ length: Math.ceil((end - start) / 3600000) }, (_, i) => start + i * 3600000);

  // Scroll to "now" (or the first booking on other dates) once per loaded day.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const tops = day.courts.flatMap(c => c.intervals.map(i => position(day.window, i.startsAt, i.endsAt)?.top ?? Infinity));
    const first = Math.min(...tops);
    const target = current ?? (Number.isFinite(first) ? first : 0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: Math.max(0, target - 100), behavior: reduce ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.date]);

  if (!day.courts.length) return <p className="p-5 text-sm text-muted-foreground">No courts found.</p>;
  return <div ref={scroller} className="max-h-[650px] overflow-auto rounded-2xl border bg-card shadow-sm">
    <div className="w-full" style={{ minWidth: 80 + day.courts.length * 192 }}>
      <div className="sticky top-0 z-30 flex border-b bg-card/95 backdrop-blur">
        <div className="sticky left-0 z-40 w-20 shrink-0 border-r bg-card p-3 text-xs text-muted-foreground">Time</div>
        {day.courts.map(court => {
          const count = bookingCount(court);
          return <div key={court.id} className="min-w-48 flex-1 border-r p-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="truncate text-sm">{court.name}</strong>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{count}</span>
            </div>
            {!court.active && <span className="text-xs text-muted-foreground">Inactive</span>}
          </div>;
        })}
      </div>
      <div className="relative flex" style={{ height }}>
        <div className="sticky left-0 z-20 w-20 shrink-0 border-r bg-card">
          {hours.map((hour, i) => <span key={hour} className="absolute right-2 text-xs text-muted-foreground" style={{ top: (hour - start) / 3600000 * HOUR_PX + (i === 0 ? 6 : 0), transform: i === 0 ? undefined : "translateY(-50%)" }}>{timelineTime(hour)}</span>)}
        </div>
        {day.courts.map(court => <div key={court.id} className="relative min-w-48 flex-1 border-r" style={{ backgroundImage: gridLines }}>
          {court.intervals.map((item, i) => <Block key={item.id} item={item} court={court} window={day.window} date={day.date} index={i} onBooking={onBooking} onBlock={onBlock} />)}
        </div>)}
        {current !== null && <div aria-label={`Current time ${timelineTime(now)}`} className="pointer-events-none absolute left-20 right-0 z-20 motion-safe:transition-[top] motion-safe:duration-1000 motion-safe:ease-linear" style={{ top: current }}>
          <span className="absolute -left-1 -top-[5px] size-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />
          <div className="border-t-2 border-primary" />
        </div>}
      </div>
    </div>
  </div>;
}
