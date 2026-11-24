"use client";
import Link from "next/link";
import { BookOpen, CalendarDays, DollarSign, Wallet, type LucideIcon } from "lucide-react";
import { cents, pesos, type DashboardOverview } from "@/app/admin/dashboard-overview-types";
import type { HeroStatsData } from "@/app/admin/dashboard-analytics-types";
import { Chip, deltaChip, useAnalytics } from "./section-card";

const centavosToPesos = (cents: number) => String(cents).padStart(3, "0").replace(/(..)$/, ".$1");

type Stat = { label: string; value: React.ReactNode; chip?: ReturnType<typeof deltaChip>; chipTitle?: string; hint: string; href: string; Icon: LucideIcon };

export function HeroStats({ overview, refreshKey }: { overview: DashboardOverview; refreshKey: number }) {
  const { data, error, retry } = useAnalytics<HeroStatsData>("section=hero", refreshKey);
  const stats: Stat[] = data ? [
    ...(overview.finance && data.collections ? [
      { label: "Collections today", value: pesos(data.collections.today), hint: "Manila calendar day", href: "/admin/finance", Icon: Wallet },
      { label: "Collections this month", value: pesos(data.collections.month), chip: deltaChip(cents(data.collections.month), cents(data.collections.priorMonthToDate)), chipTitle: "vs same dates last month", hint: "Month to date", href: "/admin/finance", Icon: DollarSign },
    ] : []),
    ...(data.bookingRevenue ? [
      { label: "Booking revenue today", value: pesos(centavosToPesos(data.bookingRevenue.todayCents)), hint: "Manila approval date", href: "/admin/finance", Icon: DollarSign },
      { label: "Booking revenue this month", value: pesos(centavosToPesos(data.bookingRevenue.monthCents)), hint: "Manila approval date", href: "/admin/finance", Icon: DollarSign },
    ] : []),
    { label: "Bookings this month", value: data.bookings.month, chip: deltaChip(BigInt(data.bookings.month), BigInt(data.bookings.priorMonthToDate)), chipTitle: "vs same dates last month", hint: "Excludes held", href: "/admin/bookings", Icon: BookOpen },
  ] : [];
  const today: Stat = { label: "Today's bookings", value: overview.periods.today, hint: "Excludes holds; operating date", href: "/admin/bookings", Icon: CalendarDays };
  return <section aria-label="Dashboard overview" className="space-y-2">
    {error && <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/50 p-3 text-sm">{error}<button type="button" onClick={retry} className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted">Retry</button></div>}
    <div className={`grid grid-cols-2 gap-3 ${overview.finance ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
      {!data && !error && (overview.finance ? [0, 1, 2, 3, 4] : [0]).map(i => <div key={i} className="h-24 motion-safe:animate-pulse rounded-xl border bg-muted/40" />)}
      {[...stats, today].map(({ label, value, chip, chipTitle, hint, href, Icon }, i) => <Link key={label} href={href} className="cv-rise rounded-xl border bg-card p-4 shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring" style={{ animationDelay: `${i * 50}ms` }}>
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{label}</p><Icon className="size-4 text-muted-foreground" aria-hidden="true" /></div>
        <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">{chip && <Chip chip={chip} title={chipTitle ?? ""} />}<span>{hint}</span></div>
      </Link>)}
    </div>
    {overview.finance && data?.collections && <p className="text-[11px] text-muted-foreground">Collections: {data.collections.included}</p>}
  </section>;
}

