"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingRows } from "@/components/admin/loading-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { manilaDateStr } from '@/lib/booking/slots';
type Event = { id: string; title: string; description: string; startsAt: string; endsAt: string; fee: string; courtNames: string[]; courtIds: string[]; version: number };
type Court = { id: string; name: string; active: boolean };
const toIso = (date: string, time: string) => { const value = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`); return Number.isFinite(value.getTime()) ? value.toISOString() : null; };
const manilaParts = (value: string) => { const instant=new Date(value); return [manilaDateStr(instant), new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:false}).format(instant)] as const; };
const format = (date: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
const message = (status: number) => status === 400 ? "Check the event details and court hours. Events must be future and within the booking horizon." : status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "Event not found. Refresh and try again." : status === 409 ? "A selected court is already occupied at this time." : "Service unavailable. Try again later.";

export default function AdminOpenPlaysPage() {
  const [events, setEvents] = useState<Event[] | null>(null), [courts, setCourts] = useState<Court[] | null>(null);
  const [error, setError] = useState<{ message: string; inlineOnly?: boolean } | null>(null), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [fee, setFee] = useState("0"), [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; version: number } | null>(null);
  const [startDate, setStartDate] = useState(""), [startTime, setStartTime] = useState(""), [endDate, setEndDate] = useState(""), [endTime, setEndTime] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setEvents(null); setCourts(null); setLoadError("");
    Promise.all([fetch("/api/ethn/admin/open-plays", { cache: "no-store", signal: controller.signal }), fetch("/api/ethn/admin/calendar", { cache: "no-store", signal: controller.signal })]).then(async ([plays, calendar]) => {
      if (!plays.ok) throw new Error(message(plays.status)); if (!calendar.ok) throw new Error(message(calendar.status));
      const [items, data] = await Promise.all([plays.json() as Promise<Event[]>, calendar.json() as Promise<{ courts: Court[]; date: string }>]);
      if (controller.signal.aborted) return;
      setEvents(items); setCourts(data.courts.filter(court => court.active)); setStartDate(current => current || data.date); setEndDate(current => current || data.date);
    }).catch(err => { if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Service unavailable."); });
    return () => controller.abort();
  }, [revision]);
  function beginEdit(item: Event) {
    const [startDateValue, startTimeValue] = manilaParts(item.startsAt), [endDateValue, endTimeValue] = manilaParts(item.endsAt);
    setEditing({ id: item.id, version: item.version }); setTitle(item.title); setDescription(item.description); setFee(item.fee); setSelected(item.courtIds);
    setStartDate(startDateValue); setStartTime(startTimeValue); setEndDate(endDateValue); setEndTime(endTimeValue); setError(null);
    setOpen(true);
  }
  function cancelEdit() { setEditing(null); setTitle(""); setDescription(""); setFee("0"); setSelected([]); setStartTime(""); setEndTime(""); }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const startsAt = toIso(startDate, startTime), endsAt = toIso(endDate, endTime);
    if (!startsAt || !endsAt || endsAt <= startsAt || !selected.length) { setError({ message: "Choose at least one court and a valid start and end time.", inlineOnly: true }); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(editing ? `/api/ethn/admin/open-plays/${encodeURIComponent(editing.id)}` : "/api/ethn/admin/open-plays", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, fee, startsAt, endsAt, courtIds: selected, ...(editing ? { expectedVersion: editing.version } : {}) }) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        const data = response.status === 409 ? await response.json().catch(() => null) as { error?: string } | null : null;
        setError({ message: data?.error === "STALE_OPEN_PLAY" ? "This event changed since you opened it. Your entries are preserved. Check the list and select Edit to reload the latest details." : message(response.status), inlineOnly: response.status === 400 });
        if (response.status !== 400) toast.error(editing ? "Open Play not updated." : "Open Play not created.");
        return;
      }
      toast.success(editing ? "Open Play updated." : "Open Play created. Courts reserved.");
      cancelEdit(); setOpen(false);
    } catch {
      setError({ message: "Could not confirm the save. Refresh the list before retrying." });
      toast.warning("Open Play save unconfirmed. Check the list before retrying.");
    }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  async function remove(item: Event) {
    if (busy || !window.confirm(`Remove ${item.title}? This releases its court allocations and records the removal in the audit history.`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/ethn/admin/open-plays/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        setError({ message: message(response.status) });
        toast.error("Open Play not removed.");
        return;
      }
      toast.success("Open Play removed. Courts released.");
    } catch {
      setError({ message: "Could not confirm removal. Refresh the list before retrying." });
      toast.warning("Open Play removal unconfirmed. Check the list before retrying.");
    }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  return <div className="mx-auto w-full max-w-5xl space-y-6 pb-12"><header><h1 className="text-2xl font-semibold tracking-tight">Open Plays</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Create sessions and reserve their courts. Fees are informational; this page does not manage signups or payments.</p></header>
    {!open && loadError && <p role="alert" className="border border-destructive/40 bg-destructive/5 p-4 text-sm">{loadError} Reload this page to try again.</p>}
    {!open && error && <p role={error.inlineOnly ? "alert" : undefined} className="border border-destructive/40 bg-destructive/5 p-4 text-sm">{error.message}</p>}
    <Dialog open={open} onOpenChange={next => { if (next) setOpen(true); else if (!busy && (!(title || description || startTime || endTime || selected.length) || window.confirm("Close this form? Your entries will remain until you leave this page."))) setOpen(false); }}>
      <DialogTrigger render={<Button disabled={busy} />}>{editing ? 'Resume event draft' : '+ Create event'}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>{editing ? "Edit open play" : "Create open play"}</DialogTitle>
        <DialogDescription>Reserve available courts for this session.</DialogDescription>
        {loadError && <p role="alert" className="text-sm text-destructive">{loadError} Reload this page to try again.</p>}
        {error && <p role={error.inlineOnly ? "alert" : undefined} className="text-sm text-destructive">{error.message}</p>}
        <form id="open-play-form" onSubmit={create} className="space-y-4 border border-[#dce5e8] bg-card p-5 shadow-sm"><div><h2 className="text-xl font-bold text-[#447244]">{editing ? "Edit open play" : "Create an open play"}</h2><p className="mt-1 text-sm text-muted-foreground">Use separate dates for overnight events. All selected courts must be open and available for the entire session.</p></div><fieldset disabled={busy || !courts || !events} className="space-y-4"><label className="grid gap-1 text-sm font-semibold">Title<Input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Description <span className="font-normal text-muted-foreground">Optional</span><textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} className="min-h-24 rounded-md border border-input bg-transparent p-3" /></label><label className="grid max-w-xs gap-1 text-sm font-semibold">Informational fee (₱)<Input required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?" value={fee} onChange={e => setFee(e.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Start date<Input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Start time<Input required type="time" step="0.001" value={startTime} onChange={e => setStartTime(e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">End date<Input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">End time<Input required type="time" step="0.001" value={endTime} onChange={e => setEndTime(e.target.value)} /></label></div><fieldset><legend className="text-sm font-semibold">Active courts</legend><div className="mt-2 flex flex-wrap gap-4">{courts?.length ? courts.map(court => <label key={court.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(court.id)} onChange={e => setSelected(current => e.target.checked ? [...current, court.id] : current.filter(id => id !== court.id))} />{court.name}</label>) : <p className="text-sm text-muted-foreground">No active courts available.</p>}</div></fieldset>{selected.some(id => !courts?.some(court => court.id === id)) && <p role="alert" className="text-sm text-destructive">An assigned court is no longer active. Cancel editing and contact staff before changing this event.</p>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={!selected.length || selected.some(id => !courts?.some(court => court.id === id))}>{editing ? "Save changes" : "Create open play"}</Button>{editing && <Button type="button" variant="outline" onClick={cancelEdit}>Cancel editing</Button>}</div></fieldset></form></DialogContent></Dialog>
    <section className="space-y-3"><h2 className="text-xl font-bold text-[#447244]">Sessions</h2>
      {events === null ? loadError ? <p className="border bg-card p-5 text-sm">Events could not be loaded.</p> : <LoadingRows label="Loading sessions" /> : events.length === 0 ? <p className="border bg-card p-5 text-sm text-center"><EmptyIcon /> No sessions to show.</p> : <div className="grid gap-4 md:grid-cols-2">{events.map(item => <article key={item.id} className="border border-[#dce5e8] bg-card p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-[#a55500]">{item.courtNames.join(" · ")}</p><h3 className="mt-2 break-words text-lg font-bold">{item.title}</h3><p className="mt-2 text-sm">{format(item.startsAt)} – {format(item.endsAt)}</p>{item.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.description}</p>}<p className="mt-2 text-sm">Informational fee: ₱{item.fee}</p><div className="mt-4 flex flex-wrap gap-2">{new Date(item.startsAt) > new Date() && <Button variant="outline" disabled={busy} onClick={() => { if (editing && !window.confirm("Replace the current form entries with this event?")) return; beginEdit(item); }}>Edit event</Button>}<Button variant="outline" disabled={busy} onClick={() => void remove(item)}>Remove event</Button></div></article>)}</div>}</section>

  </div>;
}
