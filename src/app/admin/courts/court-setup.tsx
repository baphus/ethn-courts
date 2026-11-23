"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type Snapshot } from "../settings/pricing-payload";
import { schedulePayload } from "./schedule-payload";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const scheduleEndpoint = "/api/ethn/admin/hours";
const courtsEndpoint = "/api/ethn/admin/courts";
const blocksEndpoint = "/api/ethn/admin/blocks";

type Court = Snapshot["courts"][number];
type CourtDetails = { id: string; name: string; description: string; active: boolean; version: string; photoVersion: string; previousSettingsVersion?: string; settingsVersion?: string };
type HourWindow = Court["hours"][number];
type Block = { id: string; courtName: string; startsAt: string; endsAt: string; kind: string; reason: string };
type NewCourt = { name: string; description: string; idempotencyKey: string };
type DraftWindow = { weekday: number; opens: string; closes: string; hourlyRate: string };

const hhmm = (value: string) => value.slice(0, 5);
const scheduleOf = (data: Snapshot) => data.courts.map(court => ({ id: court.id, active: court.active, hours: court.hours.map(h => ({ weekday: h.weekday, opens: hhmm(h.opens), closes: hhmm(h.closes), hourlyRate: h.hourlyRate ?? "" })) }));
const stamp = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const kindLabel = (kind: string) => kind === "open_play" ? "Open Play" : kind === "private" ? "Private use" : "Maintenance";
const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled. You cannot save these changes." : status === 400 ? "Some values are invalid. Check the days, times and rates, then try again." : status === 409 ? "Settings changed elsewhere or a court name conflicts. Reload before saving; unsaved changes will be lost." : "Settings are unavailable. Please try again later.";

export default function CourtSetup() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [originalSchedule, setOriginalSchedule] = useState("");
  const [busy, setBusy] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [blocksError, setBlocksError] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newCourt, setNewCourt] = useState({ name: "", description: "" });
  const [pendingCourt, setPendingCourt] = useState<NewCourt | null>(null);
  const [details, setDetails] = useState<CourtDetails[] | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [editing, setEditing] = useState<CourtDetails | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [detailsStale, setDetailsStale] = useState(false);
  const [windowCourt, setWindowCourt] = useState<Court | null>(null);
  const [draftWindow, setDraftWindow] = useState<DraftWindow>({ weekday: 1, opens: "07:00", closes: "20:00", hourlyRate: "" });
  const [quickCourt, setQuickCourt] = useState<Court | null>(null);
  const [quick, setQuick] = useState({ opens: "07:00", closes: "20:00", hourlyRate: "", weekdays: [0, 1, 2, 3, 4, 5, 6] });

  const dirty = data !== null && originalSchedule !== "" && JSON.stringify(scheduleOf(data)) !== originalSchedule;

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(scheduleEndpoint, { cache: "no-store" });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setData(null); return; }
      const snapshot: Snapshot = await response.json();
      setData(snapshot); setOriginalSchedule(JSON.stringify(scheduleOf(snapshot))); setStale(false);
    } catch { setError(message(503)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadDetails = useCallback(async () => {
    setDetailsError("");
    try {
      const response = await fetch(courtsEndpoint, { cache: "no-store" });
      if (!response.ok) { if (response.status === 401 || response.status === 403) setDetails(null); setDetailsError(message(response.status)); return; }
      setDetails(await response.json());
    } catch { setDetailsError("Court details could not be loaded. Try again."); }
  }, []);
  useEffect(() => { void loadDetails(); }, [loadDetails]);

  const loadBlocks = useCallback(async () => {
    setBlocksError(false);
    try {
      const response = await fetch(blocksEndpoint, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const rows: unknown = await response.json();
      setBlocks(Array.isArray(rows) ? rows as Block[] : []);
    } catch { setBlocks([]); setBlocksError(true); }
  }, []);
  useEffect(() => { void loadBlocks(); }, [loadBlocks]);

  function updateCourt(courtId: string, change: (court: Court) => Court) {
    setData(prev => prev && { ...prev, courts: prev.courts.map(court => court.id === courtId ? change(court) : court) });
  }
  function updateWindow(courtId: string, index: number, patch: Partial<HourWindow>) {
    updateCourt(courtId, court => ({ ...court, hours: court.hours.map((hour, i) => i === index ? { ...hour, ...patch } : hour) }));
  }
  function confirmDiscard(action: string) {
    return !dirty || window.confirm(`${action} reloads page data and discards your unsaved schedule edits. Continue?`);
  }

  async function saveSchedule() {
    if (!data || busy || !dirty || stale) return;
    if (!window.confirm("Save this weekly schedule? Windows that conflict with existing bookings or holds are rejected. No booking is cancelled.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(scheduleEndpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(schedulePayload(data)) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status === 409 && result.error === "HOURS_CONFLICT") setError("These changes conflict with an existing booking or hold. Your edits are preserved; no booking was cancelled.");
        else if (response.status === 409) { setStale(true); setError("The schedule changed elsewhere. Reload before saving; your edits are preserved until you reload."); }
        else { setError(message(response.status)); if (response.status === 401 || response.status === 403) setData(null); }
        return;
      }
      setNotice("Schedule saved.");
      await load();
    } catch { setStale(true); setError("Could not confirm whether the schedule was saved. Reload before trying again; your edits are preserved until you reload."); }
    finally { setBusy(false); }
  }

  async function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !editing || detailsStale || !editName.trim()) return;
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
      setDialogError("Choose a JPEG, PNG or WebP image no larger than 5 MiB."); return;
    }
    setBusy(true); setDialogError("");
    const form = new FormData();
    form.set("name", editName.trim()); form.set("description", editDescription.trim()); form.set("version", editing.version);
    if (photo) form.set("photo", photo);
    try {
      const response = await fetch(`${courtsEndpoint}/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: form });
      if (!response.ok) {
        if (response.status === 409) { setDetailsStale(true); setDialogError("Court details changed elsewhere or the name is in use. Your edits are preserved. Copy them before closing and reload details."); }
        else setDialogError(message(response.status));
        return;
      }
      const updated: CourtDetails = await response.json();
      setDetails(prev => prev?.map(court => court.id === updated.id ? updated : court) ?? [updated]);
      setData(prev => prev && { ...prev, version: prev.version === updated.previousSettingsVersion && updated.settingsVersion ? updated.settingsVersion : prev.version, courts: prev.courts.map(court => court.id === updated.id ? { ...court, name: updated.name } : court) });
      setEditing(null); setPhoto(null); setNotice("Court details saved. Your schedule edits are unchanged.");
    } catch { setDetailsStale(true); setDialogError("Could not confirm whether details were saved. Your edits are preserved; copy them before closing and reload details."); }
    finally { setBusy(false); }
  }

  async function createCourt(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!confirmDiscard("Creating a court")) return;
    const payload = pendingCourt ?? { name: newCourt.name.trim(), description: newCourt.description.trim(), idempotencyKey: crypto.randomUUID() };
    setBusy(true); setDialogError(""); setNotice("");
    try {
      const response = await fetch(courtsEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const code = result && typeof result === "object" && "error" in result ? (result as { error: unknown }).error : null;
        if (response.status === 409 && code === "NAME_COLLISION") { setPendingCourt(null); setDialogError("A court with this name already exists. Choose another name."); }
        else if (response.status === 409 && code === "IDEMPOTENCY_MISMATCH") { setPendingCourt(payload); setDialogError("This request key was already used with different details. Do not create another request; contact support."); }
        else if (pendingCourt) { setPendingCourt(payload); setDialogError("Retry was not accepted. Sign in with the same owner account, then retry this exact request."); }
        else setDialogError(response.status === 401 ? "Your session ended. Sign in and try again." : response.status === 403 ? "Owner access is required." : "Could not create the court. Check the name and try again.");
        return;
      }
      const created = await response.json().catch(() => null) as { name?: unknown } | null;
      setPendingCourt(null); setNewCourt({ name: "", description: "" }); setAddOpen(false);
      setNotice(`${typeof created?.name === "string" ? created.name : "Court"} created inactive. Add a window with a rate, mark it active, then save the schedule.`);
      await Promise.all([load(), loadDetails()]);
    } catch {
      setPendingCourt(payload);
      setDialogError("Could not confirm whether the court was created. Retry this exact request with the same owner account; do not create another.");
    } finally { setBusy(false); }
  }

  function addWindow(event: React.FormEvent) {
    event.preventDefault();
    if (!windowCourt) return;
    updateCourt(windowCourt.id, court => ({ ...court, hours: [...court.hours, { id: "", weekday: draftWindow.weekday, opens: draftWindow.opens, closes: draftWindow.closes, hourlyRate: draftWindow.hourlyRate.trim() || null }] }));
    setWindowCourt(null);
    setDraftWindow({ weekday: 1, opens: "07:00", closes: "20:00", hourlyRate: "" });
  }

  function applyQuickSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!quickCourt || quick.weekdays.length === 0) return;
    const weekdays = [...quick.weekdays].sort((a, b) => a - b);
    updateCourt(quickCourt.id, court => ({
      ...court,
      hours: [
        ...court.hours.filter(hour => !weekdays.includes(hour.weekday)),
        ...weekdays.map(weekday => ({ id: "", weekday, opens: quick.opens, closes: quick.closes, hourlyRate: quick.hourlyRate.trim() || null })),
      ].sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens)),
    }));
    setQuickCourt(null);
  }

  return <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Court setup</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Each court, the weekly windows it opens, and the hourly rate charged in every window. Changes apply to new checkouts only; existing bookings keep the price they were made with.</p>
      </div>
      <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); setDialogError(""); if (!open) { setNewCourt({ name: "", description: "" }); setPendingCourt(null); } }}>
        <DialogTrigger render={<Button disabled={busy} />}>Add court</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Add court</DialogTitle>
          <DialogDescription>A new court starts inactive. Add a window with a rate, mark it active, then save the schedule.</DialogDescription>
          <form onSubmit={createCourt} className="space-y-4">
            <label className="grid gap-1 text-sm font-medium">Court name<Input required maxLength={100} value={newCourt.name} onChange={e => setNewCourt({ ...newCourt, name: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Description <span className="font-normal text-muted-foreground">Optional, shown on public pages</span><textarea rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-transparent p-3 text-sm font-normal" value={newCourt.description} onChange={e => setNewCourt({ ...newCourt, description: e.target.value })} /></label>
            {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create court"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setAddOpen(false)}>Cancel</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </header>

    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <Link className="underline" href="/login?next=/admin/courts">Sign in</Link>}</div>}
    {notice && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</p>}
    {detailsError && <div role="alert" className="rounded-lg border p-4 text-sm">{detailsError} <button type="button" className="underline" onClick={() => void loadDetails()}>Reload court details</button></div>}
    {!data && <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Try again"}</Button>}

    {data && <>
      {data.courts.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground text-center"><EmptyIcon /> No courts yet. Add one to configure windows and rates.</p>}
      {data.courts.map((court, ci) => <section key={court.id} className="overflow-hidden rounded-xl border bg-card">
        <div className="grid border-b sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="relative min-h-36 overflow-hidden bg-muted">
            {details?.find(item => item.id === court.id)?.photoVersion && details.find(item => item.id === court.id)?.photoVersion !== "0" ? <img className="absolute inset-0 h-full w-full object-cover" src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(details.find(item => item.id === court.id)!.photoVersion)}`} alt={`${court.name} court`} /> : <div className="flex h-full min-h-36 items-center justify-center text-sm text-muted-foreground">No court photo</div>}
          </div>
          <div className="flex flex-col justify-between gap-4 p-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{court.name}</h2><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{court.active ? "Active" : "Inactive"}</span></div>
              <p className="break-words text-sm text-muted-foreground">{details?.find(item => item.id === court.id)?.description || (details ? "No description yet." : "Loading court details…")}</p>
              <p className="text-sm font-medium">{court.hours.length === 0 ? "Closed all week" : `${court.hours.length} weekly ${court.hours.length === 1 ? "window" : "windows"}`} <span className="font-normal text-muted-foreground">· {court.active ? "Bookable" : "Bookings blocked"}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={court.active} onChange={e => { const active = e.target.checked; updateCourt(court.id, c => ({ ...c, active })); }} /> Active</label>
            <Button type="button" variant="outline" size="sm" disabled={busy || !details?.some(item => item.id === court.id)} onClick={() => { const item = details?.find(item => item.id === court.id); if (!item) return; setDialogError(""); setDetailsStale(false); setEditName(item.name); setEditDescription(item.description); setPhoto(null); setEditing(item); }}>Edit details & photo</Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setWindowCourt(court); setDraftWindow({ weekday: 1, opens: "07:00", closes: "20:00", hourlyRate: "" }); }}>Add window</Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setQuickCourt(court); setQuick({ opens: "07:00", closes: "20:00", hourlyRate: "", weekdays: [0, 1, 2, 3, 4, 5, 6] }); }}>Quick setup</Button>
            </div>
          </div>
        </div>
        <div className="divide-y">
          {court.hours.length === 0
            ? <p className="p-4 text-sm text-muted-foreground">No windows. This court cannot be booked until a window with a rate is saved.</p>
            : court.hours.map((hour, hi) => <div key={`${court.id}-${ci}-${hi}`} className="space-y-2 p-4">
              <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.8fr))_auto]">
                <label className="grid gap-1 text-sm font-medium"><span className="text-muted-foreground">Day</span><select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={hour.weekday} onChange={e => updateWindow(court.id, hi, { weekday: Number(e.target.value) })}>{days.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
                <label className="grid gap-1 text-sm font-medium"><span className="text-muted-foreground">Opens</span><Input type="time" required value={hhmm(hour.opens)} onChange={e => updateWindow(court.id, hi, { opens: e.target.value })} /></label>
                <label className="grid gap-1 text-sm font-medium"><span className="text-muted-foreground">Closes</span><Input type="time" required value={hhmm(hour.closes)} onChange={e => updateWindow(court.id, hi, { closes: e.target.value })} /></label>
                <label className="grid gap-1 text-sm font-medium"><span className="text-muted-foreground">₱ per hour</span><Input inputMode="decimal" placeholder="Checkout disabled" value={hour.hourlyRate ?? ""} onChange={e => updateWindow(court.id, hi, { hourlyRate: e.target.value })} /></label>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => updateCourt(court.id, c => ({ ...c, hours: c.hours.filter((_, i) => i !== hi) }))}>Remove</Button>
              </div>
              {hhmm(hour.opens) && hhmm(hour.closes) && hhmm(hour.closes) <= hhmm(hour.opens) && <p className="text-sm text-muted-foreground">Closes next day{hhmm(hour.closes) === hhmm(hour.opens) ? " · 24-hour window" : ""}.</p>}
            </div>)}
        </div>
      </section>)}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <Button disabled={!dirty || stale || busy} onClick={() => void saveSchedule()}>{busy ? "Saving…" : "Save schedule"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => { if (!dirty || window.confirm("Reload the schedule and discard your unsaved changes?")) void load(); }}>Reload</Button>
        {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
      </div>
      {stale && <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm("Reload the schedule and discard your unsaved changes?")) void load(); }}>Reload schedule</Button>}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div><h2 className="font-semibold">Upcoming closures</h2><p className="text-sm text-muted-foreground">Maintenance, private use and Open Plays that stop bookings. Create and release them on the calendar.</p></div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/calendar" />}>Open calendar</Button>
        </div>
        <div className="p-4 text-sm">
          {blocks === null ? <LoadingAnimation label="Loading closures" className="py-4" /> : blocksError ? <p className="text-muted-foreground">Closures could not be loaded. <button type="button" className="underline" onClick={() => void loadBlocks()}>Try again</button></p> : blocks.length === 0 ? <p className="text-muted-foreground text-center"><EmptyIcon /> No upcoming closures.</p> : <ul className="divide-y">{blocks.map(block => <li key={block.id} className="space-y-1 py-3 first:pt-0 last:pb-0"><p className="font-medium">{block.courtName} · {kindLabel(block.kind)}</p><p className="text-muted-foreground">{stamp(block.startsAt)} to {stamp(block.endsAt)}</p><p className="break-words text-muted-foreground">{block.reason}</p></li>)}</ul>}
        </div>
      </section>
    </>}

    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !busy) { setEditing(null); if (detailsStale) void loadDetails(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Edit court details</DialogTitle>
        <DialogDescription>Name, description and photo appear on public pages. Saving here does not save or discard schedule edits.</DialogDescription>
        <form onSubmit={saveDetails} className="space-y-4">
          <label className="grid gap-1 text-sm font-medium">Court name<Input required maxLength={100} value={editName} onChange={e => setEditName(e.target.value)} /></label>
          <label className="grid gap-1 text-sm font-medium">Description<textarea rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-transparent p-3 text-sm font-normal" value={editDescription} onChange={e => setEditDescription(e.target.value)} /></label>
          <label className="grid gap-1 text-sm font-medium">{editing?.photoVersion !== "0" ? "Replace photo" : "Upload photo"}<Input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] ?? null)} /><span className="font-normal text-muted-foreground">JPEG, PNG or WebP, up to 5 MiB. Leave empty to keep the current photo.</span></label>
          {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || detailsStale || !editName.trim()}>{busy ? "Saving…" : "Save details"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); if (detailsStale) void loadDetails(); }}>Close</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={windowCourt !== null} onOpenChange={open => { if (!open && !busy) setWindowCourt(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Add a weekly window</DialogTitle>
        <DialogDescription>{windowCourt ? `${windowCourt.name}: ` : ""}the window is added to this page. Save the schedule to apply it.</DialogDescription>
        <form onSubmit={addWindow} className="space-y-4">
          <label className="grid gap-1 text-sm font-medium">Day<select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={draftWindow.weekday} onChange={e => setDraftWindow({ ...draftWindow, weekday: Number(e.target.value) })}>{days.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Opens<Input type="time" required value={draftWindow.opens} onChange={e => setDraftWindow({ ...draftWindow, opens: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Closes<Input type="time" required value={draftWindow.closes} onChange={e => setDraftWindow({ ...draftWindow, closes: e.target.value })} /></label>
          </div>
          <label className="grid gap-1 text-sm font-medium">₱ per hour<Input inputMode="decimal" placeholder="Blank disables checkout" value={draftWindow.hourlyRate} onChange={e => setDraftWindow({ ...draftWindow, hourlyRate: e.target.value })} /></label>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !draftWindow.opens || !draftWindow.closes}>Add window</Button><Button type="button" variant="outline" onClick={() => setWindowCourt(null)}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={quickCourt !== null} onOpenChange={open => { if (!open && !busy) setQuickCourt(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Quick setup</DialogTitle>
        <DialogDescription>{quickCourt ? `${quickCourt.name}: ` : ""}replaces every window on the selected days with one window at these times. Unselected days keep their windows. Save the schedule to apply it.</DialogDescription>
        <form onSubmit={applyQuickSetup} className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium">Days</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {days.map((day, i) => <label key={day} className="flex items-center gap-2"><input type="checkbox" checked={quick.weekdays.includes(i)} onChange={e => setQuick({ ...quick, weekdays: e.target.checked ? [...quick.weekdays, i] : quick.weekdays.filter(day => day !== i) })} />{day}</label>)}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Opens<Input type="time" required value={quick.opens} onChange={e => setQuick({ ...quick, opens: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Closes<Input type="time" required value={quick.closes} onChange={e => setQuick({ ...quick, closes: e.target.value })} /></label>
          </div>
          <label className="grid gap-1 text-sm font-medium">₱ per hour<Input inputMode="decimal" placeholder="Blank disables checkout" value={quick.hourlyRate} onChange={e => setQuick({ ...quick, hourlyRate: e.target.value })} /></label>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || quick.weekdays.length === 0}>Apply to {quick.weekdays.length} {quick.weekdays.length === 1 ? "day" : "days"}</Button><Button type="button" variant="outline" onClick={() => setQuickCourt(null)}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
