"use client";
import { useState } from "react";
import type { WindowData } from "@/app/admin/dashboard-analytics-types";
import { Body, Card, useAnalytics } from "./section-card";

const HOUR = 3_600_000;
const hourFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric" });
const hourText = (t: number) => hourFmt.format(new Date(t)).replace(/\s/g, "").toLowerCase();
const dayLabel = (date: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const cls = { free: "bg-sky-100 dark:bg-sky-950", partial: "bg-primary/40", full: "bg-primary", closed: "bg-muted/50 [background-image:repeating-linear-gradient(135deg,transparent_0_4px,var(--border)_4px_5px)]" } as const;

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
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">{([["free", "Open"], ["partial", "Partly unavailable"], ["full", "Unavailable"], ["closed", "Closed"]] as const).map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className={`size-3 rounded ${cls[k]}`} />{l}</span>)}</div>
        </div>
        {!cells.length ? <p className="py-6 text-center text-sm text-muted-foreground">No opening hours configured for this date.</p> : <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-x-1 border-spacing-y-1 text-[10px]" style={{ minWidth: 120 + cells.length * 34 }}>
          <caption className="sr-only">Court availability by hour. Held bookings, reservations and blocks show as unavailable.</caption>
          <thead><tr><td className="w-24" />{cells.map(t => <th key={t} scope="col" className="font-normal text-muted-foreground">{hourText(t)}</th>)}</tr></thead>
          <tbody>{d.courts.map((court, r) => <tr key={court.id}>
            <th scope="row" className="truncate pr-2 text-left text-xs font-medium">{court.name}</th>
            {cells.map((t, c) => {
              const open = court.windows.reduce((n, w) => n + overlap(Date.parse(w.opensAt), Date.parse(w.closesAt), t, t + HOUR), 0);
              const used = court.windows.reduce((n, w) => n + court.occupied.reduce((m, o) => m + Math.max(0, Math.min(Date.parse(w.closesAt), Date.parse(o.endsAt), t + HOUR) - Math.max(Date.parse(w.opensAt), Date.parse(o.startsAt), t)), 0), 0);
              const kind = open === 0 ? "closed" : used === 0 && open >= HOUR ? "free" : used >= open ? "full" : "partial";
              const text = kind === "closed" ? "closed" : `${Math.round(used / 60000)} of ${Math.round(open / 60000)} min unavailable`;
              return <td key={t} title={`${court.name} ${hourText(t)}: ${text}`} aria-label={`${court.name} ${hourText(t)}: ${text}`} className={`cv-pop h-7 rounded-md ${cls[kind]}`} style={{ animationDelay: `${Math.min(r * 40 + c * 10, 400)}ms` }} />;
            })}
          </tr>)}</tbody>
        </table></div>}
      </>;
    }}</Body>
  </Card>;
}
