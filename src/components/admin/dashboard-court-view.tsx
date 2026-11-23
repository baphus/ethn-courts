"use client";
import "./court-view.css";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Interval } from "@/app/admin/calendar/calendar-range";
import type { DashboardOverview } from "@/app/admin/dashboard-overview-types";
import { StatusBadge } from "./dashboard-status";
import { CourtTimeline } from "./court-timeline";
import { CourtCard } from "./court-card";
import { KpiRow, type Kpi } from "./kpi-row";
import { AttentionPanel } from "./attention-panel";
import { Avatar } from "./court-avatar";
import { attention, courtStatus, currentPosition, intervalLabel, timelineTime } from "./court-timeline-utils";
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
  const { day, error, loading, updated, refresh } = useCourtDay("");
  const now = useNow();
  const [block, setBlock] = useState<{ court: string; item: Interval } | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const { detail, error: detailError } = useBookingDetail(booking);

  const live = !!day && currentPosition(day.window, now) !== null;
  const pending = useMemo(() => (day ? attention(day, now) : []), [day, now]);
  const statuses = useMemo(() => (day ? day.courts.map(court => ({ court, status: courtStatus(court, live, now) })) : []), [day, live, now]);

  const kpis: Kpi[] = [
    ...(overview ? [
      { label: "Bookings", value: Number(overview.periods.today) || 0 },
      { label: "Pending", value: Number(overview.counts.pending) || 0 },
      { label: "Confirmed", value: Number(overview.counts.confirmed) || 0 },
      { label: "Overdue review", value: Number(overview.counts.pendingReviewOverdue) || 0, warn: true },
    ] : []),
  ];

  return <div className="space-y-6 pb-24">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Court view</h1></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={navBtn} onClick={refresh} disabled={loading} aria-label="Refresh schedule" title="Refresh schedule"><RefreshCw className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} /></button>
        <Link href="/admin/calendar" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 motion-safe:active:scale-[0.98]">Create event in calendar</Link>
      </div>
    </header>

    {kpis.length > 0 && <section>
      <div className="mb-3"><h2 className="font-semibold">Today</h2><p className="text-xs text-muted-foreground">Overdue is included in pending</p></div>
      <KpiRow items={kpis} />
    </section>}

    {updated && <p className="text-xs text-muted-foreground" role="status">{loading ? "Refreshing schedule…" : `Last updated ${timelineTime(updated)}`}</p>}

    {error ? <p role="alert" className="rounded-xl border border-destructive p-4">{error} Occupancy unknown.</p> : !day ? <Skeleton /> : <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Courts</h2>
        </div>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Operating hours</summary><p className="mt-1">{dateTime(day.window.startsAt)} – {dateTime(day.window.endsAt)}</p></details>
      </div>
      <section aria-label="Court summaries" className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3">
        {statuses.map(({ court, status }, i) => <CourtCard key={court.id} court={court} status={status} now={now} live={live} index={i} onOpen={setBooking} />)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section><h2 className="mb-3 font-semibold">Court timeline</h2><CourtTimeline day={day} now={now} onBooking={setBooking} onBlock={(court, item) => setBlock({ court, item })} /></section>
        <AttentionPanel items={pending} now={now} onOpen={setBooking} />
      </div>
    </>}

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
