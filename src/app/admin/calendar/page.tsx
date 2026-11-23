"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toIso } from "./date-utils";
import CalendarLayout from "./calendar-layout";

type Interval = { id: string; startsAt: string; endsAt: string; state: string; kind: "booking" | "maintenance" | "private" | "open_play"; bookingId: string | null; guestName: string | null; blockId: string | null; reason: string | null };
type Calendar = { date: string; serverNow: string; window: { startsAt: string; endsAt: string }; courts: { id: string; name: string; active: boolean; intervals: Interval[] }[] };

const formatDateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const errorMessage = (status: number) => status === 400 ? "Check event details, selected courts and times. Events must start in the future within the configured horizon. Open Play must fit every selected court's opening hours." : status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "The court or block was not found. Refresh the calendar and try again." : status === 409 ? "This time overlaps another allocation. Refresh the calendar and choose another time." : status === 503 ? "Calendar service is unavailable. Try again later." : "Something went wrong. Refresh the calendar and try again.";

export default function CalendarPage() {
  const [date, setDate] = useState("");
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [courtIds, setCourtIds] = useState<string[]>([]);
  const [eventType, setEventType] = useState<"closure" | "open_play">("closure");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState("0");
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
      .then(data => { setCalendar(data); if (!date) setToday(data.date); setCourtIds(current => current.filter(id => data.courts.some(court => court.active && court.id === id))); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Calendar unavailable. Try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, revision]);

  async function createBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || !calendar || uncertain) return;
    const startsAt = toIso(startDate, startTime), endsAt = toIso(endDate, endTime);
    if (!startsAt || !endsAt || endsAt <= startsAt || (eventType === "closure" ? !reason.trim() : !title.trim())) { setError("Enter valid event details. End must be after start."); return; }
    if (!courtIds.length || courtIds.some(id => !calendar.courts.some(court => court.active && court.id === id))) { setError("Select at least one active court."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const body = eventType === "closure" ? { courtIds, startsAt, endsAt, reason: reason.trim(), kind } : { courtIds, startsAt, endsAt, title: title.trim(), description: description.trim(), fee };
      const response = await fetch(eventType === "closure" ? "/api/ethn/admin/blocks" : "/api/ethn/admin/open-plays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { if (response.status >= 500) setUncertain(true); setError(response.status >= 500 ? "Could not confirm whether the event was created. Refresh the calendar before retrying." : errorMessage(response.status)); return; }
      setReason(""); setTitle(""); setDescription(""); setFee("0"); setCourtIds([]); setKind("maintenance"); setEventType("closure"); setStartDate(""); setEndDate(""); setStartTime(""); setEndTime(""); setDiscard(false); setBlockOpen(false); setNotice("Event created. Calendar refreshed.");
    } catch { setUncertain(true); setError("Could not confirm whether the event was created. Refresh the calendar before retrying."); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }

  async function releaseBlock(blockId: string, courtName: string, interval: Interval) {
    if (busy || loading || !window.confirm(`Release this ${interval.kind} block on ${courtName}?\n${formatDateTime(interval.startsAt)} – ${formatDateTime(interval.endsAt)}`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/ethn/admin/blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" });
      if (!response.ok) { setError(response.status >= 500 ? "Could not confirm whether the block was released. Refresh the calendar." : errorMessage(response.status)); return; }
      setNotice("Block released. Calendar refreshed.");
    } catch { setError("Could not confirm whether the block was released. Refresh the calendar."); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }

  const displayedDate = calendar?.date ?? date;
  return <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Court calendar</h1><p className="mt-1 text-sm text-muted-foreground">View occupancy and create closures or Open Plays.</p></div>
      <Dialog open={blockOpen} onOpenChange={open => { if (open) { setError(""); if (!reason && !title && !description && !startTime && !endTime && !courtIds.length && fee === "0" && !uncertain) { setStartDate(calendar?.date ?? date); setEndDate(calendar?.date ?? date); } setBlockOpen(true); } else if (!busy) { if (reason || title || description || startTime || endTime || courtIds.length || fee !== "0") setDiscard(true); else setBlockOpen(false); } }}>
        <DialogTrigger render={<Button disabled={loading || busy || !calendar} />}>+ Create event</DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>Create event</DialogTitle><DialogDescription>Reserve courts for a closure or an Open Play.</DialogDescription>
          {error && <div role="alert" className="text-sm text-destructive">{error} {error.includes("Sign in") && <Link className="underline" href="/login?next=/admin/calendar">Sign in</Link>}</div>}
          {uncertain && <div className="space-y-2 rounded-md border p-3 text-sm"><p>Close this form and check the refreshed calendar before deciding whether to try again. Your entries will remain on this page.</p><Button type="button" variant="outline" disabled={loading || !calendar} onClick={() => setUncertain(false)}>I checked the calendar</Button></div>}
          {discard && <div role="alert" className="space-y-2 rounded-md border p-3"><p>Close this form? Your entries will remain available until you leave this page.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button type="button" onClick={() => { setDiscard(false); setBlockOpen(false); }}>Close form</Button></div></div>}
          <form onSubmit={createBlock} className="space-y-4">
            <fieldset disabled={busy || loading || !calendar || uncertain} className="space-y-4">
              <label htmlFor="event-type" className="grid gap-1 text-sm font-semibold">Event type<select id="event-type" value={eventType} onChange={event => setEventType(event.target.value as "closure" | "open_play")} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="closure">Closure</option><option value="open_play">Open Play</option></select></label>
              <fieldset className="space-y-2" aria-describedby="courts-hint"><legend className="text-sm font-semibold">Courts</legend><p id="courts-hint" className="text-sm text-muted-foreground">Select one or more active courts. A conflict on any court prevents the event from being created.</p><div className="flex flex-wrap gap-x-5 gap-y-2">{calendar?.courts.filter(court => court.active).map(court => <label key={court.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={courtIds.includes(court.id)} onChange={event => setCourtIds(current => event.target.checked ? [...current, court.id] : current.filter(id => id !== court.id))} />{court.name}</label>)}</div></fieldset>
              {eventType === "closure" ? <><label htmlFor="closure-kind" className="grid gap-1 text-sm font-semibold">Closure type<select id="closure-kind" value={kind} onChange={event => setKind(event.target.value as "maintenance" | "private")} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="maintenance">Maintenance</option><option value="private">Private</option></select></label><label htmlFor="event-reason" className="grid gap-1 text-sm font-semibold">Reason <span id="reason-hint" className="font-normal text-muted-foreground">Required, up to 500 characters</span><textarea id="event-reason" aria-describedby="reason-hint" required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="min-h-20 rounded-md border border-input bg-transparent p-3 text-sm" /></label></> : <><label htmlFor="event-title" className="grid gap-1 text-sm font-semibold">Title<Input id="event-title" required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label><label htmlFor="event-description" className="grid gap-1 text-sm font-semibold">Description <span id="description-hint" className="font-normal text-muted-foreground">Optional, up to 2,000 characters</span><textarea id="event-description" aria-describedby="description-hint" maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} className="min-h-20 rounded-md border border-input bg-transparent p-3 text-sm" /></label><label htmlFor="event-fee" className="grid gap-1 text-sm font-semibold">Fee (PHP) <span id="fee-hint" className="font-normal text-muted-foreground">Informational only. No registration or payment is collected.</span><Input id="event-fee" aria-describedby="fee-hint" required type="number" min="0" step="0.01" value={fee} onChange={event => setFee(event.target.value)} /></label></>}
              <p id="time-hint" className="text-sm text-muted-foreground">Times are in Manila. Use separate dates for overnight events.</p>
              <div className="grid gap-4 sm:grid-cols-2"><label htmlFor="event-start-date" className="grid gap-1 text-sm font-semibold">Start date<Input id="event-start-date" aria-describedby="time-hint" required type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label><label htmlFor="event-start-time" className="grid gap-1 text-sm font-semibold">Start time<Input id="event-start-time" aria-describedby="time-hint" required type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label><label htmlFor="event-end-date" className="grid gap-1 text-sm font-semibold">End date<Input id="event-end-date" aria-describedby="time-hint" required type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label><label htmlFor="event-end-time" className="grid gap-1 text-sm font-semibold">End time<Input id="event-end-time" aria-describedby="time-hint" required type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label></div>
              <Button type="submit">{busy ? "Creating…" : "Create event"}</Button>
            </fieldset>
            <Button type="button" variant="outline" disabled={busy} onClick={() => { if (reason || title || description || startTime || endTime || courtIds.length || fee !== "0") setDiscard(true); else setBlockOpen(false); }}>Cancel</Button>
          </form>
        </DialogContent>
      </Dialog>
    </header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("Sign in") && <Link className="underline" href="/login?next=/admin/calendar">Sign in</Link>}</div>}
    {notice && <p role="status" className="border border-[#b8d5c6] bg-[#eef8f1] p-4 text-sm">{notice}</p>}
    {!displayedDate && !loading && <Button variant="outline" onClick={() => setRevision(value => value + 1)}>Refresh</Button>}
    {displayedDate && <CalendarLayout date={displayedDate} today={today} revision={revision} busy={busy} onDate={setDate} onToday={() => { setDate(""); setRevision(value => value + 1); }} onRefresh={() => setRevision(value => value + 1)} onRelease={(id, court, interval) => void releaseBlock(id, court, interval)} />}
  </div>;
}
