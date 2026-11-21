"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shiftDate, toIso } from "./date-utils";

type Interval = { id: string; startsAt: string; endsAt: string; state: string; kind: "booking" | "maintenance" | "private" | "open_play"; bookingId: string | null; guestName: string | null; blockId: string | null; reason: string | null };
type Calendar = { date: string; serverNow: string; window: { startsAt: string; endsAt: string }; courts: { id: string; name: string; active: boolean; intervals: Interval[] }[] };

const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const errorMessage = (status: number) => status === 400 ? "Check the dates, times and reason. Blocks must start in the future and be within the configured horizon." : status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "The court or block was not found. Refresh the calendar and try again." : status === 409 ? "This time overlaps another allocation. Refresh the calendar and choose another time." : status === 503 ? "Calendar service is unavailable. Try again later." : "Something went wrong. Refresh the calendar and try again.";

export default function CalendarPage() {
  const [date, setDate] = useState("");
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [courtId, setCourtId] = useState("");
  const [kind, setKind] = useState<"maintenance" | "private">("maintenance");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setCalendar(null);
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    fetch(`/api/ethn/admin/calendar${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(errorMessage(response.status)); return response.json() as Promise<Calendar>; })
      .then(data => { setCalendar(data); setCourtId(current => data.courts.some(court => court.active && court.id === current) ? current : data.courts.find(court => court.active)?.id ?? ""); setStartDate(current => current || data.date); setEndDate(current => current || data.date); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Calendar unavailable. Try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, revision]);

  async function createBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !calendar) return;
    const startsAt = toIso(startDate, startTime), endsAt = toIso(endDate, endTime);
    if (!startsAt || !endsAt || endsAt <= startsAt || !reason.trim()) { setError("Enter a valid start, end and reason. End must be after start."); return; }
    const court = calendar.courts.find(c => c.id === courtId && c.active);
    if (!court) { setError("Select an active court."); return; }
    if (!window.confirm(`Create ${kind} block for ${court.name}?\n${formatDateTime(startsAt)} – ${formatDateTime(endsAt)} (Manila)\nReason: ${reason.trim()}`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ethn/admin/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courtId, startsAt, endsAt, reason: reason.trim(), kind }) });
      if (!response.ok) { setError(response.status >= 500 ? "Could not confirm whether the block was created. Refresh the calendar before retrying." : errorMessage(response.status)); return; }
      setReason(""); setNotice("Block created. Calendar refreshed.");
    } catch { setError("Could not confirm whether the block was created. Refresh the calendar before retrying."); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }

  async function releaseBlock(blockId: string, courtName: string, interval: Interval) {
    if (busy || loading || !window.confirm(`Release this ${interval.kind} block on ${courtName}?\n${formatDateTime(interval.startsAt)} – ${formatDateTime(interval.endsAt)} (Manila)`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/ethn/admin/blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" });
      if (!response.ok) { setError(response.status >= 500 ? "Could not confirm whether the block was released. Refresh the calendar." : errorMessage(response.status)); return; }
      setNotice("Block released. Calendar refreshed.");
    } catch { setError("Could not confirm whether the block was released. Refresh the calendar."); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }

  const displayedDate = calendar?.date ?? date;
  return <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
    <header className="space-y-2 border-l-4 border-[#f28500] pl-5"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#f28500]">Front desk</p><h1 className="font-display text-5xl tracking-wide text-[#16384d]">Court calendar</h1><p className="max-w-2xl text-muted-foreground">View court occupancy by operating date and reserve time for maintenance or private use. All dates and times are in Manila.</p></header>
    <section aria-label="Operating date" className="space-y-3 border border-[#dce5e8] bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-sm font-semibold">Operating date<Input type="date" value={displayedDate} disabled={busy || loading} onChange={event => setDate(event.target.value)} /></label><Button type="button" variant="outline" disabled={busy || loading || !displayedDate} onClick={() => setDate(shiftDate(displayedDate, -1))}>Previous</Button><Button type="button" variant="outline" disabled={busy || loading} onClick={() => { setDate(""); setRevision(value => value + 1); }}>Today</Button><Button type="button" variant="outline" disabled={busy || loading || !displayedDate} onClick={() => setDate(shiftDate(displayedDate, 1))}>Next</Button><Button type="button" variant="outline" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button></div>
      {calendar && <p className="text-sm text-muted-foreground">Operating window: {formatDateTime(calendar.window.startsAt)} – {formatDateTime(calendar.window.endsAt)} Manila. The window follows the configured daily anchor and may cross midnight.</p>}
    </section>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("Sign in") && <Link className="underline" href="/login?next=/admin/calendar">Sign in</Link>}</div>}
    {notice && <p role="status" className="border border-[#b8d5c6] bg-[#eef8f1] p-4 text-sm">{notice}</p>}
    <section aria-labelledby="occupancy-heading" className="space-y-3"><div><h2 id="occupancy-heading" className="text-xl font-bold text-[#16384d]">Court occupancy</h2><p className="text-sm text-muted-foreground">Bookings and blocks overlapping this operating window.</p></div>
      {loading ? <p role="status" className="p-4 text-sm text-muted-foreground">Loading calendar…</p> : calendar && (calendar.courts.length === 0 ? <p className="border border-[#dce5e8] bg-card p-5 text-sm">No courts found.</p> : <div className="grid gap-4 md:grid-cols-2">{calendar.courts.map(court => <article key={court.id} className="border border-[#dce5e8] bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h3 className="font-bold text-[#16384d]">{court.name}</h3><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{court.active ? "Active" : "Inactive"}</span></div>{court.intervals.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No occupancy in this window.</p> : <ul className="mt-4 divide-y divide-[#e4ebee]">{court.intervals.map(item => <li key={item.id} className="space-y-1 py-3 first:pt-0 last:pb-0"><p className="text-sm font-semibold">{formatDateTime(item.startsAt)} – {formatDateTime(item.endsAt)}</p><p className="text-sm capitalize">{item.kind} · {item.state.replaceAll("_", " ")}{item.kind === "booking" && item.guestName ? ` · ${item.guestName}` : ""}</p>{item.kind !== "booking" && item.reason && <p className="break-words text-sm text-muted-foreground">{item.reason}</p>}{item.kind === "booking" && item.bookingId && <Link className="inline-block text-sm font-semibold text-[#a55500] underline" href={`/admin/bookings/${encodeURIComponent(item.bookingId)}`}>View booking</Link>}{(item.kind === "maintenance" || item.kind === "private") && item.blockId && <div><Button type="button" variant="outline" size="sm" disabled={busy || loading} onClick={() => void releaseBlock(item.blockId!, court.name, item)}>Release block</Button></div>}</li>)}</ul>}</article>)}</div>)}
    </section>
    <form onSubmit={createBlock} className="space-y-4 border border-[#dce5e8] bg-card p-5 shadow-sm"><div><h2 className="text-xl font-bold text-[#16384d]">Create a block</h2><p className="mt-1 text-sm text-muted-foreground">Future blocks may be outside court hours, within the configured horizon. Use separate dates for overnight blocks.</p></div><fieldset disabled={busy || loading || !calendar} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Court<select required value={courtId} onChange={event => setCourtId(event.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Select an active court</option>{calendar?.courts.filter(court => court.active).map(court => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">Block type<select value={kind} onChange={event => setKind(event.target.value as "maintenance" | "private")} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="maintenance">Maintenance</option><option value="private">Private</option></select></label><label className="grid gap-1 text-sm font-semibold">Start date (Manila)<Input required type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Start time (Manila)<Input required type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">End date (Manila)<Input required type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">End time (Manila)<Input required type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label></div><label className="grid gap-1 text-sm font-semibold">Reason <span className="font-normal text-muted-foreground">Required, up to 500 characters</span><textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} rows={3} className="w-full rounded-md border border-input bg-transparent p-3 text-sm font-normal" /></label><Button type="submit" disabled={!courtId}>{busy ? "Saving…" : "Create block"}</Button></fieldset></form>
  </div>;
}
