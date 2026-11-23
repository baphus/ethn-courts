"use client";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { cents, pesos } from "@/app/admin/dashboard-overview-types";
import type { MethodsData, Range } from "@/app/admin/dashboard-analytics-types";
import { formatDisplayDate } from "@/lib/display-date";
import { Body, Card, useAnalytics, usePrefersReducedMotion } from "./section-card";

const colors = { gcash: "#0ea5e9", cash: "#8b5cf6" };

/** Owner-only. Accepted collections by method; the server omits this section for staff. */
export function PaymentMethods({ range, refreshKey }: { range: Range; refreshKey: number }) {
  const state = useAnalytics<MethodsData>(`section=methods&range=${range}`, refreshKey);
  const reduce = usePrefersReducedMotion();
  return <Card title="Payment methods" subtitle="Accepted collections, not booking totals or claimed amounts" delay={30}>
    <Body state={state} skeleton="h-56">{d => {
      const rows = [{ key: "gcash", label: "GCash", amount: d.totals.gcash }, { key: "cash", label: "Cash", amount: d.totals.cash }] as const;
      const total = cents(d.totals.collected);
      if (total === BigInt(0) && rows.every(r => cents(r.amount) === BigInt(0))) return <p className="py-6 text-center text-sm text-muted-foreground">No accepted collections in this period.</p>;
      const donut = total > BigInt(0) && rows.every(r => cents(r.amount) >= BigInt(0));
      return <>
        {!donut && <p className="mb-3 text-xs text-muted-foreground">Corrections can make totals negative. Signed amounts are shown without a chart.</p>}
        <div className="flex items-center gap-4">
          {donut && <div className="relative size-32 shrink-0" role="img" aria-label={`Collected ${pesos(d.totals.collected)}: GCash ${pesos(d.totals.gcash)}, cash ${pesos(d.totals.cash)}`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows.map(r => ({ name: r.label, value: Number(r.amount) }))} dataKey="value" innerRadius={42} outerRadius={60} paddingAngle={2} stroke="none" isAnimationActive={!reduce} animationDuration={700}>{rows.map(r => <Cell key={r.key} fill={colors[r.key]} />)}</Pie></PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[10px] text-muted-foreground">Collected</p><p className="text-sm font-semibold tabular-nums">{pesos(d.totals.collected)}</p></div></div>
          </div>}
          <ul className="min-w-0 flex-1 space-y-2 text-sm">{rows.map(r => <li key={r.key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: colors[r.key] }} />{r.label}</span><span className="tabular-nums"><b className="font-semibold">{pesos(r.amount)}</b>{donut && <span className="ml-2 text-xs text-muted-foreground">{Math.round(Number(cents(r.amount) * BigInt(1000) / total)) / 10}%</span>}</span></li>)}</ul>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Manila calendar dates {formatDisplayDate(d.from)} – {formatDisplayDate(d.to)}. Bookings and extensions {pesos(d.components.bookingAndExtensionCollections)} · manual sales after corrections {pesos(d.components.manualSalesAfterCorrections)}.</p>
      </>;
    }}</Body>
  </Card>;
}
