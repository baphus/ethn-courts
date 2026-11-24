"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, DollarSign, ScrollText, Settings } from "lucide-react";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { formatDisplayDate } from "@/lib/display-date";
import { dateTime, ErrorNotice, request } from "./bookings/booking-list";
import { pesos, type DashboardOverview } from "./dashboard-overview-types";
import type { OverviewData, Range } from "./dashboard-analytics-types";
import { StatusBadge } from "@/components/admin/dashboard-status";
import { ViewToggle } from "@/components/admin/view-toggle";
import { DashboardCourtView } from "@/components/admin/dashboard-court-view";
import { useAnalytics } from "@/components/admin/dashboard/section-card";
import { HeroStats } from "@/components/admin/dashboard/hero-stats";
import { CollectionsChart } from "@/components/admin/dashboard/collections-chart";
import { GlanceKpis } from "@/components/admin/dashboard/glance-kpis";
import { UpcomingSchedule } from "@/components/admin/dashboard/upcoming-schedule";
import { BookingWindow } from "@/components/admin/dashboard/booking-window";
import { PeakHours } from "@/components/admin/dashboard/peak-hours";
import { CourtOccupancy } from "@/components/admin/dashboard/court-occupancy";
import { PaymentMethods } from "@/components/admin/dashboard/payment-methods";

export default function DashboardPage() {
  const [courtView, setCourtView] = useState(false);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void request<DashboardOverview>("/api/ethn/admin/dashboard", controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); });
    return () => controller.abort();
  }, []);
  return <><ViewToggle courtView={courtView} onChange={setCourtView}/>{courtView ? <DashboardCourtView overview={data}/> : <NormalDashboard data={data} error={error}/> }</>;
}

function NormalDashboard({ data, error }: { data: DashboardOverview | null; error: string }) {
  const [range, setRange] = useState<Range>("month");
  const overview = useAnalytics<OverviewData>(`section=overview&range=${range}`);
  return <div className="space-y-5 pb-24">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">{data ? `Operating date ${formatDisplayDate(data.operatingDate)}` : "Overview"}</p></div></header>
    {error && <ErrorNotice message={error} />}
    {!data ? (!error && <LoadingAnimation label="Loading dashboard" className="py-8"/>) : <>
      <section aria-label="Today booking status" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-4 py-3"><h2 className="text-sm font-semibold">Today’s status</h2>{(["confirmed", "completed", "pending"] as const).map(state => <div key={state} className="flex items-center gap-2"><StatusBadge state={state}/><span className="text-sm font-semibold">{data.counts[state]}</span></div>)}</section>
      <HeroStats overview={data}/>
      <CollectionsChart owner={!!data.finance} currentMonth={data.calendarDate.slice(0, 7)}/>
      <GlanceKpis state={overview} range={range} onRange={setRange}/>
      <UpcomingSchedule/>
      <BookingWindow/>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><PeakHours state={overview}/><div className="space-y-4">{data.finance && <PaymentMethods range={range}/>}<CourtOccupancy state={overview}/></div></div>
      <section className="rounded-xl border bg-card shadow-sm"><div className="flex items-center justify-between gap-4 p-5"><div><h2 className="font-semibold">Recent bookings</h2><p className="mt-1 text-sm text-muted-foreground">Latest reservations across all operating dates.</p></div><Link href="/admin/bookings" className="text-sm font-medium text-primary hover:underline">View all</Link></div>{data.recentBookings.length === 0 ? <p className="px-5 pb-8 pt-3 text-center text-sm text-muted-foreground">No bookings yet.</p> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-y bg-muted/40 text-xs text-muted-foreground"><tr>{["Guest", "Operating date", "Status", "Items", "Total", "Created"].map(h => <th key={h} scope="col" className="px-5 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y">{data.recentBookings.map(row => <tr key={row.id}><td className="px-5 py-3 font-medium"><Link className="text-primary hover:underline" href={`/admin/bookings/${encodeURIComponent(row.id)}`}>{row.guestName || "Guest"}</Link></td><td className="px-5 py-3">{formatDisplayDate(row.operatingDate)}</td><td className="px-5 py-3"><StatusBadge state={row.status}/></td><td className="px-5 py-3">{row.itemCount}</td><td className="px-5 py-3">{pesos(row.total)}</td><td className="px-5 py-3 text-muted-foreground">{dateTime(row.createdAt)}</td></tr>)}</tbody></table></div><ul className="divide-y md:hidden">{data.recentBookings.map(row => <li key={row.id}><Link href={`/admin/bookings/${encodeURIComponent(row.id)}`} className="block space-y-2 p-5 hover:bg-muted/50"><div className="flex justify-between gap-3"><span className="font-semibold">{row.guestName || "Guest"}</span><StatusBadge state={row.status}/></div><p className="text-sm text-muted-foreground">{formatDisplayDate(row.operatingDate)} · {row.itemCount} {row.itemCount === 1 ? "item" : "items"} · {pesos(row.total)}</p><p className="text-xs text-muted-foreground">Created {dateTime(row.createdAt)}</p></Link></li>)}</ul></>}</section>
      {data.finance && <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Finance this month</h2><p className="mt-1 text-sm text-muted-foreground">Manila calendar month through {formatDisplayDate(data.calendarDate)}. Collections include corrected manual sales.</p></div><Link href="/admin/finance" className="text-sm font-medium text-primary hover:underline">Open Finance</Link></div><div className="mt-5 grid gap-4 sm:grid-cols-3">{[["Total collections", data.finance.month.collected], ["Recorded expenses", data.finance.month.expenses], ["Net after recorded expenses", data.finance.month.net]].map(([label, amount]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{pesos(amount)}</p></div>)}</div></section>}
      <section><h2 className="mb-3 text-sm font-medium text-muted-foreground">Quick access</h2><div className="flex flex-wrap gap-2">{[{ href: "/admin/bookings", label: "Manage Bookings", desc: "Review reservations", icon: BookOpen }, { href: "/admin/calendar", label: "Calendar", desc: "See the schedule", icon: CalendarDays }, { href: "/admin/activity", label: "Activity", desc: "View action history", icon: ScrollText }, { href: "/admin/courts", label: "Court Setup", desc: "Courts and rates", icon: Settings }, ...(data.finance ? [{ href: "/admin/finance", label: "Finance", desc: "Collections and expenses", icon: DollarSign }, { href: "/admin/settings", label: "Settings", desc: "Manage venue settings", icon: Settings }] : [])].map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"><Icon className="size-4" aria-hidden="true"/><span>{label}</span></Link>)}</div></section>
    </>}
  </div>;
}
