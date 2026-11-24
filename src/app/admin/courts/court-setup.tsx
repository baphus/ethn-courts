"use client";

import { toast } from "sonner";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingRows } from "@/components/admin/loading-slots";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type Snapshot } from "../settings/pricing-payload";
import EditCourtDialog from "./edit-court-dialog";
import { courtDetailsVersion, withCourtSchedule } from "./court-edit-save";
import { schedulePayload } from "./schedule-payload";
import { useCourtClosures } from "./use-court-closures";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const scheduleEndpoint = "/api/ethn/admin/hours";
const courtsEndpoint = "/api/ethn/admin/courts";

type Court = Snapshot["courts"][number];
type CourtDetails = { id: string; name: string; description: string; active: boolean; version: string; photoVersion: string; previousSettingsVersion?: string; settingsVersion?: string };
type HourWindow = Court["hours"][number];
type NewCourt = { name: string; description: string; idempotencyKey: string };

const hhmm = (value: string) => value.slice(0, 5);
const stamp = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const kindLabel = (kind: string) => kind === "private" ? "Private use" : "Maintenance";
const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled. You cannot save these changes." : status === 400 ? "Some values are invalid. Check the days, times and rates, then try again." : status === 409 ? "Settings changed elsewhere or a court name conflicts. Reload before saving; unsaved changes will be lost." : "Settings are unavailable. Please try again later.";

export default function CourtSetup() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogError, setDialogError] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [newCourt, setNewCourt] = useState({ name: "", description: "" });
  const [pendingCourt, setPendingCourt] = useState<NewCourt | null>(null);
  const [details, setDetails] = useState<CourtDetails[] | null>(null);
  const closures = useCourtClosures(details ?? []);
  const [closureOpen, setClosureOpen] = useState(false);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [closure, setClosure] = useState<{ courtIds: string[]; kind: "maintenance" | "private"; reason: string; startDate: string; startTime: string; endDate: string; endTime: string }>({ courtIds: [], kind: "maintenance", reason: "", startDate: "", startTime: "", endDate: "", endTime: "" });
  const [detailsError, setDetailsError] = useState("");
  const [editing, setEditing] = useState<CourtDetails | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [detailsStale, setDetailsStale] = useState(false);
  const [editHours, setEditHours] = useState<Court["hours"]>([]);
  const [editNotice, setEditNotice] = useState("");
  const [quickCourt, setQuickCourt] = useState<Court | null>(null);
  const [quick, setQuick] = useState({ opens: "07:00", closes: "20:00", hourlyRate: "", weekdays: [0, 1, 2, 3, 4, 5, 6] });


  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(scheduleEndpoint, { cache: "no-store" });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setData(null); return; }
      const snapshot: Snapshot = await response.json();
      setData(snapshot); setStale(false);
    } catch { setError(message(503)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadDetails = useCallback(async () => {
    setDetailsError("");
    try {
      const response = await fetch(courtsEndpoint, { cache: "no-store" });
      if (!response.ok) { if (response.status === 401 || response.status === 403) setDetails(null); setDetailsError(message(response.status)); return; }
      setDetails(await response.json());
    } catch { setDetailsError("Court details could not be loaded. Reload this page to try again."); }
  }, []);
  useEffect(() => { void loadDetails(); }, [loadDetails]);

  const hoursDirty = editing !== null && editHours !== data?.courts.find(court => court.id === editing.id)?.hours;
  const detailsDirty = editing !== null && (editName.trim() !== editing.name || editDescription.trim() !== editing.description || photo !== null);

  function closeEdit() {
    if (busy || ((hoursDirty || detailsDirty) && !window.confirm("Discard unsaved court changes?"))) return;
    setEditing(null);
    if (detailsStale) void loadDetails();
  }

  async function putSchedule(snapshot: Snapshot) {
    try {
      const response = await fetch(scheduleEndpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(schedulePayload(snapshot)) });
      if (response.status >= 500) throw new Error();
      if (response.status === 409) {
        const result = await response.json().catch(() => ({}));
        if (result.error === "HOURS_CONFLICT") return "Hours or status conflict with existing bookings, holds or closures. Nothing was cancelled.";
        setStale(true);
        return "The schedule changed elsewhere. Copy unsaved edits and refresh this page before saving again.";
      }
      if (!response.ok) return message(response.status);
      const { version } = await response.json() as { version: string };
      if (!version) throw new Error();
      setData({ ...snapshot, version });
      setDetails(previous => previous?.map(detail => ({ ...detail, active: snapshot.courts.find(court => court.id === detail.id)?.active ?? detail.active })) ?? null);
      return "";
    } catch {
      setStale(true);
      return { uncertain: true, message: "Could not confirm whether hours or status saved. Copy unsaved edits and refresh this page before retrying." };
    }
  }

  function reportScheduleFailure(failure: string | { uncertain: boolean; message: string }, partial = false) {
    if (partial) toast.warning(typeof failure === "string" ? "Court details saved; weekly hours were not saved." : "Court details saved; weekly hours could not be confirmed.");
    else if (typeof failure === "string") toast.error("Court schedule change was not saved.");
    else toast.warning("Court schedule change could not be confirmed.");
    return typeof failure === "string" ? failure : failure.message;
  }

  async function saveCourt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !editing || busy || detailsStale || stale || !editName.trim()) return;
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
      setDialogError("Choose a JPEG, PNG or WebP image no larger than 5 MiB."); return;
    }
    setBusy(true); setDialogError(""); setNotice("");
    let snapshot = data;
    try {
      if (detailsDirty) {
        const form = new FormData();
        form.set("name", editName.trim()); form.set("description", editDescription.trim()); form.set("version", editing.version);
        if (photo) form.set("photo", photo);
        const response = await fetch(`${courtsEndpoint}/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: form });
        if (response.status >= 500) throw new Error();
        if (!response.ok) {
          if (response.status !== 400) toast.error("Court details were not saved.");
          if (response.status === 409) {
            const result = await response.json().catch(() => ({}));
            if (result.error === "NAME_COLLISION") setDialogError("A court with this name already exists.");
            else { setDetailsStale(true); setDialogError("Court details changed elsewhere. Copy unsaved edits before closing, then reopen the editor."); }
          } else setDialogError(message(response.status));
          return;
        }
        const updated: CourtDetails = await response.json();
        const version = courtDetailsVersion(snapshot, updated);
        snapshot = { ...snapshot, version: version ?? snapshot.version, courts: snapshot.courts.map(court => court.id === updated.id ? { ...court, name: updated.name } : court) };
        setEditing(updated); setEditName(updated.name); setEditDescription(updated.description); setPhoto(null);
        setDetails(previous => previous?.map(court => court.id === updated.id ? updated : court) ?? [updated]);
        setData(snapshot);
        if (hoursDirty) setEditNotice("Court details saved. Weekly hours have not been saved yet.");
        if (!version) {
          if (hoursDirty) { toast.warning("Court details saved; weekly hours were not saved."); setStale(true); setDialogError("The schedule changed elsewhere. Copy your unsaved hours and refresh this page before saving again."); return; }
          setStale(true);
          await load();
        }
      }
      if (hoursDirty) {
        const failure = await putSchedule(withCourtSchedule(snapshot, editing.id, { hours: editHours }));
        if (failure) { setDialogError(reportScheduleFailure(failure, detailsDirty)); return; }
      }
      setEditing(null); toast.success("Court saved.");
    } catch {
      toast.warning("Court details save could not be confirmed.");
      setDetailsStale(true);
      setDialogError("Could not confirm whether court details saved. Weekly hours were not submitted. Copy unsaved edits before closing and check the saved details.");
    } finally { setBusy(false); }
  }

  async function setCourtActive(court: Court, active: boolean) {
    if (!data || busy || stale || !window.confirm(`${active ? "Activate" : "Deactivate"} ${court.name}?`)) return;
    setBusy(true); setError(""); setNotice("");
    const failure = await putSchedule(withCourtSchedule(data, court.id, { active }));
    if (failure) setError(reportScheduleFailure(failure));
    else toast.success(active ? "Court activated." : "Court deactivated.");
    setBusy(false);
  }

  async function applyQuickSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!data || busy || stale || !quickCourt || quick.weekdays.length === 0) return;
    const hours = [
      ...quickCourt.hours.filter(hour => !quick.weekdays.includes(hour.weekday)),
      ...quick.weekdays.map(weekday => ({ id: "", weekday, opens: quick.opens, closes: quick.closes, hourlyRate: quick.hourlyRate.trim() || null })),
    ].sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens));
    setBusy(true); setDialogError(""); setNotice("");
    const failure = await putSchedule(withCourtSchedule(data, quickCourt.id, { hours }));
    if (failure) setDialogError(reportScheduleFailure(failure));
    else { setQuickCourt(null); toast.success("Weekly hours saved."); }
    setBusy(false);
  }

  async function createCourt(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const payload = pendingCourt ?? { name: newCourt.name.trim(), description: newCourt.description.trim(), idempotencyKey: crypto.randomUUID() };
    setBusy(true); setDialogError(""); setNotice("");
    try {
      const response = await fetch(courtsEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        if (response.status !== 400) toast.error("Court was not created.");
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
      setNotice(`${typeof created?.name === "string" ? created.name : "Court"} created inactive. Add hours and rates in Edit court before activating it.`);
      toast.success("Court created inactive.");
      await Promise.all([load(), loadDetails()]);
    } catch {
      toast.warning("Court creation could not be confirmed.");
      setPendingCourt(payload);
      setDialogError("Could not confirm whether the court was created. Retry this exact request with the same owner account; do not create another.");
    } finally { setBusy(false); }
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Court setup</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Each court, the weekly windows it opens, and the hourly rate charged in every window. Changes apply to new checkouts only; existing bookings keep the price they were made with.</p>
      </div>
      <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); setDialogError(""); if (!open) { setNewCourt({ name: "", description: "" }); setPendingCourt(null); } }}>
        <DialogTrigger render={<Button disabled={busy} />}>Add court</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Add court</DialogTitle>
          <DialogDescription>A new court starts inactive. Add hours and rates in Edit court before activating it.</DialogDescription>
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
    {notice && <p className="rounded-lg border bg-muted p-4 text-sm">{notice}</p>}
    {detailsError && <div role="alert" className="rounded-lg border p-4 text-sm">{detailsError}</div>}
    {!data && (busy ? <LoadingRows label="Loading courts" /> : <Button variant="outline" onClick={() => void load()}>Try again</Button>)}

    {data && <>
      <section aria-labelledby="courts-heading" className="space-y-4">
      <h2 id="courts-heading" className="text-sm font-medium">Courts</h2>
      {data.courts.length === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground text-center"><EmptyIcon /> No courts yet. Add one to configure windows and rates.</p>}
      <div className="grid items-start gap-5 lg:grid-cols-2">
      {data.courts.map(court => {
        const detail = details?.find(item => item.id === court.id);
        return <section key={court.id} className="overflow-hidden rounded-xl border bg-card">
          <div className="relative aspect-[2/1] overflow-hidden bg-muted">
            {detail?.photoVersion && detail.photoVersion !== "0" ? <img className="h-full w-full object-cover" src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(detail.photoVersion)}`} alt={`${court.name} court`} /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No court photo</div>}
          </div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{court.name}</h3><p className="break-words text-sm text-muted-foreground">{detail?.description || (details ? "No description yet." : "Loading court details...")}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{court.active ? "Active" : "Inactive"}</span></div>
            <div className="overflow-hidden rounded-lg border text-sm">
              {days.map((day, weekday) => <div key={day} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2 border-b px-3 py-2 last:border-0"><span className="font-medium">{day.slice(0, 3)}</span><div className="space-y-1 text-muted-foreground">{court.hours.filter(hour => hour.weekday === weekday).length === 0 ? "Closed" : court.hours.filter(hour => hour.weekday === weekday).map((hour, i) => <p key={i}>{hhmm(hour.opens)}–{hhmm(hour.closes)}{hhmm(hour.opens) && hhmm(hour.closes) && hhmm(hour.closes) <= hhmm(hour.opens) ? (hhmm(hour.closes) === hhmm(hour.opens) ? " (24 hours)" : " (next day)") : ""} · {hour.hourlyRate ? `₱${hour.hourlyRate}/hr` : "No rate; checkout disabled"}</p>)}</div></div>)}
            </div>
            <div className="flex flex-wrap items-center gap-2"><label className="mr-auto flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={court.active} disabled={busy || stale} onChange={e => void setCourtActive(court, e.target.checked)} /> Active</label>
              <Button type="button" variant="outline" size="sm" disabled={busy || stale} onClick={() => { setDialogError(""); setQuickCourt(court); setQuick({ opens: "07:00", closes: "20:00", hourlyRate: "", weekdays: [0, 1, 2, 3, 4, 5, 6] }); }}>Quick setup</Button>
              <Button type="button" variant="outline" size="sm" disabled={busy || stale || !detail} onClick={() => { if (!detail) return; setDialogError(""); setEditNotice(""); setDetailsStale(false); setEditName(detail.name); setEditDescription(detail.description); setEditHours(court.hours); setPhoto(null); setEditing(detail); }}>Edit court</Button>
            </div>
          </div>
        </section>;
      })}
      </div>
      </section>
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">Closures</h2><p className="text-sm text-muted-foreground">Maintenance and private use, including ongoing closures. Times are in Manila.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/calendar" />}>Open calendar</Button><Button size="sm" disabled={closures.busy || !details} onClick={() => { setClosure(current => ({ ...current, courtIds: current.courtIds.filter(id => closures.courts.some(court => court.id === id && court.active)) })); setClosureOpen(true); }}>Add closure</Button></div></div>
        <div className="space-y-3 p-5 text-sm">
          {closures.error && <p role="alert" className="text-destructive">{closures.error}</p>}
          {closures.uncertain && <Button variant="outline" size="sm" onClick={closures.acknowledge}>I checked the list or calendar</Button>}
          {closures.blocks === null ? <LoadingRows label="Loading closures" /> : closures.loadError ? <p role="alert">{closures.loadError} <button type="button" className="underline" onClick={() => void closures.refresh()}>Try again</button></p> : (() => {
            const upcoming = closures.blocks.filter(block => new Date(block.endsAt).getTime() > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const groups = upcoming.reduce<Record<string, typeof upcoming>>((result, block) => { const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(block.startsAt)); (result[day] ??= []).push(block); return result; }, {});
            return upcoming.length === 0 ? <p className="text-center text-muted-foreground"><EmptyIcon /> No upcoming closures.</p> : <div className="space-y-4">{Object.entries(groups).map(([day, blocks]) => <div key={day}><h3 className="mb-2 font-semibold">{day}</h3><ul className="divide-y rounded-lg border">{blocks?.map(block => <li key={block.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-medium">{block.courtName} · {kindLabel(block.kind)}</p><p className="text-muted-foreground">{stamp(block.startsAt)} to {stamp(block.endsAt)}</p><p className="break-words text-muted-foreground">{block.reason}</p></div><Button variant="outline" size="sm" disabled={closures.busy || closures.uncertain} onClick={() => setReleaseId(block.id)}>Release<span className="sr-only"> {block.courtName}, {stamp(block.startsAt)}</span></Button></li>)}</ul></div>)}</div>;
          })()}
        </div>
      </section>
    </>}

    <Dialog open={closureOpen} onOpenChange={open => { if (!closures.busy) setClosureOpen(open); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md"><DialogTitle>Add closure</DialogTitle><DialogDescription>Block selected active courts for maintenance or private use. Times are in Manila. This is separate from the weekly schedule.</DialogDescription><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await closures.create(closure)) { setClosureOpen(false); setClosure({ courtIds: [], kind: "maintenance", reason: "", startDate: "", startTime: "", endDate: "", endTime: "" }); } }}><fieldset disabled={closures.busy}><legend className="text-sm font-medium">Courts</legend><div className="mt-2 grid gap-2">{closures.courts.filter(court => court.active).map(court => <label key={court.id} className="flex gap-2 text-sm"><input type="checkbox" checked={closure.courtIds.includes(court.id)} onChange={e => setClosure({ ...closure, courtIds: e.target.checked ? [...closure.courtIds, court.id] : closure.courtIds.filter(id => id !== court.id) })} />{court.name}</label>)}{!closures.courts.some(court => court.active) && <p className="text-sm text-muted-foreground">No saved active courts available.</p>}</div></fieldset><label className="grid gap-1 text-sm">Type<select className="h-9 rounded-md border border-input bg-transparent px-3" value={closure.kind} onChange={e => setClosure({ ...closure, kind: e.target.value as "maintenance" | "private" })}><option value="maintenance">Maintenance</option><option value="private">Private use</option></select></label><label className="grid gap-1 text-sm">Reason<Input required maxLength={500} value={closure.reason} onChange={e => setClosure({ ...closure, reason: e.target.value })} /></label><div className="grid grid-cols-2 gap-3">{([['startDate', 'Start date', 'date'], ['startTime', 'Start time', 'time'], ['endDate', 'End date', 'date'], ['endTime', 'End time', 'time']] as const).map(([key, label, type]) => <label key={key} className="grid gap-1 text-sm">{label}<Input required type={type} value={closure[key]} onChange={e => setClosure({ ...closure, [key]: e.target.value })} /></label>)}</div>{closures.error && <p role="alert" className="text-sm text-destructive">{closures.error}</p>}{closures.uncertain && <p className="text-sm text-muted-foreground">Close this dialog and check the list or calendar before retrying.</p>}<div className="flex gap-2"><Button type="submit" disabled={closures.busy || closures.uncertain || !closure.courtIds.length}>Add closure</Button><Button type="button" variant="outline" disabled={closures.busy} onClick={() => setClosureOpen(false)}>Cancel</Button></div></form></DialogContent></Dialog>
    <Dialog open={releaseId !== null} onOpenChange={open => { if (!open && !closures.busy) setReleaseId(null); }}><DialogContent className="sm:max-w-md"><DialogTitle>Release closure?</DialogTitle><DialogDescription>This releases only the selected court closure. Other court closures remain in place.</DialogDescription>{closures.blocks?.filter(block => block.id === releaseId).map(block => <p key={block.id} className="text-sm"><strong>{block.courtName}</strong> · {kindLabel(block.kind)}<br />{stamp(block.startsAt)} to {stamp(block.endsAt)}</p>)}{closures.error && <p role="alert" className="text-sm text-destructive">{closures.error}</p>}<div className="flex gap-2"><Button variant="destructive" disabled={closures.busy || closures.uncertain || !closures.blocks?.some(block => block.id === releaseId)} onClick={async () => { if (releaseId && await closures.release(releaseId)) setReleaseId(null); }}>Release closure</Button><Button variant="outline" disabled={closures.busy} onClick={() => setReleaseId(null)}>Cancel</Button></div></DialogContent></Dialog>

    {editing && <EditCourtDialog name={editName} description={editDescription} photoVersion={editing.photoVersion} hours={editHours} busy={busy} blocked={stale || detailsStale || (!detailsDirty && !hoursDirty)} error={dialogError} notice={editNotice} onName={setEditName} onDescription={setEditDescription} onPhoto={setPhoto} onHours={setEditHours} onSave={saveCourt} onClose={closeEdit} />}

    <Dialog open={quickCourt !== null} onOpenChange={open => { if (!open && !busy) setQuickCourt(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Quick setup</DialogTitle>
        <DialogDescription>{quickCourt ? `${quickCourt.name}: ` : ""}replaces every window on the selected days with one window at these times. Unselected days keep their windows. Apply saves these changes immediately.</DialogDescription>
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
          {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || stale || quick.weekdays.length === 0}>{busy ? "Saving…" : `Apply to ${quick.weekdays.length} ${quick.weekdays.length === 1 ? "day" : "days"}`}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setQuickCourt(null)}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
