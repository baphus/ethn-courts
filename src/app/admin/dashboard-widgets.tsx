"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Dashboard, ScheduleItem } from "./dashboard-types";

type Finance = NonNullable<Dashboard["finance"]>;

const ACCENT = "#f28500";
const card = "rounded-xl border bg-card p-5";
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const shortDateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "Asia/Manila" });

const hourOf = (iso: string) => Number(hourFmt.format(new Date(iso)));
const shortDate = (ymd: string) => shortDateFmt.format(new Date(`${ymd}T00:00:00+08:00`));

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  return <span className={up ? "text-emerald-600" : "text-red-600"}>{up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs last month</span>;
}

function SectionTitle({ id, title, sub, action }: { id: string; title: string; sub?: string; action?: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
    <div><h2 id={id} className="text-lg font-semibold">{title}</h2>{sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}</div>
    {action}
  </div>;
}

/* ---------- Open Plays banner ---------- */

export function OpenPlayBanner({ plays }: { plays: NonNullable<Dashboard["openPlays"]> }) {
  const [next, ...rest] = plays;
  return <section aria-label="Open Plays" className="overflow-hidden rounded-2xl bg-sidebar p-6 text-sidebar-foreground">
    <div className={next ? "flex flex-wrap items-center justify-between gap-4" : "flex flex-col items-center gap-4 text-center"}>
      <div className="min-w-0">
        <span className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold text-[#1a1206]" style={{ backgroundColor: ACCENT }}>Open Play</span>
        {next ? <>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">{next.title}</h2>
          <p className="mt-1 text-sm opacity-80">{dateTimeFmt.format(new Date(next.startsAt))}{next.spotsLeft !== null && ` · ${next.spotsLeft} ${next.spotsLeft === 1 ? "spot" : "spots"} left`}</p>
        </> : <>
          <EmptyIcon className="mt-3 text-sidebar-foreground" /><h2 className="text-2xl font-semibold tracking-tight">No Open Plays scheduled</h2>
          <p className="mt-1 text-sm opacity-80">Schedule one and it appears on the public timetable.</p>
        </>}
      </div>
      <Link href="/admin/open-plays" className="rounded-lg px-4 py-2 text-sm font-semibold text-[#1a1206]" style={{ backgroundColor: ACCENT }}>{next ? "Manage Open Plays" : "Schedule an Open Play"}</Link>
    </div>
    {rest.length > 0 && <ul className="mt-4 flex flex-wrap gap-2 text-xs">{rest.slice(0, 3).map(p => <li key={p.id} className="rounded-full border border-white/20 px-3 py-1">{p.title} · {dateTimeFmt.format(new Date(p.startsAt))}</li>)}</ul>}
  </section>;
}

/* ---------- KPI row ---------- */

function KpiCard({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return <div className={card}>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
    {children && <p className="mt-1 text-xs text-muted-foreground">{children}</p>}
  </div>;
}

export function KpiRow({ data }: { data: Dashboard }) {
  const { kpis, finance } = data;
  if (!kpis && !finance) return null;
  const occupancy = kpis && kpis.openHoursMonth ? Math.round((kpis.bookedHoursMonth / kpis.openHoursMonth) * 100) : null;
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    {finance && <KpiCard label="Revenue today" value={peso.format(finance.revenueToday)} />}
    {finance && <KpiCard label="Revenue this month" value={peso.format(finance.revenueMonth)}><Delta current={finance.revenueMonth} previous={finance.revenuePrevMonth} /></KpiCard>}
    {kpis && <KpiCard label="Bookings today" value={String(kpis.bookingsToday)} />}
    {kpis && <KpiCard label="Bookings this month" value={String(kpis.bookingsMonth)}><Delta current={kpis.bookingsMonth} previous={kpis.bookingsPrevMonth} /></KpiCard>}
    {occupancy !== null && kpis && <KpiCard label="Court occupancy" value={`${occupancy}%`}>{kpis.bookedHoursMonth} of {kpis.openHoursMonth} open hours</KpiCard>}
  </div>;
}

/* ---------- Status counts (existing metrics, kept) ---------- */

export function StatusStrip({ counts }: { counts: Dashboard["counts"] }) {
  const items = [["Held", counts.held], ["Pending", counts.pending], ["Confirmed", counts.confirmed], ["Completed", counts.completed], ["Expired", counts.expired], ["Pending past start", counts.pendingReviewOverdue]] as const;
  return <section aria-labelledby="today-heading">
    <h2 id="today-heading" className="mb-3 text-lg font-semibold">Booking status today</h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div>)}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Pending past start needs review; it is not a payment confirmation.</p>
  </section>;
}

/* ---------- Today's schedule ---------- */

const PERIODS = [
  { key: "morning", label: "Morning", range: "Until 12:00 PM", test: (h: number) => h >= 5 && h < 12 },
  { key: "afternoon", label: "Afternoon", range: "12:00 PM to 5:00 PM", test: (h: number) => h >= 12 && h < 17 },
  { key: "evening", label: "Evening", range: "5:00 PM onward", test: (h: number) => h >= 17 || h < 5 },
];

const STATUS: Record<ScheduleItem["status"], { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  held: { label: "Held", cls: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
};

export function Schedule({ items }: { items: ScheduleItem[] }) {
  return <section className={card} aria-labelledby="schedule-heading">
    <SectionTitle id="schedule-heading" title="Today’s schedule" sub={`${items.length} ${items.length === 1 ? "booking" : "bookings"} today`} action={<Link href="/admin/calendar" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Open calendar</Link>} />
    <div className="grid gap-4 lg:grid-cols-3">
      {PERIODS.map(period => {
        const rows = items.filter(i => period.test(hourOf(i.startsAt))).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return <div key={period.key} className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between text-sm"><h3 className="font-medium">{period.label}</h3><span className="text-xs text-muted-foreground">{period.range}</span></div>
          <div className="space-y-2">
            {rows.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center"><EmptyIcon /> No bookings</p>}
            {rows.map(r => <article key={r.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-2"><p className="truncate font-medium">{r.customerName}</p><span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></div>
              <p className="mt-1 text-sm tabular-nums">{clock.format(new Date(r.startsAt))} to {clock.format(new Date(r.endsAt))}</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.courtName}{r.players !== null && `, ${r.players} players`}{r.amount !== null && `, ${peso.format(r.amount)}`}</p>
              {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
            </article>)}
          </div>
        </div>;
      })}
    </div>
  </section>;
}

/* ---------- Availability grid (30-minute slots) ---------- */

export function Availability({ data }: { data: NonNullable<Dashboard["availability"]> }) {
  const [dayIndex, setDayIndex] = useState(0);
  const day = data.days[dayIndex] ?? data.days[0];
  if (!day) return null;
  const cols = data.slotLabels.length;
  const total = day.courts.reduce((n, c) => n + c.slots.length, 0);
  const taken = day.courts.reduce((n, c) => n + c.slots.filter(s => s !== "open").length, 0);
  const cell = { booked: "bg-primary", held: "bg-[#f28500]/70", open: "bg-muted" } as const;
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  return <section className={card} aria-labelledby="availability-heading">
    <SectionTitle id="availability-heading" title="Availability" sub="Each square is 30 minutes." action={
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-primary" />Booked</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#f28500]/70" />Held</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-muted" />Open</span>
      </div>} />
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Choose a day">
      {data.days.map((d, i) => <button key={d.date} type="button" aria-pressed={i === dayIndex} onClick={() => setDayIndex(i)} className={`rounded-full px-3.5 py-1.5 text-sm ${i === dayIndex ? "bg-foreground text-background" : "border bg-card hover:bg-muted"}`}>{d.label}</button>)}
    </div>
    <div className="overflow-x-auto pb-2">
      <div style={{ minWidth: cols * 22 + 96 }}>
        <div className="mb-1 flex"><div className="w-24 shrink-0" />
          <div className="grid flex-1 text-[10px] text-muted-foreground" style={gridStyle}>
            {data.slotLabels.map((label, i) => i % 2 === 0 ? <span key={label + i} className="col-span-2 whitespace-nowrap">{label.replace(":00", "")}</span> : null)}
          </div>
        </div>
        {day.courts.map(court => {
          const bookedCount = court.slots.filter(s => s !== "open").length;
          return <div key={court.courtId} className="mb-1.5 flex items-center">
            <div className="w-24 shrink-0 truncate pr-2 text-sm font-medium">{court.name}</div>
            <div className="grid flex-1 gap-[2px]" style={gridStyle} role="img" aria-label={`${court.name}: ${bookedCount} of ${court.slots.length} slots taken on ${day.label}`}>
              {court.slots.map((state, i) => <div key={i} title={`${court.name}, ${data.slotLabels[i]}: ${state}`} className={`h-8 rounded-[4px] ${cell[state]}`} />)}
            </div>
          </div>;
        })}
      </div>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">{taken} of {total} slots taken on {day.label.toLowerCase()}.</p>
  </section>;
}

/* ---------- Revenue chart (owner only) ---------- */

export function RevenueChart({ finance }: { finance: Finance }) {
  const days = finance.dailyRevenue;
  const max = Math.max(1, ...days.map(d => d.amount));
  const average = days.length ? finance.revenueMonth / days.length : 0;
  return <section className={`${card} xl:col-span-2`} aria-labelledby="revenue-heading">
    <SectionTitle id="revenue-heading" title="Revenue this month" sub="Paid bookings only. Refunded and cancelled bookings are excluded." />
    <div className="flex flex-wrap items-baseline gap-3"><p className="text-3xl font-semibold tabular-nums tracking-tight">{peso.format(finance.revenueMonth)}</p><p className="text-xs"><Delta current={finance.revenueMonth} previous={finance.revenuePrevMonth} /></p></div>
    {days.length === 0 ? <p className="py-10 text-sm text-muted-foreground text-center"><EmptyIcon /> No paid bookings yet this month.</p> : <>
      <div className="mt-4 flex h-44 items-end gap-[3px]" role="img" aria-label={`Daily revenue, ${shortDate(days[0].date)} to ${shortDate(days[days.length - 1].date)}`}>
        {days.map((d, i) => <div key={d.date} title={`${shortDate(d.date)}: ${peso.format(d.amount)}`} className="flex h-full flex-1 items-end">
          <div className={`w-full rounded-t ${i === days.length - 1 ? "" : "bg-primary/80 hover:bg-primary"}`} style={{ height: `${Math.max(2, (d.amount / max) * 100)}%`, ...(i === days.length - 1 ? { backgroundColor: ACCENT } : {}) }} />
        </div>)}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{shortDate(days[0].date)}</span><span>{shortDate(days[days.length - 1].date)}</span></div>
    </>}
    <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
      <div><dt className="text-muted-foreground">Average per day</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{peso.format(Math.round(average))}</dd></div>
      <div><dt className="text-muted-foreground">Sales outside bookings</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{peso.format(finance.outsideSalesMonth)}</dd></div>
    </dl>
  </section>;
}

/* ---------- Payment methods (owner only) ---------- */

const METHOD_COLORS = ["bg-primary", "bg-[#f28500]", "bg-primary/60", "bg-[#f28500]/60", "bg-primary/30"];

export function PaymentMethods({ items }: { items: Finance["paymentMethods"] }) {
  const total = items.reduce((n, i) => n + i.amount, 0);
  return <section className={card} aria-labelledby="methods-heading">
    <SectionTitle id="methods-heading" title="Payment methods" sub="How players paid this month." />
    {total === 0 ? <p className="py-6 text-sm text-muted-foreground text-center"><EmptyIcon /> No payments yet this month.</p> : <>
      <div className="flex h-4 overflow-hidden rounded-full bg-muted">{items.map((i, idx) => <div key={i.method} title={`${i.method}: ${peso.format(i.amount)}`} className={METHOD_COLORS[idx % METHOD_COLORS.length]} style={{ width: `${(i.amount / total) * 100}%` }} />)}</div>
      <ul className="mt-4 space-y-2 text-sm">{items.map((i, idx) => <li key={i.method} className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2"><i className={`size-3 rounded-sm ${METHOD_COLORS[idx % METHOD_COLORS.length]}`} />{i.method}</span>
        <span className="tabular-nums text-muted-foreground">{Math.round((i.amount / total) * 100)}% · {peso.format(i.amount)}</span>
      </li>)}</ul>
    </>}
  </section>;
}

/* ---------- Peak hours ---------- */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BUCKETS = ["7a", "9a", "11a", "1p", "3p", "5p", "7p", "9p", "11p", "1a"]; // 2-hour buckets across 7:00 AM to 3:00 AM

export function PeakHours({ data }: { data: NonNullable<Dashboard["peakHours"]> }) {
  const grid = WEEKDAYS.map(() => BUCKETS.map(() => 0));
  for (const { weekday, hour, count } of data) {
    const bucket = Math.floor(((hour - 7 + 24) % 24) / 2);
    if (weekday >= 0 && weekday < 7 && bucket < BUCKETS.length) grid[weekday][bucket] += count;
  }
  const max = Math.max(1, ...grid.flat());
  return <section className={card} aria-labelledby="peak-heading">
    <SectionTitle id="peak-heading" title="Peak hours" sub="Bookings by start time, this month." />
    <div className="grid grid-cols-[2.5rem_repeat(10,minmax(0,1fr))] gap-1 text-[10px] text-muted-foreground">
      <span />{BUCKETS.map(b => <span key={b} className="text-center">{b}</span>)}
      {WEEKDAYS.map((day, w) => <div key={day} className="contents">
        <span className="self-center text-xs">{day}</span>
        {grid[w].map((count, b) => <div key={b} role="img" aria-label={`${day} ${BUCKETS[b]}: ${count} bookings`} title={`${day} ${BUCKETS[b]}: ${count} bookings`} className={`h-7 rounded-[4px] ${count ? "" : "bg-muted"}`} style={count ? { backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(15 + (70 * count) / max)}%, transparent)` } : undefined} />)}
      </div>)}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Darker means busier. Hover a square for the count.</p>
  </section>;
}

/* ---------- Court occupancy ---------- */

export function CourtOccupancy({ courts, revenueByCourt }: { courts: NonNullable<Dashboard["courtOccupancy"]>; revenueByCourt?: Map<string, number> }) {
  const booked = courts.reduce((n, c) => n + c.bookedHours, 0);
  const open = courts.reduce((n, c) => n + c.openHours, 0);
  return <section className={card} aria-labelledby="occupancy-heading">
    <SectionTitle id="occupancy-heading" title="Court occupancy" sub={open ? `Venue average ${Math.round((booked / open) * 100)}% this month.` : "Open hours booked this month."} />
    <ul className="space-y-4">{courts.map(c => {
      const pct = c.openHours ? Math.round((c.bookedHours / c.openHours) * 100) : 0;
      const revenue = revenueByCourt?.get(c.courtId);
      return <li key={c.courtId}>
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{c.name}</span><span className="tabular-nums text-muted-foreground">{pct}%{revenue !== undefined && ` · ${peso.format(revenue)}`}</span></div>
        <div className="h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.name} ${pct}% occupied`}><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <p className="mt-1 text-xs text-muted-foreground">{c.bookedHours} of {c.openHours} open hours</p>
      </li>;
    })}</ul>
  </section>;
}
