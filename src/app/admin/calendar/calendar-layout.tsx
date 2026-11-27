"use client";
import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { DateField } from "@/components/ui/date-field";
import { bookingStatusStyle } from "@/components/booking/booking-status";

import { LoadingRows } from "@/components/admin/loading-slots";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/admin/dashboard/section-card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { loadDates, rangeDates, stepPeriod, uniqueScheduleDays, type Calendar, type Interval, type View } from "./calendar-range";
import { CourtTimeline } from "@/components/admin/court-timeline";
import BookingDetail from "../bookings/booking-detail";
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) => new Intl.DateTimeFormat("en-PH", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const stateColors: Record<string, string> = {
  held: bookingStatusStyle("held").className,
  pending: bookingStatusStyle("pending").className,
  confirmed: bookingStatusStyle("confirmed").className,
  completed: bookingStatusStyle("completed").className,
};
const stateColor = (state: string) => stateColors[state] ?? "border-border bg-muted text-foreground";

export default function CalendarLayout({ date, today, revision, busy, onDate, onToday, onRelease }: { date: string; today: string; revision: number; busy: boolean; onDate: (date: string) => void; onToday: () => void; onRelease: (id: string, court: string, interval: Interval) => void }) {
  const [view, setView] = useState<View>("weekly");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const [days, setDays] = useState<Record<string, Calendar | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState("");
  const [panel, setPanel] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  const bookingOrigin = useRef<HTMLElement | null>(null);
  const dates = rangeDates(date, view);
  const key = dates.join(",");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setDays({});
    void loadDates(key.split(","), controller.signal, async (day, signal) => {
      const response = await fetch(`/api/ethn/admin/calendar?date=${encodeURIComponent(day)}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Calendar unavailable");
      return response.json() as Promise<Calendar>;
    }).then(result => { if (!controller.signal.aborted) { setDays(result); setLoadedKey(`${key}:${revision}`); setLoading(false); } });
    return () => controller.abort();
  }, [key, revision, saved]);
  function openBooking(id: string, origin?: HTMLElement) {
    if (booking === id) return;
    bookingOrigin.current = origin ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setBooking(id);
  }
  const scheduleDays = uniqueScheduleDays(dates, days);
  const entries = (day: Calendar) => day.courts.flatMap(court => court.intervals.map(item => ({ court, item })));
  const label = view === "monthly" ? dateLabel(date, { month: "long", year: "numeric" }) : view === "daily" ? dateLabel(date) : `${dateLabel(dates[0], { month: "short", day: "numeric" })} – ${dateLabel(dates[6], { month: "short", day: "numeric", year: "numeric" })}`;
  const dayContent = (day: Calendar, bookings = true) => entries(day).length > 0 && <div className="space-y-4">{bookings && <p className="text-xs text-muted-foreground">Operating window: {formatScheduleRange(day.window.startsAt, day.window.endsAt, day.date)}</p>}{day.courts.filter(court => court.intervals.some(item => bookings || item.state === "held" || item.kind !== "booking")).map(court => <section key={court.id} className="rounded-lg border p-3"><h3 className="font-semibold">{court.name} <span className="text-xs font-normal text-muted-foreground">· {court.active ? "Active" : "Inactive"}</span></h3><ul className="mt-2 divide-y">{court.intervals.filter(item => bookings || item.state === "held" || item.kind !== "booking").map(item => <li key={item.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{formatScheduleRange(item.startsAt, item.endsAt, day.date)}</p><p className="capitalize">{item.state === "held" ? "Unavailable" : <>{item.kind.replaceAll("_", " ")} · {item.state.replaceAll("_", " ")}{item.guestName ? ` · ${item.guestName}` : ""}</>}</p>{item.state !== "held" && item.reason && <p className="break-words text-muted-foreground">{item.reason}</p>}{item.state !== "held" && item.bookingId && item.kind === "booking" && bookings && <Button size="sm" variant="outline" onClick={event => openBooking(item.bookingId!, event.currentTarget)}>View booking</Button>}{item.blockId && (item.kind === "maintenance" || item.kind === "private") && <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => onRelease(item.blockId!, court.name, item)}>Release block</Button>}</li>)}</ul></section>)}</div>;
  const dayBookings = (day: Calendar) => {
    const grouped = new Map<string, { item: Interval; ranges: Map<string, { courts: Set<string>; slots?: number }> }>();
    for (const { court, item } of entries(day)) if (item.state !== "held" && item.kind === "booking" && item.bookingId) {
      const booking = grouped.get(item.bookingId) ?? { item, ranges: new Map() };
      const rangeKey = `${item.startsAt}|${item.endsAt}|${item.slotCount ?? ""}`;
      const range = booking.ranges.get(rangeKey) ?? { courts: new Set<string>(), slots: item.slotCount };
      range.courts.add(court.name);
      booking.ranges.set(rangeKey, range);
      grouped.set(item.bookingId, booking);
    }
    return [...grouped.values()];
  };
  const bookingSummary = (date: string, item: Interval, ranges: Map<string, { courts: Set<string>; slots?: number }>) => <button key={item.id} type="button" onClick={event => openBooking(item.bookingId!, event.currentTarget)} className={`block w-full rounded border px-2 py-2 text-left text-xs focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary ${stateColor(item.state)}`} aria-haspopup="dialog"><span className="font-semibold">{item.guestName || "Guest"}</span><span className="block">{[...ranges.entries()].map(([key, value]) => { const [startsAt, endsAt] = key.split("|"); const range = formatScheduleRange(startsAt, endsAt, date); return <span key={key} className="block">{[...value.courts].join(", ")} · {range}{value.slots ? ` · ${value.slots} ${value.slots === 1 ? "slot" : "slots"}${value.courts.size > 1 ? " per court" : ""}` : ""}</span>; })}</span><span className="capitalize">{item.state.replaceAll("_", " ")}</span></button>;
  return <>
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => onDate(stepPeriod(date, view, -1))} aria-label="Previous period">‹</Button><DateField aria-label={`Choose operating date, ${label}`} triggerLabel={label} value={date} disabled={busy} required onValueChange={onDate} /><Button variant="outline" size="sm" disabled={busy} onClick={() => onDate(stepPeriod(date, view, 1))} aria-label="Next period">›</Button><Button variant="outline" size="sm" disabled={busy} onClick={onToday}>Today</Button></div><Segmented label="Calendar view" value={view} onChange={setView} options={(["monthly", "weekly", "daily", "schedule"] as View[]).map(mode => ({ value: mode, label: mode }))} /></div>
      {loading || loadedKey !== `${key}:${revision}` ? <LoadingRows label="Loading calendar" rows={6} /> : <>{dates.some(day => days[day] === null) && <p role="alert" className="border-b bg-destructive/5 p-4 text-sm">Some dates could not be loaded. Their availability is unknown. Reload this page to try again.</p>}{view === "daily" ? <div className="p-4">{days[date] ? <><CourtTimeline day={days[date]!} now={now} onBooking={openBooking} onBlock={() => setPanel(date)}/><details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">All allocations and block actions</summary>{dayContent(days[date]!)}</details></> : <p role="alert">Calendar unavailable for this date.</p>}</div> : view === "schedule" ? <div className="divide-y">{dates.filter(day => !days[day] || (scheduleDays[day] && entries(scheduleDays[day]!).length > 0)).map(day => <section key={day} className="p-4"><h3 className="mb-3 font-semibold">{dateLabel(day)}</h3>{scheduleDays[day] ? <>{entries(days[day]!).length > entries(scheduleDays[day]!).length && <p className="mb-2 text-xs text-muted-foreground">Some continuing allocations appear on an earlier day in this schedule.</p>}{dayContent(scheduleDays[day]!)}</> : <p className="text-sm text-destructive">Unavailable — occupancy unknown.</p>}</section>)}</div> : <>
        {view === "weekly" && <div className="sm:hidden">
          <div className="flex gap-2 overflow-x-auto px-4 py-4">{dates.map(day => <button key={day} type="button" onClick={() => { onDate(day); setView("daily"); }} className={`flex min-w-13 flex-col items-center rounded-xl border px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary ${day === today ? "border-primary bg-primary/10" : "bg-background"}`}><span className="text-xs font-semibold text-muted-foreground">{dateLabel(day, { weekday: "short" })}</span><span className="mt-1 font-bold">{Number(day.slice(8))}</span></button>)}</div>
          <div className="space-y-5 border-t p-4">{dates.map(day => { const data = days[day]; const items = data ? entries(data) : []; if (data && items.length === 0) return null; return <section key={day}><h3 className="mb-2 text-sm font-semibold">{dateLabel(day, { weekday: "short", month: "short", day: "numeric" })}</h3>{!data ? <p className="text-sm text-destructive">Unavailable — occupancy unknown.</p> : <div className="space-y-2">{items.map(({ court, item }) => item.state !== "held" && item.kind === "booking" && item.bookingId ? bookingSummary(day, item, new Map([[`${item.startsAt}|${item.endsAt}|${item.slotCount ?? ""}`, { courts: new Set([court.name]), slots: item.slotCount }]])) : <button key={item.id} type="button" onClick={() => setPanel(day)} className={`w-full rounded-lg border p-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-primary ${stateColor(item.state)}`}><span className="block font-semibold">{court.name} · {item.state === "held" ? "Unavailable" : item.kind.replaceAll("_", " ")}</span><span className="block">{formatScheduleRange(item.startsAt, item.endsAt, day)}</span>{item.state !== "held" && <span className="capitalize">{item.state.replaceAll("_", " ")}</span>}</button>)}</div>}</section>; })}</div>
        </div>}
        <div className={view === "weekly" ? "hidden sm:block" : ""}>
          <div className="grid grid-cols-7 border-b">{(view === "monthly" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]).map(day => <div key={day} className="min-w-0 py-2 text-center text-xs font-semibold uppercase text-muted-foreground"><span className="sm:hidden">{day.slice(0, 1)}</span><span className="hidden sm:inline">{day}</span></div>)}</div>
          <div className="grid grid-cols-7">{view === "monthly" && Array.from({ length: new Date(`${dates[0]}T12:00:00Z`).getUTCDay() }, (_, index) => <div key={`padding-${index}`} aria-hidden="true" className="border-b border-r" />)}{dates.map(day => { const data = days[day]; const items = data ? entries(data) : []; return <div key={day} className="relative min-h-20 min-w-0 overflow-hidden border-b border-r p-1 sm:min-h-28 sm:p-2"><button type="button" onClick={() => setPanel(day)} aria-label={`${dateLabel(day)}: ${data ? (items.length ? `${items.length} allocations` : "no allocations") : "unavailable"}`} className="absolute inset-0 w-full text-left hover:bg-muted/50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary"><span className="sr-only">Open day details</span></button><span className={`pointer-events-none relative inline-flex size-7 items-center justify-center rounded-full text-sm font-bold ${day === today ? "bg-primary text-primary-foreground" : ""}`}>{Number(day.slice(8))}</span>{!data ? <p className="pointer-events-none relative mt-2 text-xs font-semibold text-destructive"><span className="sm:hidden">!</span><span className="hidden sm:inline">Unavailable</span></p> : <>{items.length > 0 && <p className="pointer-events-none relative mt-2 text-xs text-muted-foreground">{items.length}<span className="hidden sm:inline"> allocation{items.length === 1 ? "" : "s"}</span></p>}{view === "weekly" && items.slice(0, 3).map(({ court, item }) => item.state !== "held" && item.kind === "booking" && item.bookingId ? <div key={item.id} className="relative mt-1">{bookingSummary(day, item, new Map([[`${item.startsAt}|${item.endsAt}|${item.slotCount ?? ""}`, { courts: new Set([court.name]), slots: item.slotCount }]]))}</div> : <p key={item.id} className={`pointer-events-none relative mt-1 truncate rounded border px-1.5 py-1 text-xs ${stateColor(item.state)}`}>{court.name} · {item.state === "held" ? "Unavailable" : `${item.guestName || item.kind.replaceAll("_", " ")} · ${item.state.replaceAll("_", " ")}`}</p>)}</>}</div>; })}</div>
        </div>
      </>}</>}
      {!loading && loadedKey === `${key}:${revision}` && dates.some(day => days[day] && entries(days[day]!).length > 0) && <div className="flex flex-wrap gap-3 border-t px-4 py-3 text-xs">{Object.entries(stateColors).map(([state, color]) => <span key={state} className={`rounded border px-2 py-1 capitalize ${color}`}>{state}</span>)}</div>}
    </div>
    <Sheet open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }}><SheetContent className="w-full overflow-y-auto sm:max-w-md"><SheetHeader><SheetTitle>{panel ? dateLabel(panel, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Day"}</SheetTitle><SheetDescription className="sr-only">Allocations and block actions for this operating day.</SheetDescription></SheetHeader><div className="px-4 pb-6">{panel && loadedKey === `${key}:${revision}` && days[panel] ? <div className="space-y-4">{dayBookings(days[panel]!).length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">Bookings</h3>{dayBookings(days[panel]!).map(({ item, ranges }) => bookingSummary(panel, item, ranges))}</section>}{dayContent(days[panel]!, false)}</div> : <p role="alert">Calendar unavailable for this date. Reload this page to try again.</p>}</div></SheetContent></Sheet>
    <Dialog open={booking !== null} onOpenChange={open => { if (!open) setBooking(null); }}><DialogContent className="grid h-[min(90dvh,52rem)] max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden sm:max-w-3xl" finalFocus={bookingOrigin}><DialogTitle>Booking details</DialogTitle><DialogDescription>Review reservation and payment information.</DialogDescription>{booking && <BookingDetail key={booking} id={booking} embedded onSaved={() => setSaved(n => n + 1)} />}</DialogContent></Dialog>
  </>;
}
