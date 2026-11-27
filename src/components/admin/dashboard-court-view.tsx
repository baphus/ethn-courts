"use client";

import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { Button } from "@/components/ui/button";
import { LoadingRows } from "@/components/admin/loading-slots";
import "./court-view.css";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Skeleton as LoadingSkeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Interval } from "@/app/admin/calendar/calendar-range";
import type { DashboardOverview } from "@/app/admin/dashboard-overview-types";
import { StatusBadge } from "./dashboard-status";
import { CourtSchedule } from "./court-schedule";
import { CourtCard } from "./court-card";
import { KpiRow, type Kpi } from "./kpi-row";
import { CheckCircle2, Clock } from "lucide-react";
import { Avatar } from "./court-avatar";
import { courtStatus, currentPosition, dashboardCourtSchedule, intervalLabel, timelineTime } from "./court-timeline-utils";
import { useBookingDetail, useCourtDay, useNow } from "./use-court-day";

function Skeleton() {
  return <div role="status" className="rounded-2xl border bg-card p-4 shadow-sm"><span className="sr-only">Loading court timeline</span>
    <LoadingSkeleton className="h-96 motion-reduce:animate-none" />
  </div>;
}

export function DashboardCourtView({ overview, owner, overviewError, retryOverview }: { overview: DashboardOverview | null; owner: boolean; overviewError: string; retryOverview: () => void }) {
  const [date, setDate] = useState("");
  const { day: calendar, error, loading, updated } = useCourtDay(date);
  const selectedDate = date || calendar?.date || overview?.operatingDate || "";
  const now = useNow();
  const day = useMemo(() => calendar && dashboardCourtSchedule(calendar, now), [calendar, now]);
  const [block, setBlock] = useState<{ court: string; item: Interval } | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const { detail, error: detailError } = useBookingDetail(booking);

  const live = !!day && currentPosition(day.window, now) !== null;
  const statuses = useMemo(() => (day ? day.courts.map(court => ({ court, status: courtStatus(court, live, now) })) : []), [day, live, now]);

  const placeholder = overviewError ? "Unavailable" : <LoadingSkeleton className="h-7 w-16 motion-reduce:animate-none" />;
  const kpis: Kpi[] = overview || owner ? [
    { label: "Pending", Icon: Clock, value: overview ? Number(overview.counts.pending) || 0 : placeholder },
    { label: "Confirmed", Icon: CheckCircle2, value: overview ? Number(overview.counts.confirmed) || 0 : placeholder },
  ] : [];

  return <div className="space-y-5 pb-24">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Court view</h1></div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/calendar" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 motion-safe:active:scale-[0.98]">Create event in calendar</Link>
      </div>
    </header>

    {kpis.length > 0 && <section>
      <div className="mb-3"><h2 className="font-semibold">Today</h2></div>
      <KpiRow items={kpis} />
      {overviewError && <p role="alert" className="mt-2 text-sm">{overviewError} <Button type="button" variant="link" className="h-auto p-0" onClick={retryOverview}>Retry</Button></p>}
    </section>}

    {updated && <p className="text-xs text-muted-foreground" role="status">{loading ? "Refreshing schedule…" : `Last updated ${timelineTime(updated)}`}</p>}

    {!day && !error && <div aria-label="Loading court summaries" className="grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="min-h-44 space-y-3 rounded-2xl border bg-card p-4 shadow-sm"><LoadingSkeleton className="h-4 w-24 motion-reduce:animate-none" /><LoadingSkeleton className="h-7 w-36 motion-reduce:animate-none" /><LoadingSkeleton className="h-16 w-full motion-reduce:animate-none" /></div>)}</div>}
    {day && <section aria-label="Court summaries" className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-3">
      {statuses.map(({ court, status }) => <CourtCard key={court.id} court={court} status={status} now={now} live={live} onOpen={setBooking} />)}
    </section>}
    <CourtSchedule title="Court timeline" description="Shows current and upcoming confirmed bookings and court blocks. Check the calendar for pending bookings and holds."
      date={selectedDate} onDateChange={setDate} day={error ? null : day} now={now} onBooking={setBooking} onBlock={(court, item) => setBlock({ court, item })}>
      {error ? <p role="alert" className="rounded-xl border border-destructive p-4">{error} Occupancy unknown.</p> : <Skeleton />}
    </CourtSchedule>
    <Dialog open={block !== null} onOpenChange={open => { if (!open) setBlock(null); }}>
      <DialogContent><DialogTitle>Scheduled allocation</DialogTitle><DialogDescription>{block?.court}</DialogDescription>
        {block && <><p className="capitalize">{intervalLabel(block.item)}</p><p className="text-sm">{formatScheduleRange(block.item.startsAt, block.item.endsAt)}</p><Link href="/admin/calendar" className="text-sm font-semibold text-primary underline">Open calendar for block actions</Link></>}
      </DialogContent>
    </Dialog>
    <Dialog open={booking !== null} onOpenChange={open => { if (!open) setBooking(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogTitle>Booking summary</DialogTitle><DialogDescription>Read-only booking details.</DialogDescription>
        {detailError ? <p role="alert">{detailError}</p> : !detail || detail.id !== booking ? <LoadingRows label="Loading booking" /> : <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3"><Avatar name={detail.data.guestName || "Guest"} /><div><p className="font-semibold">{detail.data.guestName || "Guest"}</p><StatusBadge state={detail.data.status} /></div></div>
          <p>Original booking total: ₱{Number(detail.data.total).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <h3 className="font-semibold">Court schedule</h3>
          <ul className="space-y-1">{detail.data.items.map((item, i) => <li key={`${item.courtId}-${i}`} className="rounded-lg border bg-muted/40 px-3 py-2">{item.courtName}: {formatScheduleRange(item.startsAt, item.endsAt)}</li>)}</ul>
        </div>}
        {booking && <Link className="text-sm font-semibold text-primary underline" href={`/admin/bookings/${encodeURIComponent(booking)}`}>Open full booking</Link>}
      </DialogContent>
    </Dialog>
  </div>;
}
