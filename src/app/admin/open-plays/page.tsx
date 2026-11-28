"use client";

import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { FormSelect } from "@/components/ui/form-select";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyIcon } from "@/components/ui/empty-icon";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LoadingRows } from "@/components/admin/loading-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { manilaDateStr } from "@/lib/booking/slots";
import { openPlayTimes, savedManilaTime, timeOptions } from "./timing";
type Event = { id: string; title: string; description: string; startsAt: string; endsAt: string; fee: string | null; courtNames: string[]; courtIds: string[]; version: number; eventUrl?: string; hidden?: boolean; host?: string | null };
type Court = { id: string; name: string; active: boolean; photoVersion?: string };
const message = (status: number) => status === 400 ? "Check the event details and court hours. Events must be future and within the booking horizon." : status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Owner access is unavailable or has been revoked." : status === 404 ? "Event not found. Refresh and try again." : status === 409 ? "A selected court is already occupied at this time." : "Service unavailable. Try again later.";

export default function AdminOpenPlaysPage() {
  const confirm = useConfirm();
  const [events, setEvents] = useState<Event[] | null>(null), [courts, setCourts] = useState<Court[] | null>(null);
  const [error, setError] = useState<{ message: string; inlineOnly?: boolean } | null>(null), [loadError, setLoadError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [fee, setFee] = useState("0"), [eventUrl, setEventUrl] = useState(""), [host, setHost] = useState(""), [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; version: number } | null>(null);
  const [date, setDate] = useState(""), [startTime, setStartTime] = useState(""), [endTime, setEndTime] = useState("");
  const [initialForm, setInitialForm] = useState("");
  const dirty = JSON.stringify([title, description, fee, eventUrl, host, selected, date, startTime, endTime]) !== initialForm;
  const formDisabled = busy || !courts || !events;
  useEffect(() => {
    const controller = new AbortController();
    setEvents(null); setCourts(null); setLoadError("");
    Promise.all([fetch("/api/ethn/admin/open-plays", { cache: "no-store", signal: controller.signal }), fetch("/api/ethn/admin/courts", { cache: "no-store", signal: controller.signal })]).then(async ([plays, courtResponse]) => {
      if (!plays.ok) throw new Error(message(plays.status)); if (!courtResponse.ok) throw new Error(message(courtResponse.status));
      const [items, data] = await Promise.all([plays.json() as Promise<Event[]>, courtResponse.json() as Promise<Court[]>]);
      if (controller.signal.aborted) return;
      setEvents(items); setCourts(data.filter(court => court.active));
    }).catch(err => { if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : "Service unavailable."); });
    return () => controller.abort();
  }, [revision]);
  function beginEdit(item: Event) {
    const [day, start] = savedManilaTime(item.startsAt), [, end] = savedManilaTime(item.endsAt);
    setInitialForm(JSON.stringify([item.title, item.description, item.fee ?? "0", item.eventUrl ?? "", item.host ?? "", item.courtIds, day, start, end]));
    setEditing({ id: item.id, version: item.version }); setTitle(item.title); setDescription(item.description); setFee(item.fee ?? "0"); setEventUrl(item.eventUrl ?? ""); setHost(item.host ?? ""); setSelected(item.courtIds);
    setDate(day); setStartTime(start); setEndTime(end); setError(null);
    setOpen(true);
  }
  function resetForm() {
    const today = manilaDateStr(new Date());
    setEditing(null); setTitle(""); setDescription(""); setFee("0"); setEventUrl(""); setHost(""); setSelected([]); setDate(today); setStartTime(""); setEndTime(""); setError(null);
    setInitialForm(JSON.stringify(["", "", "0", "", "", [], today, "", ""]));
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const timing = openPlayTimes(date, startTime, endTime);
    if (!timing || !selected.length) { setError({ message: "Choose at least one court and distinct start and end times.", inlineOnly: true }); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(editing ? `/api/ethn/admin/open-plays/${encodeURIComponent(editing.id)}` : "/api/ethn/admin/open-plays", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, fee, ...timing, courtIds: selected, eventUrl, host: host.trim(), ...(editing ? { expectedVersion: editing.version } : {}) }) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        const data = response.status === 409 ? await response.json().catch(() => null) as { error?: string } | null : null;
        setError({ message: data?.error === "STALE_OPEN_PLAY" ? "This event changed since you opened it. Copy your changes before closing, then reopen the event to load the latest details." : message(response.status), inlineOnly: response.status === 400 });
        if (response.status !== 400) toast.error(editing ? "Open Play not updated." : "Open Play not created.");
        return;
      }
      toast.success(editing ? "Open Play updated." : "Open Play created. Courts reserved.");
      resetForm(); setOpen(false);
    } catch {
      setError({ message: "Could not confirm the save. Refresh the list before retrying." });
      toast.warning("Open Play save unconfirmed. Check the list before retrying.");
    }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  async function moderate(item: Event, hidden: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ethn/admin/open-plays/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden }) });
      if (!response.ok) throw new Error();
      toast.success(hidden ? "Customer listing hidden." : "Customer listing visible.");
    } catch { toast.error("Customer listing could not be updated."); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  async function remove(item: Event) {
    if (busy || !await confirm(`Remove ${item.title}? This releases its court allocations and records the removal in the audit history.`, { confirmLabel: "Remove event", destructive: true })) return;
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
  return <div className="w-full space-y-5 pb-24"><header><h1 className="text-2xl font-semibold tracking-tight">Open Plays</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Create sessions and reserve their courts. Fees are informational; this page does not manage signups or payments.</p></header>
    {!open && loadError && <p role="alert" className="border border-destructive/40 bg-destructive/5 p-4 text-sm">{loadError} Reload this page to try again.</p>}
    {!open && error && <p role={error.inlineOnly ? "alert" : undefined} className="border border-destructive/40 bg-destructive/5 p-4 text-sm">{error.message}</p>}
    <Dialog open={open} onOpenChange={(next, details) => { if (next) { resetForm(); setOpen(true); return; } if (busy) { details.cancel(); return; } if (dirty) { details.cancel(); void confirm("Discard your unsaved event details?", { confirmLabel: "Discard changes", destructive: true }).then(confirmed => { if (confirmed) { resetForm(); setOpen(false); } }); } else { resetForm(); setOpen(false); } }}>
      <DialogTrigger render={<Button disabled={busy} />}>+ Create open play</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>{editing ? "Edit open play" : "Create open play"}</DialogTitle>
        <DialogDescription className="sr-only">Create or edit an open play and reserve available courts.</DialogDescription>
        {loadError && <p role="alert" className="text-sm text-destructive">{loadError} Reload this page to try again.</p>}
        {error && <p role={error.inlineOnly ? "alert" : undefined} className="text-sm text-destructive">{error.message}</p>}
        <form id="open-play-form" onSubmit={create} className="space-y-5"><fieldset disabled={formDisabled} className="space-y-3"><legend className="text-base font-semibold">Event details</legend>
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Title<Input className="h-10" placeholder="Saturday Pickleball" required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium"><span>Host <span className="font-normal text-muted-foreground">(staff only)</span></span><Input className="h-10" placeholder="Display name" maxLength={100} value={host} onChange={e => setHost(e.target.value)} /></label></div><label className="grid gap-1.5 text-sm font-medium"><span>Description <span className="font-normal text-muted-foreground">(optional)</span></span><Textarea placeholder="Skill level, format, or what to bring" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} className="min-h-24" /></label><label className="grid gap-1.5 text-sm font-medium"><span>Reclub event link <span className="font-normal text-muted-foreground">(optional)</span></span><Input className="h-10" type="url" maxLength={256} placeholder="https://reclub.co/m/..." value={eventUrl} onChange={e => setEventUrl(e.target.value)} /></label><label className="grid max-w-xs gap-1.5 text-sm font-medium">Informational fee (₱)<Input className="h-10" placeholder="150.00" required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?" value={fee} onChange={e => setFee(e.target.value)} /></label></fieldset>
          <fieldset disabled={formDisabled} className="space-y-3"><legend className="text-base font-semibold">Schedule</legend>
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium sm:col-span-2" htmlFor="open-play-date">Date<DateField id="open-play-date" name="date" disabled={formDisabled} required value={date} onValueChange={setDate} /></label>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="open-play-start">Start time<FormSelect id="open-play-start" name="startTime" required disabled={formDisabled} value={startTime || null} placeholder="Choose start time" options={timeOptions(startTime)} onValueChange={value => { const next = value ?? ""; setStartTime(next); if (next && endTime && !openPlayTimes(date, next, endTime)) setEndTime(""); }} /></label>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="open-play-end">End time<FormSelect id="open-play-end" name="endTime" required disabled={formDisabled || !startTime} value={endTime || null} placeholder="Choose end time" options={timeOptions(endTime, startTime)} onValueChange={value => setEndTime(value ?? "")} /></label>
            </div></fieldset>
          <fieldset disabled={formDisabled} className="space-y-3"><legend className="text-base font-semibold">Courts</legend>
            <p className="text-sm text-muted-foreground">All selected courts must be open and available for the full session.</p><div className="grid gap-3 sm:grid-cols-2">{courts?.length ? courts.map(court => <label key={court.id} className="group cursor-pointer overflow-hidden rounded-xl border bg-card transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input className="sr-only" type="checkbox" checked={selected.includes(court.id)} onChange={e => setSelected(current => e.target.checked ? [...current, court.id] : current.filter(id => id !== court.id))} /><span className="block aspect-[16/7] bg-muted">{court.photoVersion && court.photoVersion !== "0" ? <img src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(court.photoVersion)}`} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-sm text-muted-foreground">No court photo</span>}</span><span className="flex items-center gap-2 p-3 text-sm font-medium">{court.name}<span className="ml-auto text-xs text-muted-foreground">{selected.includes(court.id) ? "Selected" : "Select"}</span></span></label>) : <p className="text-sm text-muted-foreground">No active courts available.</p>}</div></fieldset>
          {courts && selected.some(id => !courts.some(court => court.id === id)) && <p role="alert" className="text-sm text-destructive">An assigned court is no longer active. Cancel editing and contact staff before changing this event.</p>}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={formDisabled || selected.some(id => !courts?.some(court => court.id === id))}>{editing ? "Save changes" : "Create open play"}</Button><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose></div></form>
       </DialogContent>
     </Dialog>
    <section className="space-y-3"><h2 className="text-base font-semibold">Sessions</h2>
      {events === null ? loadError ? <p className="border bg-card p-5 text-sm">Events could not be loaded.</p> : <LoadingRows label="Loading sessions" /> : events.length === 0 ? <p className="border bg-card p-5 text-sm text-center"><EmptyIcon /> No sessions to show.</p> : <div className="grid gap-4 md:grid-cols-2">{events.map(item => <article key={item.id} className="rounded-xl border bg-card p-5 shadow-sm"><h3 className="break-words text-lg font-bold">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.courtNames.join(" · ")}</p><p className="mt-2 text-sm">{formatScheduleRange(item.startsAt, item.endsAt)}</p>{item.host && <p className="mt-2 break-words text-sm text-muted-foreground">Host: {item.host}</p>}{item.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.description}</p>}<p className="mt-2 text-sm">{item.fee === null ? <span>Customer-hosted · {item.hidden ? "Hidden" : "Visible"}</span> : <>Informational fee: ₱{item.fee}</>}</p><div className="mt-4 flex flex-wrap gap-2">{item.fee === null ? <><Button variant="outline" disabled={busy} onClick={() => void moderate(item, !item.hidden)}>{item.hidden ? "Show listing" : "Hide listing"}</Button>{item.eventUrl && <a href={item.eventUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center rounded-lg border px-2.5 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Event details</a>}</> : <>{new Date(item.startsAt) > new Date() && <Button variant="outline" disabled={busy} onClick={() => beginEdit(item)}>Edit event</Button>}<Button variant="destructive" disabled={busy} onClick={() => void remove(item)}>Remove event</Button></>}</div></article>)}</div>}</section>

  </div>;
}
