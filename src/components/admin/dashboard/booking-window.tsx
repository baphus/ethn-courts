"use client";
import { formatScheduleTime } from "@/lib/booking/schedule-label";
import { useState } from "react";
import type { WindowData } from "@/app/admin/dashboard-analytics-types";
import { Body, Card, useAnalytics } from "./section-card";
import { bookingWindowCell, HOUR } from "./booking-window-cell";

const dayLabel = (date: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
const cls = { Open: "bg-sky-100 dark:bg-sky-950", Unavailable: "bg-primary", Closed: "bg-muted/50 [background-image:repeating-linear-gradient(135deg,transparent_0_4px,var(--border)_4px_5px)]" } as const;

/** Availability for the next few operating days from the real windows and allocations. Holds count as unavailable. */
export function BookingWindow() {
  const [date, setDate] = useState<string | null>(null);
  const state = useAnalytics<WindowData>(`section=window${date ? `&date=${date}` : ""}`);
  return <Card title="Booking window" subtitle="Hourly availability includes holds. Checkout verifies availability.">
    <Body state={state} skeleton="h-44">{d => {
      const opens = d.courts.flatMap(c => c.windows.map(w => Date.parse(w.opensAt))), closes = d.courts.flatMap(c => c.windows.map(w => Date.parse(w.closesAt)));
      const cells: number[] = [];
      if (opens.length) for (let t = Math.floor(Math.min(...opens) / HOUR) * HOUR; t < Math.max(...closes); t += HOUR) cells.push(t);
      return <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Date" className="flex flex-wrap gap-1.5">{d.dates.map(day => <button key={day} type="button" aria-pressed={d.date === day} onClick={() => setDate(day === d.operatingDate ? null : day)} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${d.date === day ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}>{day === d.operatingDate ? "Today" : dayLabel(day)}</button>)}</div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">{Object.entries(cls).map(([label, color]) => <span key={label} className="flex items-center gap-1.5"><span className={`size-3 rounded ${color}`} />{label}</span>)}</div>
        </div>
        {!cells.length ? <p className="py-6 text-center text-sm text-muted-foreground">No opening hours configured for this date.</p> : <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-x-1 border-spacing-y-1 text-[10px]" style={{ minWidth: 120 + cells.length * 34 }}>
          <caption className="sr-only">Court availability by hour. Only full, clear hours show as open.</caption>
          <thead><tr><td className="w-24" />{cells.map(t => <th key={t} scope="col" className="font-normal text-muted-foreground">{formatScheduleTime(t)}</th>)}</tr></thead>
          <tbody>{d.courts.map((court, r) => <tr key={court.id}>
            <th scope="row" className="truncate pr-2 text-left text-xs font-medium">{court.name}</th>
            {cells.map((t, c) => {
              const { status, detail } = bookingWindowCell(court, t);
              const text = `${status}: ${detail}`;
              return <td key={t} title={text} className={`cv-pop h-7 rounded-md ${cls[status]}`} style={{ animationDelay: `${Math.min(r * 40 + c * 10, 400)}ms` }}><span className="sr-only">{text}</span></td>;
            })}
          </tr>)}</tbody>
        </table></div>}
      </>;
    }}</Body>
  </Card>;
}
