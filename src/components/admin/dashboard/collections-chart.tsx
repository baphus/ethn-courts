"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pesos } from "@/app/admin/dashboard-overview-types";
import type { ChartData, OccupancyData } from "@/app/admin/dashboard-analytics-types";
import { formatDisplayDate } from "@/lib/display-date";
import { Body, Card, Segmented, useAnalytics, usePrefersReducedMotion, type AnalyticsState } from "./section-card";

type Point = { date: string; day: string; value: number; label: string; extra: string };
const monthName = (month: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));
function shiftMonth(month: string, delta: number) { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + delta); return d.toISOString().slice(0, 7); }
const compact = (n: number) => (n >= 1000 ? `₱${+(n / 1000).toFixed(1)}k` : `₱${n}`);

function Tip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Point }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"><p className="text-muted-foreground">{formatDisplayDate(p.date)}</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{p.label}</p><p className="text-muted-foreground">{p.extra}</p></div>;
}

export function CollectionsChart({ owner, payments, occupancy }: { owner: boolean; payments: AnalyticsState<ChartData>; occupancy: AnalyticsState<OccupancyData> }) {
  const [month, setMonth] = useState("");
  const [metric, setMetric] = useState<"collections" | "occupancy">(owner ? "collections" : "occupancy");
  const history = useAnalytics<ChartData>(owner && metric === "collections" && month ? `section=chart&month=${month}` : null);
  const state: AnalyticsState<ChartData> = metric === "occupancy" ? { ...occupancy, data: occupancy.data ? { month: occupancy.data.to.slice(0, 7), today: occupancy.data.to, occupancy: { days: occupancy.data.days } } : null } : month ? history : payments;
  const reduce = usePrefersReducedMotion();
  const data = state.data;
  const activeMonth = month || (metric === "occupancy" ? occupancy.data?.to.slice(0, 7) : data?.month || payments.data?.month) || "";
  const latestMonth = payments.data?.today.slice(0, 7) || "";
  const earliest = latestMonth ? shiftMonth(latestMonth, -23) : "";
  const view = useMemo(() => {
    if (!data || (metric === "collections" && !data.collections)) return null;
    const showCollections = metric === "collections" && data.collections;
    const occupancyDays = metric === "occupancy" ? occupancy.data?.days ?? [] : data.occupancy.days;
    const days = showCollections ? data.collections!.daily : occupancyDays;
    const crossMonth = days.length > 1 && days[0].date.slice(0, 7) !== days[days.length - 1].date.slice(0, 7);
    const points: Point[] = showCollections
      ? data.collections!.daily.map(d => ({ date: d.date, day: crossMonth ? `${Number(d.date.slice(8))} ${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${d.date}T00:00:00Z`))}` : String(Number(d.date.slice(8))), value: Number(d.collected), label: pesos(d.collected), extra: `7-day average ${pesos(d.average)}`, average: Number(d.average) } as Point & { average: number }))
      : occupancyDays.map(d => ({ date: d.date, day: crossMonth ? `${Number(d.date.slice(8))} ${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${d.date}T00:00:00Z`))}` : String(Number(d.date.slice(8))), value: d.percent ?? 0, label: d.percent === null ? "Closed" : `${d.percent}% occupied`, extra: `${d.reservedHours} of ${d.capacityHours} open hours reserved` }));
    return { showCollections: !!showCollections, points };
  }, [data, metric, occupancy.data?.days]);
  const nav = <div className="flex items-center gap-1">
    <button type="button" aria-label="Previous month" disabled={!activeMonth || !earliest || activeMonth <= earliest} onClick={() => setMonth(shiftMonth(activeMonth, -1))} className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-40"><ChevronLeft className="size-4" /></button>
    <span className="min-w-28 text-center text-xs font-medium">{activeMonth ? monthName(activeMonth) : "—"}</span>
    <button type="button" aria-label="Next month" disabled={!activeMonth || !latestMonth || activeMonth >= latestMonth} onClick={() => { const next = shiftMonth(activeMonth, 1); setMonth(next === latestMonth ? "" : next); }} className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-40"><ChevronRight className="size-4" /></button>
  </div>;
  return <Card title={owner && metric === "collections" ? "Approved booking payments" : "Occupancy"} subtitle={metric === "collections" ? undefined : "Daily share of open hours reserved by approved bookings (court blocks excluded)"}
    action={<div className="flex flex-wrap items-center gap-2">{owner && <Segmented label="Chart metric" value={metric} onChange={setMetric} options={[{ value: "collections", label: "Approved booking payments" }, { value: "occupancy", label: "Occupancy" }]} />}{metric === "collections" && nav}</div>}>
    <Body state={state} skeleton="h-72">{() => !view ? <p role="alert" className="text-sm text-muted-foreground">Approved booking payments unavailable. Please try again.</p> : <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {view.showCollections && data?.collections ? <>
          <p className="text-2xl font-semibold tabular-nums">{pesos(data.collections.totals.collected)}<span className="ml-2 text-xs font-normal text-muted-foreground">collected</span></p>
          <p className="text-xs text-muted-foreground">Average {pesos(data.collections.totals.averagePerDay)} per elapsed day</p>
        </> : <p className="text-2xl font-semibold tabular-nums">{occupancy.data?.kpis.occupiedPercent == null ? "—" : `${occupancy.data.kpis.occupiedPercent}%`}<span className="ml-2 text-xs font-normal text-muted-foreground">{occupancy.data?.kpis.reservedHours} of {occupancy.data?.kpis.capacityHours} open hours reserved</span></p>}
      </div>
      <div role="group" aria-label={view.showCollections ? `Daily approved booking payments for ${monthName(activeMonth)}` : `Daily occupancy from ${formatDisplayDate(occupancy.data!.from)} to ${formatDisplayDate(occupancy.data!.to)}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={view.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11 }} domain={view.showCollections ? ["auto", "auto"] : [0, 100]} tickFormatter={(n: number) => (view.showCollections ? compact(n) : `${n}%`)} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={({ active, payload }) => <Tip active={active} payload={payload as readonly { payload?: Point }[] | undefined} />} />
            <Bar dataKey="value" fill="var(--primary)" fillOpacity={0.35} radius={[3, 3, 0, 0]} isAnimationActive={!reduce} animationDuration={600} />
            {view.showCollections && <Line dataKey="average" type="monotone" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={!reduce} animationDuration={900} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>}</Body>
  </Card>;
}
