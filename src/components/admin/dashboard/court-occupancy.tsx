"use client";
import type { OverviewData } from "@/app/admin/dashboard-analytics-types";
import { Body, Card, type AnalyticsState } from "./section-card";

export function CourtOccupancy({ state }: { state: AnalyticsState<OverviewData> }) {
  return <Card title="Court occupancy" subtitle="Customer-reserved share of each court’s open hours">
    <Body state={state} skeleton="h-32">{d => d.courts.length === 0 ? <p className="text-sm text-muted-foreground">No active courts.</p> : <ul className="space-y-4">
      {d.courts.map(c => {
        const reserved = c.percent ?? 0, blocked = c.capacityHours > 0 ? Math.min(100 - reserved, Math.round((c.blockedHours / c.capacityHours) * 1000) / 10) : 0;
        return <li key={c.id}>
          <div className="flex items-baseline justify-between gap-3"><span className="truncate text-sm font-medium">{c.name}</span><span className="text-sm font-semibold tabular-nums">{c.percent === null ? "—" : `${c.percent}%`}</span></div>
          <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.name}: ${c.percent ?? 0}% reserved, ${blocked}% blocked`}>
            <div className="cv-grow h-full bg-primary" style={{ width: `${reserved}%` }} />
            <div className="cv-grow h-full bg-violet-400/70" style={{ width: `${blocked}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{c.reservedHours} of {c.capacityHours} open hours reserved{c.blockedHours > 0 ? ` · ${c.blockedHours} h blocked / Open Play` : ""}</p>
        </li>;
      })}
    </ul>}</Body>
  </Card>;
}
