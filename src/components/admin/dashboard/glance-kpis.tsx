"use client";
import type { OverviewData } from "@/app/admin/dashboard-analytics-types";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDisplayDate } from "@/lib/display-date";
import { Body, hourLabel, minutesLabel, type AnalyticsState } from "./section-card";

export function GlanceKpis({ state }: { state: AnalyticsState<OverviewData> }) {
  const k = state.data?.kpis;
  const cards: { label: string; value: React.ReactNode; hint?: string; title: string }[] = [
    { label: "Reserved hours", value: k && `${k.reservedHours} h`, hint: k && `of ${k.capacityHours} open hours`, title: "Court time reserved by approved bookings." },
    { label: "Capacity occupied", value: !k ? undefined : k.occupiedPercent === null ? "—" : <>{Math.round(k.occupiedPercent)}%</>, hint: "Confirmed and completed bookings", title: "Reserved hours divided by scheduled opening hours. Blocks and Open Play are not counted as bookings." },
    { label: "Peak-hour occupancy", value: !k ? undefined : k.peak ? <>{Math.round(k.peak.percent)}%</> : "—", hint: !k ? undefined : k.peak ? `${hourLabel(k.peak.hourOffset, true)}–${hourLabel(k.peak.hourOffset + 1, true)}` : "Not enough data", title: "Busiest hour of the operating day across the range." },
    { label: "Avg reservation", value: !k ? undefined : k.averageReservationMinutes === null ? "—" : minutesLabel(k.averageReservationMinutes), hint: k && `${k.reservationCount} court reservations`, title: "Average originally booked time per court reservation." },
    { label: "Blocks & Open Play", value: k && `${k.blockedHours} h`, hint: "Not counted as bookings", title: "Maintenance, private and Open Play blocks." },
  ];
  return <section aria-label="At a glance" className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">At a glance</h2>
        <p className="text-xs text-muted-foreground">{state.data ? `Operating dates ${formatDisplayDate(state.data.from)} – ${formatDisplayDate(state.data.to)} · current opening hours` : "Occupancy for selected operating dates"}</p>
      </div>
    </div>
    {state.error && <Body state={state}>{() => null}</Body>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5" aria-busy={state.loading}>{cards.map(c => <div key={c.label} title={c.title} className="rounded-xl border bg-card p-3 shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
        <div className="mt-1 text-xl font-semibold tabular-nums">{c.value ?? (state.error ? "Unavailable" : <Skeleton className="h-7 w-16 motion-reduce:animate-none" />)}</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</p>
      </div>)}</div>
  </section>;
}
