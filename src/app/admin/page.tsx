"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "@/lib/display-date";
import { BookingRows, ErrorNotice, request } from "./bookings/booking-list";
import type { Dashboard } from "./dashboard-types";
import { Availability, CourtOccupancy, KpiRow, OpenPlayBanner, PaymentMethods, PeakHours, RevenueChart, Schedule, StatusStrip } from "./dashboard-widgets";

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); void request<Dashboard>("/api/ethn/admin/dashboard", controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }); return () => controller.abort(); }, []);
  const revenueByCourt = useMemo(() => new Map((data?.finance?.courtRevenue ?? []).map(c => [c.courtId, c.amount])), [data]);

  return <div className="mx-auto w-full max-w-7xl space-y-6 py-2">
    <header className="border-b pb-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ETHN Courts / Staff</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1><p className="mt-2 text-sm text-muted-foreground">{data ? `${formatDisplayDate(data.operatingDate)} · ` : ""}Today’s bookings, availability and performance.</p></header>
    {error ? <ErrorNotice message={error}/> : !data ? <p role="status" className="py-8 text-sm text-muted-foreground">Loading dashboard…</p> : <>
      {data.openPlays && <OpenPlayBanner plays={data.openPlays} />}
      <KpiRow data={data} />
      <StatusStrip counts={data.counts} />
      {data.schedule && <Schedule items={data.schedule} />}
      {data.availability && <Availability data={data.availability} />}
      {(data.finance || data.peakHours || data.courtOccupancy) && <div className="grid gap-4 xl:grid-cols-3">
        {data.finance && <RevenueChart finance={data.finance} />}
        {data.finance && <PaymentMethods items={data.finance.paymentMethods} />}
        {data.peakHours && <div className="xl:col-span-2"><PeakHours data={data.peakHours} /></div>}
        {data.courtOccupancy && <CourtOccupancy courts={data.courtOccupancy} revenueByCourt={revenueByCourt} />}
      </div>}
      <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Recent bookings</h2><p className="mt-1 text-sm text-muted-foreground">Latest reservations across all dates.</p></div><Link href="/admin/bookings" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">View all</Link></div>{data.recentBookings.length ? <BookingRows rows={data.recentBookings}/> : <p className="py-8 text-sm text-muted-foreground">No bookings yet.</p>}</section>
    </>}
  </div>;
}
