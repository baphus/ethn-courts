"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookingRows, ErrorNotice, request, type BookingSummary } from "./bookings/booking-list";

type Dashboard = { operatingDate: string; counts: { held: number; pending: number; confirmed: number; completed: number; expired: number; pendingReviewOverdue: number }; recentBookings: BookingSummary[] };

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); void request<Dashboard>("/api/ethn/admin/dashboard", controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }); return () => controller.abort(); }, []);
  const metrics = data && [["Held", data.counts.held], ["Pending", data.counts.pending], ["Confirmed", data.counts.confirmed], ["Completed", data.counts.completed], ["Expired", data.counts.expired], ["Pending past start", data.counts.pendingReviewOverdue]] as const;
  return <div className="mx-auto w-full max-w-7xl space-y-6 py-2"><header className="border-b pb-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ETHN Courts / Staff</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Today’s bookings and the latest reservations.</p></header>
    {error ? <ErrorNotice message={error}/> : !data ? <p role="status" className="py-8 text-sm text-muted-foreground">Loading dashboard…</p> : <><section aria-labelledby="today-heading"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="today-heading" className="text-lg font-semibold">Today at the courts</h2><p className="text-sm text-muted-foreground">{data.operatingDate} · Manila</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{metrics?.map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Pending past start needs review; it is not a payment confirmation.</p></section><section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Recent bookings</h2><p className="mt-1 text-sm text-muted-foreground">Latest reservations across all dates.</p></div><Link href="/admin/bookings" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">View all</Link></div>{data.recentBookings.length ? <BookingRows rows={data.recentBookings}/> : <p className="py-8 text-sm text-muted-foreground">No bookings yet.</p>}</section></>}</div>;
}
