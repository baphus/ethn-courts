"use client";
import { KpiCard, type Kpi } from "../kpi-row";
import { BookOpen, CalendarDays, DollarSign, Wallet } from "lucide-react";
import { cents, pesos, type DashboardOverview } from "@/app/admin/dashboard-overview-types";
import type { HeroStatsData } from "@/app/admin/dashboard-analytics-types";
import { Chip, deltaChip, useAnalytics } from "./section-card";

const centavosToPesos = (cents: number) => String(cents).padStart(3, "0").replace(/(..)$/, ".$1");

type Stat = Kpi & { chip?: ReturnType<typeof deltaChip>; chipTitle?: string };

export function HeroStats({ overview }: { overview: DashboardOverview }) {
  const { data, error, retry } = useAnalytics<HeroStatsData>("section=hero");
  const stats: Stat[] = data ? [
    ...(overview.finance && data.collections ? [
      { label: "Collections today", value: pesos(data.collections.today), href: "/admin/finance", Icon: Wallet },
      { label: "Collections this month", value: pesos(data.collections.month), chip: deltaChip(cents(data.collections.month), cents(data.collections.priorMonthToDate)), chipTitle: "vs same dates last month", href: "/admin/finance", Icon: DollarSign },
    ] : []),
    ...(data.bookingRevenue ? [
      { label: "Booking revenue today", value: pesos(centavosToPesos(data.bookingRevenue.todayCents)), href: "/admin/finance", Icon: DollarSign },
      { label: "Booking revenue this month", value: pesos(centavosToPesos(data.bookingRevenue.monthCents)), href: "/admin/finance", Icon: DollarSign },
    ] : []),
    { label: "Bookings this month", value: data.bookings.month, chip: deltaChip(BigInt(data.bookings.month), BigInt(data.bookings.priorMonthToDate)), chipTitle: "vs same dates last month", href: "/admin/bookings", Icon: BookOpen },
  ] : [];
  const today: Stat = { label: "Today's bookings", value: overview.periods.today, href: "/admin/bookings", Icon: CalendarDays };
  return <section aria-label="Dashboard overview" className="space-y-2">
    {error && <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/50 p-3 text-sm">{error}<button type="button" onClick={retry} className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted">Retry</button></div>}
    <div className={`grid grid-cols-2 gap-3 ${overview.finance ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
      {!data && !error && (overview.finance ? [0, 1, 2, 3, 4] : [0]).map(i => <div key={i} className="h-24 motion-safe:animate-pulse rounded-xl border bg-muted/40" />)}
      {[...stats, today].map(({ chip, chipTitle, ...stat }, index) => <KpiCard key={stat.label} {...stat} index={index}>
        {chip && <Chip chip={chip} title={chipTitle ?? ""} />}
      </KpiCard>)}
    </div>
    {overview.finance && data?.collections && <p className="text-[11px] text-muted-foreground">Collections: {data.collections.included}</p>}
  </section>;
}

