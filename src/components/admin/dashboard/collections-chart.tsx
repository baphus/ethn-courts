"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pesos } from "@/app/admin/dashboard-overview-types";
import type { ChartData } from "@/app/admin/dashboard-analytics-types";
import { formatDisplayDate } from "@/lib/display-date";
import { Body, Card, Segmented, useAnalytics, usePrefersReducedMotion } from "./section-card";

type Point = { date: string; day: string; value: number; label: string; extra: string };
const monthName = (month: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));
function shiftMonth(month: string, delta: number) { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + delta); return d.toISOString().slice(0, 7); }
const compact = (n: number) => (n >= 1000 ? `₱${+(n / 1000).toFixed(1)}k` : `₱${n}`);

function Tip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Point }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"><p className="text-muted-foreground">{formatDisplayDate(p.date)}</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{p.label}</p><p className="text-muted-foreground">{p.extra}</p></div>;
}

export function CollectionsChart({ owner, currentMonth }: { owner: boolean; currentMonth?: string }) {
  const [month, setMonth] = useState("");
  const [metric, setMetric] = useState<"collections" | "occupancy">(owner ? "collections" : "occupancy");
  const requestedMonth = month || (!owner ? currentMonth : undefined);
  const state = useAnalytics<ChartData>(requestedMonth ? `section=chart&month=${requestedMonth}` : "section=chart");
  const reduce = usePrefersReducedMotion();
  const data = state.data;
  const activeMonth = month || data?.month || currentMonth || "";
  const latestMonth = data?.today.slice(0, 7) || currentMonth || "";
  const earliest = latestMonth ? shiftMonth(latestMonth, -23) : "";
  const view = useMemo(() => {
    if (!data || (metric === "collections" && !data.collections)) return null;
    const showCollections = metric === "collections" && data.collections;
    const points: Point[] = showCollections
      ? data.collections!.daily.map(d => ({ date: d.date, day: String(Number(d.date.slice(8))), value: Number(d.collected), label: pesos(d.collected), extra: `7-day average ${pesos(d.average)}`, average: Number(d.average) } as Point & { average: number }))
      : data.occupancy.days.map(d => ({ date: d.date, day: String(Number(d.date.slice(8))), value: d.percent ?? 0, label: d.percent === null ? "Closed or not started" : `${d.percent}% occupied`, extra: `${d.reservedHours} of ${d.capacityHours} open hours reserved` }));
    const reserved = data.occupancy.days.reduce((n, d) => n + d.reservedHours, 0), capacity = data.occupancy.days.reduce((n, d) => n + d.capacityHours, 0);
    return { showCollections: !!showCollections, points, occupancy: capacity > 0 ? Math.round((reserved / capacity) * 1000) / 10 : null, reserved, capacity };
  }, [data, metric]);
  const nav = <div className="flex items-center gap-1">
    <button type="button" aria-label="Previous month" disabled={!activeMonth || !earliest || activeMonth <= earliest} onClick={() => setMonth(shiftMonth(activeMonth, -1))} className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-40"><ChevronLeft className="size-4" /></button>
    <span className="min-w-28 text-center text-xs font-medium">{activeMonth ? monthName(activeMonth) : "—"}</span>
    <button type="button" aria-label="Next month" disabled={!activeMonth || !latestMonth || activeMonth >= latestMonth} onClick={() => { const next = shiftMonth(activeMonth, 1); setMonth(owner && next === latestMonth ? "" : next); }} className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-40"><ChevronRight className="size-4" /></button>
  </div>;
  return <Card title={owner && metric === "collections" ? "Approved booking payments" : "Occupancy"} subtitle={metric === "collections" ? data?.collections?.included : "Daily share of open hours reserved by approved bookings (court blocks excluded)"}
    action={<div className="flex flex-wrap items-center gap-2">{owner && <Segmented label="Chart metric" value={metric} onChange={setMetric} options={[{ value: "collections", label: "Approved booking payments" }, { value: "occupancy", label: "Occupancy" }]} />}{nav}</div>}>
    <Body state={state} skeleton="h-72">{() => !view ? <p role="alert" className="text-sm text-muted-foreground">Approved booking payments unavailable. Please try again.</p> : <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {view.showCollections && data?.collections ? <>
          <p className="text-2xl font-semibold tabular-nums">{pesos(data.collections.totals.collected)}<span className="ml-2 text-xs font-normal text-muted-foreground">collected</span></p>
          <p className="text-xs text-muted-foreground">Average {pesos(data.collections.totals.averagePerDay)} per elapsed day</p>
        </> : <p className="text-2xl font-semibold tabular-nums">{view.occupancy === null ? "—" : `${view.occupancy}%`}<span className="ml-2 text-xs font-normal text-muted-foreground">{view.reserved} of {view.capacity} open hours reserved</span></p>}
      </div>
      <div role="group" aria-label={`${view.showCollections ? "Daily approved booking payments" : "Daily occupancy"} for ${monthName(activeMonth)}`} className="h-64 w-full">
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
