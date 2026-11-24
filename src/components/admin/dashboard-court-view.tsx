"use client";
import "./court-view.css";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Interval } from "@/app/admin/calendar/calendar-range";
import type { DashboardOverview } from "@/app/admin/dashboard-overview-types";
import { StatusBadge } from "./dashboard-status";
import { CourtTimeline } from "./court-timeline";
import { CourtCard } from "./court-card";
import { KpiRow, type Kpi } from "./kpi-row";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { shiftDate } from "@/app/admin/calendar/date-utils";
import { Avatar } from "./court-avatar";
import { courtStatus, currentPosition, intervalLabel, timelineTime } from "./court-timeline-utils";
import { useBookingDetail, useCourtDay, useNow } from "./use-court-day";

const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const navBtn = "grid h-9 place-items-center rounded-lg border bg-background px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50";

function Skeleton() {
  return <div role="status" aria-busy="true" className="space-y-4"><span className="sr-only">Loading calendar…</span>
    <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map(i => <div key={i} className="h-52 animate-pulse motion-reduce:animate-none rounded-2xl border bg-muted/40" />)}</div>
    <div className="h-96 animate-pulse motion-reduce:animate-none rounded-2xl border bg-muted/40" />
  </div>;
}

export function DashboardCourtView({ overview }: { overview: DashboardOverview | null }) {
  const [date, setDate] = useState("");
  const { day, error, loading, updated } = useCourtDay(date);
  const selectedDate = date || day?.date || overview?.operatingDate || "";
  const now = useNow();
  const [block, setBlock] = useState<{ court: string; item: Interval } | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const { detail, error: detailError } = useBookingDetail(booking);

  const live = !!day && currentPosition(day.window, now) !== null;
  const statuses = useMemo(() => (day ? day.courts.map(court => ({ court, status: courtStatus(court, live, now) })) : []), [day, live, now]);

  const kpis: Kpi[] = [
    ...(overview ? [
      { label: "Bookings", Icon: CalendarDays, value: Number(overview.periods.today) || 0 },
      { label: "Pending", Icon: Clock, value: Number(overview.counts.pending) || 0 },
      { label: "Confirmed", Icon: CheckCircle2, value: Number(overview.counts.confirmed) || 0 },
      { label: "Overdue review", Icon: AlertTriangle, value: Number(overview.counts.pendingReviewOverdue) || 0, warn: overview.counts.pendingReviewOverdue > 0 },
    ] : []),
  ];

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
    </section>}

    {updated && <p className="text-xs text-muted-foreground" role="status">{loading ? "Refreshing schedule…" : `Last updated ${timelineTime(updated)}`}</p>}

    {day && <section aria-label="Court summaries" className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-3">
      {statuses.map(({ court, status }, i) => <CourtCard key={court.id} court={court} status={status} now={now} live={live} index={i} onOpen={setBooking} />)}
    </section>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Court timeline</h2>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous date" className={navBtn} disabled={!selectedDate} onClick={() => setDate(shiftDate(selectedDate, -1))}><ChevronLeft className="size-4" /></button>
        <input aria-label="Court schedule date" type="date" className={navBtn} value={selectedDate} onChange={event => { if (event.target.value) setDate(event.target.value); }} />
        <button type="button" aria-label="Next date" className={navBtn} disabled={!selectedDate} onClick={() => setDate(shiftDate(selectedDate, 1))}><ChevronRight className="size-4" /></button>
      </div>
    </div>
    {error ? <p role="alert" className="rounded-xl border border-destructive p-4">{error} Occupancy unknown.</p> : !day ? <Skeleton /> : <section aria-label="Court timeline"><CourtTimeline day={day} now={now} onBooking={setBooking} onBlock={(court, item) => setBlock({ court, item })} /></section>}
    <Dialog open={block !== null} onOpenChange={open => { if (!open) setBlock(null); }}>
      <DialogContent><DialogTitle>Scheduled allocation</DialogTitle><DialogDescription>{block?.court}</DialogDescription>
        {block && <><p className="capitalize">{intervalLabel(block.item)}</p><p className="text-sm">{dateTime(block.item.startsAt)} – {dateTime(block.item.endsAt)}</p><Link href="/admin/calendar" className="text-sm font-semibold text-primary underline">Open calendar for block actions</Link></>}
      </DialogContent>
    </Dialog>
    <Dialog open={booking !== null} onOpenChange={open => { if (!open) setBooking(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogTitle>Booking summary</DialogTitle><DialogDescription>Read-only booking details.</DialogDescription>
        {detailError ? <p role="alert">{detailError}</p> : !detail || detail.id !== booking ? <p className="animate-pulse motion-reduce:animate-none text-sm text-muted-foreground">Loading booking…</p> : <div className="cv-rise space-y-3 text-sm">
          <div className="flex items-center gap-3"><Avatar name={detail.data.guestName || "Guest"} /><div><p className="font-semibold">{detail.data.guestName || "Guest"}</p><StatusBadge state={detail.data.status} /></div></div>
          <p>Original booking total: ₱{Number(detail.data.total).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <h3 className="font-semibold">Court schedule</h3>
          <ul className="space-y-1">{detail.data.items.map((item, i) => <li key={`${item.courtId}-${i}`} className="rounded-lg border bg-muted/40 px-3 py-2">{item.courtName}: {dateTime(item.startsAt)} – {dateTime(item.endsAt)}</li>)}</ul>
        </div>}
        {booking && <Link className="text-sm font-semibold text-primary underline" href={`/admin/bookings/${encodeURIComponent(booking)}`}>Open full booking</Link>}
      </DialogContent>
    </Dialog>
  </div>;
}
