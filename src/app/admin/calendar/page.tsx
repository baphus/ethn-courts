"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EventDialog, type EventDraft } from "../event-dialog";
import { eventRange } from "../event-range";
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
  const [error, setError] = useState<{ message: string; inlineOnly?: boolean } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setCalendar(null); setLoadError("");
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    fetch(`/api/ethn/admin/calendar${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(errorMessage(response.status)); return response.json() as Promise<Calendar>; })
      .then(data => { if (!controller.signal.aborted) { setCalendar(data); if (!date) setToday(data.date); } })
      .catch(err => { if (!controller.signal.aborted) { setCalendar(null); setLoadError(err instanceof Error ? err.message : "Calendar unavailable. Try again."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, revision]);

  async function createEvent(draft: EventDraft) {
    if (busy || loading || !calendar || uncertain) return false;
    const { eventType, courtIds, kind, reason, title, description, fee } = draft;
    const range = eventRange(draft);
    if (!range || (eventType === "closure" ? !reason.trim() : !title.trim())) { setError({ message: "Enter valid event details. Check the start and end.", inlineOnly: true }); return false; }
    if (!courtIds.length || courtIds.some(id => !calendar.courts.some(court => court.active && court.id === id))) { setError({ message: "Select at least one active court.", inlineOnly: true }); return false; }
    setBusy(true); setError(null);
    try {
      const body = eventType === "closure" ? { courtIds, ...range, reason: reason.trim(), kind } : { courtIds, ...range, title: title.trim(), description: description.trim(), fee };
      const response = await fetch(eventType === "closure" ? "/api/ethn/admin/blocks" : "/api/ethn/admin/open-plays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        setError({ message: errorMessage(response.status), inlineOnly: response.status === 400 });
        if (response.status !== 400) toast.error(eventType === "closure" ? "Court closure not created." : "Open Play not created.");
        return false;
      }
      toast.success(eventType === "closure" ? "Court closure created." : "Open Play created.");
      return true;
    } catch {
      setUncertain(true);
      setError({ message: "Could not confirm whether the event was created. Refresh the calendar before retrying." });
      toast.warning("Event creation unconfirmed. Check the calendar before retrying.");
      return false;
    }
    finally { setBusy(false); setRevision(value => value + 1); }
  }

  async function releaseBlock(blockId: string, courtName: string, interval: Interval) {
    if (busy || loading || !window.confirm(`Release this ${interval.kind} block on ${courtName}?\n${formatDateTime(interval.startsAt)} – ${formatDateTime(interval.endsAt)}`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/ethn/admin/blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        setError({ message: errorMessage(response.status) });
        toast.error("Court block not released.");
        return;
      }
      toast.success("Court block released.");
    } catch {
      setError({ message: "Could not confirm whether the block was released. Refresh the calendar before retrying." });
      toast.warning("Block release unconfirmed. Check the calendar before retrying.");
    }
    finally { setBusy(false); setRevision(value => value + 1); }
  }

  const displayedDate = calendar?.date ?? date;
  return <div className="w-full space-y-5 pb-24">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Court calendar</h1><p className="mt-1 text-sm text-muted-foreground">View occupancy and create closures or Open Plays.</p></div>
      <EventDialog
        initialDate={calendar?.date ?? date}
        courts={calendar?.courts ?? []}
        disabled={loading || !calendar}
        busy={busy}
        blocked={uncertain}
        onOpenChange={open => {
          setBlockOpen(open);
          if (open && !uncertain) setError(null);
        }}
        onSubmit={createEvent}
        notice={<>
          {loadError && <div role="alert" className="text-sm text-destructive">{loadError} {loadError.includes("Sign in") && <Link className="underline" href="/login?next=/admin/calendar">Sign in</Link>}</div>}
          {error && <div role={error.inlineOnly ? "alert" : undefined} className="text-sm text-destructive">{error.message} {error.message.includes("Sign in") && <Link className="underline" href="/login?next=/admin/calendar">Sign in</Link>}</div>}
          {uncertain && <div className="space-y-2 rounded-md border p-3 text-sm"><p>Close this form and check the calendar once it loads before deciding whether to try again. Your entries will remain on this page.</p><Button type="button" variant="outline" disabled={loading || !calendar} onClick={() => setUncertain(false)}>I checked the calendar</Button></div>}
        </>}
      />
    </header>
    {!blockOpen && loadError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{loadError} {loadError.includes("Sign in") && <Link className="underline" href="/login?next=/admin/calendar">Sign in</Link>}</div>}
    {!blockOpen && error && <div role={error.inlineOnly ? "alert" : undefined} className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error.message} {error.message.includes("Sign in") && <Link className="underline" href="/login?next=/admin/calendar">Sign in</Link>}</div>}
    {displayedDate && <CalendarLayout date={displayedDate} today={today} revision={revision} busy={busy} onDate={setDate} onToday={() => { setDate(""); setRevision(value => value + 1); }} onRelease={(id, court, interval) => void releaseBlock(id, court, interval)} />}
  </div>;
}
