"use client";
import type { OverviewData, Range } from "@/app/admin/dashboard-analytics-types";
import { formatDisplayDate } from "@/lib/display-date";
import { Body, Segmented, hourLabel, minutesLabel, type AnalyticsState } from "./section-card";

export const rangeOptions: { value: Range; label: string }[] = [{ value: "week", label: "This week" }, { value: "month", label: "This month" }];

export function GlanceKpis({ state, range, onRange }: { state: AnalyticsState<OverviewData>; range: Range; onRange: (range: Range) => void }) {
  return <section aria-label="At a glance" className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">At a glance</h2>
        <p className="text-xs text-muted-foreground">{state.data ? `Operating dates ${formatDisplayDate(state.data.from)} – ${formatDisplayDate(state.data.to)}, through now · current opening hours` : "Operating dates, through now"}</p>
      </div>
      <Segmented label="Range" value={range} onChange={onRange} options={rangeOptions} />
    </div>
    <Body state={state} skeleton="h-24">{d => {
      const k = d.kpis;
      const cards: { label: string; value: React.ReactNode; hint: string; title: string }[] = [
        { label: "Reserved hours", value: `${k.reservedHours} h`, hint: `of ${k.capacityHours} open hours so far`, title: "Customer booking time (pending, confirmed, completed). Held bookings excluded." },
        { label: "Capacity occupied", value: k.occupiedPercent === null ? "—" : <>{Math.round(k.occupiedPercent)}%</>, hint: "Customer bookings only", title: "Reserved hours ÷ actual opening hours elapsed. Blocks and Open Play are not counted as bookings." },
        { label: "Peak-hour occupancy", value: k.peak ? <>{Math.round(k.peak.percent)}%</> : "—", hint: k.peak ? `${hourLabel(k.peak.hourOffset, true)}–${hourLabel(k.peak.hourOffset + 1, true)}` : "Not enough data", title: "Busiest hour of the operating day across the range." },
        { label: "Avg reservation", value: k.averageReservationMinutes === null ? "—" : minutesLabel(k.averageReservationMinutes), hint: `${k.reservationCount} court reservations`, title: "Average duration of a court reservation (extensions not included)." },
        { label: "Blocks & Open Play", value: `${k.blockedHours} h`, hint: "Not counted as bookings", title: "Maintenance, private and Open Play blocks." },
      ];
      return <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">{cards.map((c, i) => <div key={c.label} title={c.title} className="cv-rise rounded-xl border bg-card p-3 shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md" style={{ animationDelay: `${i * 40}ms` }}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{c.value}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{c.hint}</p>
      </div>)}</div>;
    }}</Body>
  </section>;
}
