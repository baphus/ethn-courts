"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { KpiCard, type Kpi } from "../kpi-row";
import { BookOpen, CalendarDays, DollarSign, Wallet } from "lucide-react";
import { cents, pesos, type DashboardOverview } from "@/app/admin/dashboard-overview-types";
import type { HeroStatsData } from "@/app/admin/dashboard-analytics-types";
import { Chip, deltaChip, useAnalytics } from "./section-card";

const centavosToPesos = (cents: number) => String(cents).padStart(3, "0").replace(/(..)$/, ".$1");

type Stat = Kpi & { chip?: ReturnType<typeof deltaChip>; chipTitle?: string };

export function HeroStats({ overview, owner, overviewError, retryOverview }: { overview: DashboardOverview | null; owner: boolean; overviewError: string; retryOverview: () => void }) {
  const { data, error, retry } = useAnalytics<HeroStatsData>("section=hero");
  const stats: Stat[] = data ? [
    ...((owner || overview?.finance) && data.collections ? [
      { label: "Collections today", value: pesos(data.collections.today), href: "/admin/finance", Icon: Wallet },
      { label: "Collections this month", value: pesos(data.collections.month), chip: deltaChip(cents(data.collections.month), cents(data.collections.priorMonthToDate)), chipTitle: "vs same dates last month", href: "/admin/finance", Icon: DollarSign },
    ] : []),
    ...(data.bookingRevenue ? [
      { label: "Booking revenue today", value: pesos(centavosToPesos(data.bookingRevenue.todayCents)), href: "/admin/finance", Icon: DollarSign },
      { label: "Booking revenue this month", value: pesos(centavosToPesos(data.bookingRevenue.monthCents)), href: "/admin/finance", Icon: DollarSign },
    ] : []),
    { label: "Bookings this month", value: data.bookings.month, chip: deltaChip(BigInt(data.bookings.month), BigInt(data.bookings.priorMonthToDate)), chipTitle: "vs same dates last month", href: "/admin/bookings", Icon: BookOpen },
  ] : (owner || overview?.finance ? [
    { label: "Collections today", Icon: Wallet, href: "/admin/finance" },
    { label: "Collections this month", Icon: DollarSign, href: "/admin/finance" },
    { label: "Booking revenue today", Icon: DollarSign, href: "/admin/finance" },
    { label: "Booking revenue this month", Icon: DollarSign, href: "/admin/finance" },
    { label: "Bookings this month", Icon: BookOpen, href: "/admin/bookings" },
  ] : [{ label: "Bookings this month", Icon: BookOpen, href: "/admin/bookings" }]).map(item => ({
    ...item, value: error ? "Unavailable" : <Skeleton className="h-7 w-16 motion-reduce:animate-none" />,
  }));
  const today: Stat = { label: "Today's confirmed bookings", value: overview ? overview.periods.today : overviewError ? "Unavailable" : <Skeleton className="h-7 w-16 motion-reduce:animate-none" />, href: overview ? `/admin/bookings?status=confirmed&from=${overview.operatingDate}&to=${overview.operatingDate}` : undefined, Icon: CalendarDays };
  return <section aria-label="Dashboard overview" className="space-y-2">
    {error && <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/50 p-3 text-sm">{error}<Button type="button" size="sm" variant="outline" onClick={retry}>Retry</Button></div>}
    <div className={`grid grid-cols-2 gap-3 ${(owner || overview?.finance) ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
      {[...stats, today].map(({ chip, chipTitle, ...stat }) => <KpiCard key={stat.label} {...stat}>
        {chip && <Chip chip={chip} title={chipTitle ?? ""} />}
      </KpiCard>)}
    </div>
    {overviewError && <div role="alert" className="text-sm">{overviewError} <Button type="button" variant="link" className="h-auto p-0" onClick={retryOverview}>Retry</Button></div>}
    {overview?.finance && data?.collections && <p className="text-[11px] text-muted-foreground">Collections: {data.collections.included}</p>}
  </section>;
}

