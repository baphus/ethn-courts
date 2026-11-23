"use client";
import type { OverviewData } from "@/app/admin/dashboard-analytics-types";
import { formatDisplayDate } from "@/lib/display-date";
import { Body, Card, hourLabel, type AnalyticsState } from "./section-card";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PeakHours({ state }: { state: AnalyticsState<OverviewData> }) {
  return <Card title="Peak hours" subtitle="Share of open court time reserved by customers, by weekday and hour of the operating day">
    <Body state={state} skeleton="h-64">{d => {
      const { hours, rows } = d.heatmap;
      if (!hours.length) return <p className="py-6 text-center text-sm text-muted-foreground">No opening hours have elapsed in this range.</p>;
      const i = d.insight;
      return <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-center text-[10px]">
            <caption className="sr-only">Occupancy percentage by weekday and hour</caption>
            <thead><tr><td />{hours.map(h => <th key={h} scope="col" className="font-normal text-muted-foreground">{hourLabel(h)}{h >= 24 && <sup className="ml-px">+1</sup>}</th>)}</tr></thead>
            <tbody>{rows.map((row, r) => <tr key={days[r]}>
              <th scope="row" className="pr-1 text-left font-normal text-muted-foreground">{days[r]}</th>
              {row.map((cell, c) => cell
                ? <td key={hours[c]} title={`${days[r]} ${hourLabel(hours[c], true)}: ${cell.percent}% (${cell.reservedHours} of ${cell.capacityHours} h reserved)`} className="cv-pop h-7 rounded-md tabular-nums transition-transform motion-safe:hover:scale-110" style={{ animationDelay: `${Math.min(c, 20) * 12}ms`, backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(8 + cell.percent * 0.82)}%, transparent)`, color: cell.percent > 55 ? "var(--primary-foreground)" : undefined }}>{Math.round(cell.percent)}</td>
                : <td key={hours[c]} title={`${days[r]} ${hourLabel(hours[c], true)}: closed or no elapsed hours`} className="h-7 rounded-md bg-muted/40 text-muted-foreground/50">·</td>)}
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5">Quiet<span className="h-2 w-20 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in oklab, var(--primary) 10%, transparent), var(--primary))" }} />Busy</span><span className="flex items-center gap-1.5"><span className="size-3 rounded bg-muted/40" />Closed</span></div>
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs">{"busiest" in i
          ? <>Busiest hour <b>{hourLabel(i.busiest.hourOffset, true)}</b> at {i.busiest.percent}% · quietest <b>{hourLabel(i.quietest.hourOffset, true)}</b> at {i.quietest.percent}%. <span className="text-muted-foreground">Completed operating days {formatDisplayDate(i.from)} – {formatDisplayDate(i.to)} ({i.days} days).</span></>
          : <span className="text-muted-foreground">{i.reason}</span>}</p>
      </>;
    }}</Body>
  </Card>;
}
