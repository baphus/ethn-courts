"use client";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { cents, pesos } from "@/app/admin/dashboard-overview-types";
import type { MethodsData, Range } from "@/app/admin/dashboard-analytics-types";
import { formatDisplayDate } from "@/lib/display-date";
import { Body, Card, useAnalytics, usePrefersReducedMotion } from "./section-card";

const colors = ["#0ea5e9", "#8b5cf6", "var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Owner-only. Accepted collections by method; the server omits this section for staff. */
export function PaymentMethods({ range }: { range: Range }) {
  const state = useAnalytics<MethodsData>(`section=methods&range=${range}`);
  const reduce = usePrefersReducedMotion();
  return <Card title="Payment methods" subtitle="Accepted collections, not booking totals or claimed amounts">
    <Body state={state} skeleton="h-56">{d => {
      const rows = d.paymentMethods.map((method, index) => ({ ...method, color: colors[index % colors.length] }));
      const total = cents(d.collected);
      const hasCollections = rows.some(r => cents(r.amount) !== BigInt(0));
      const slices = rows.filter(r => cents(r.amount) > BigInt(0));
      const donut = total > BigInt(0) && rows.every(r => cents(r.amount) >= BigInt(0));
      return <>
        {!hasCollections && <p className="mb-3 text-xs text-muted-foreground">No accepted collections in this period.</p>}
        {hasCollections && !donut && <p className="mb-3 text-xs text-muted-foreground">Corrections can make totals negative. Signed amounts are shown without a chart.</p>}
        <div className="flex flex-wrap items-center gap-4">
          {donut && <div className="relative size-32 shrink-0" role="img" aria-label={`Collected ${pesos(d.collected)}`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={slices.map(r => ({ name: r.name, value: Number(r.amount) }))} dataKey="value" innerRadius={42} outerRadius={60} paddingAngle={2} stroke="none" isAnimationActive={!reduce} animationDuration={700}>{slices.map(r => <Cell key={r.id} fill={r.color} />)}</Pie></PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[10px] text-muted-foreground">Collected</p><p className="text-sm font-semibold tabular-nums">{pesos(d.collected)}</p></div></div>
          </div>}
          <ul className="min-w-[10rem] flex-1 space-y-2 text-sm">{rows.map(r => <li key={r.id} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 break-all"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />{r.name}</span><span className="tabular-nums"><b className="font-semibold">{pesos(r.amount)}</b>{donut && <span className="ml-2 text-xs text-muted-foreground">{Math.round(Number(cents(r.amount) * BigInt(1000) / total)) / 10}%</span>}</span></li>)}</ul>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Manila calendar dates {formatDisplayDate(d.from)} – {formatDisplayDate(d.to)}. Includes booking and extension receipts and manual sales after corrections.</p>
      </>;
    }}</Body>
  </Card>;
}
