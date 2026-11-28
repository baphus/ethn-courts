"use client";
import { useInvalidateOwnerResources } from "@/components/admin/dashboard/dashboard-resource";

import { formatScheduleRange, formatScheduleTime, formatWeeklyHours } from "@/lib/booking/schedule-label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { toast } from "sonner";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingRows } from "@/components/admin/loading-slots";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormSelect } from "@/components/ui/form-select";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type Snapshot } from "../settings/pricing-payload";
import EditCourtDialog from "./edit-court-dialog";
import { courtDetailsVersion, withCourtSchedule } from "./court-edit-save";
import { schedulePayload } from "./schedule-payload";
import { planQuickSchedule } from "./quick-schedule";
import { closingOptions, keepClosingTime, openingOptions } from "./hour-options";
import { EventDialog } from "../event-dialog";
import { useCourtClosures } from "./use-court-closures";
import { findEthnHoursIssues } from "@/lib/admin/ethn-hours-validation";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const scheduleEndpoint = "/api/ethn/admin/hours";
const courtsEndpoint = "/api/ethn/admin/courts";

type Court = Snapshot["courts"][number];
type CourtDetails = { id: string; name: string; description: string | null; active: boolean; version: string; photoVersion: string; previousSettingsVersion?: string; settingsVersion?: string };
type HourWindow = Court["hours"][number];
type NewCourt = { name: string; description: string; idempotencyKey: string };

const hhmm = (value: string) => value.slice(0, 5);
const quickTimeOptions = openingOptions();
const kindLabel = (kind: string) => kind === "private" ? "Private use" : "Maintenance";
const hourOrder = (a: HourWindow, b: HourWindow) => a.weekday - b.weekday || hhmm(a.opens).localeCompare(hhmm(b.opens));

const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled. You cannot save these changes." : status === 400 ? "Some values are invalid. Check the days, times and rates, then try again." : status === 409 ? "Settings changed elsewhere or a court name conflicts. Reload before saving; unsaved changes will be lost." : "Settings are unavailable. Please try again later.";

export default function CourtSetup() {
  const invalidate = useInvalidateOwnerResources();
  const confirm = useConfirm();
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
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [editing, setEditing] = useState<CourtDetails | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [detailsStale, setDetailsStale] = useState(false);
  const [editHours, setEditHours] = useState<Court["hours"]>([]);
  const [editNotice, setEditNotice] = useState("");
  const [quickCourt, setQuickCourt] = useState<Court | null>(null);
  const [quickConfirm, setQuickConfirm] = useState(false);
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

  const quickSchedule = useMemo(() => {
    if (!quickCourt) return null;
    const proposed: HourWindow[] = quick.weekdays.map(weekday => ({ id: "", weekday, opens: quick.opens, closes: quick.closes, hourlyRate: quick.hourlyRate.trim() || null }));
    return planQuickSchedule(quickCourt.hours, proposed, data?.anchorMinutes ?? 0);
  }, [quickCourt, quick, data?.anchorMinutes]);
  const quickTimeInvalid = !!quickSchedule?.proposedIssues.some(issue => issue.kind !== "invalid_rate") || !!quickSchedule?.unselectedSpill.length;
  const quickRateInvalid = !!quickSchedule?.proposedIssues.some(issue => issue.kind === "invalid_rate");
  const hoursDirty = editing !== null && editHours !== data?.courts.find(court => court.id === editing.id)?.hours;
  const detailsDirty = editing !== null && (editName.trim() !== editing.name || editDescription.trim() !== (editing.description ?? "") || photo !== null);

  async function closeEdit() {
    if (busy || ((hoursDirty || detailsDirty) && !await confirm("Discard unsaved court changes?", { confirmLabel: "Discard changes", destructive: true }))) return;
    setEditing(null);
    if (detailsStale) void loadDetails();
  }

  async function putSchedule(snapshot: Snapshot) {
    try {
      const response = await fetch(scheduleEndpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(schedulePayload(snapshot)) });
      if (response.status >= 500) throw new Error();
      if (response.status === 409) {
        const result = await response.json().catch(() => ({}));
        if (result.error === "HOURS_CONFLICT") return "An existing closure would lose coverage, or the change would deactivate a court with an upcoming booking, hold, or closure. Nothing was cancelled.";
        setStale(true);
        return "The schedule changed elsewhere. Copy unsaved edits and refresh this page before saving again.";
      }
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        return response.status === 400 && result.error === "INVALID_SCHEDULE" ? "The weekly schedule is invalid. Check highlighted days and times, then try again." : message(response.status);
      }
      const { version } = await response.json() as { version: string };
      if (!version) throw new Error();
      invalidate?.();
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
    if (hoursDirty && findEthnHoursIssues(editHours.map(hour => ({ weekday: hour.weekday, opens: hour.opens, closes: hour.closes, hourly_rate: hour.hourlyRate?.trim() || null })), data.anchorMinutes).length) { setDialogError("Fix the highlighted weekly hours before saving."); return; }
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
        invalidate?.();
        const updated: CourtDetails = await response.json();
        const version = courtDetailsVersion(snapshot, updated);
        snapshot = { ...snapshot, version: version ?? snapshot.version, courts: snapshot.courts.map(court => court.id === updated.id ? { ...court, name: updated.name } : court) };
        setEditing(updated); setEditName(updated.name); setEditDescription(updated.description ?? ""); setPhoto(null);
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
    if (!data || busy || stale || !await confirm(`${active ? "Activate" : "Deactivate"} ${court.name}?`, { confirmLabel: active ? "Activate court" : "Deactivate court", destructive: !active })) return;
    setBusy(true); setError(""); setNotice("");
    const failure = await putSchedule(withCourtSchedule(data, court.id, { active }));
    if (failure) setError(reportScheduleFailure(failure));
    else toast.success(active ? "Court activated." : "Court deactivated.");
    setBusy(false);
  }

  async function applyQuickSetup(event: React.FormEvent) {
    event.preventDefault();
    if (!data || busy || stale || !quickCourt || quick.weekdays.length === 0) return;
    if (!quickSchedule) return;
    if (quickSchedule.unselectedSpill.length) { setDialogError("This overnight range overlaps hours on an unselected day. Select that day too or choose different times; nothing was changed."); return; }
    if (quickSchedule.issues.length) { setDialogError(quickSchedule.issues.some(issue => issue.kind === "invalid_rate") ? "Enter a valid peso amount or leave blank to disable checkout." : "The proposed hours overlap or fall outside the operating day. Adjust the selected days or times; nothing was saved."); return; }
    if (quickSchedule.replaced.length && !quickConfirm) { setQuickConfirm(true); return; }
    const { hours } = quickSchedule;
    setBusy(true); setDialogError(""); setNotice("");
    const failure = await putSchedule(withCourtSchedule(data, quickCourt.id, { hours }));
    if (failure) setDialogError(reportScheduleFailure(failure));
    else { setQuickCourt(null); setQuickConfirm(false); toast.success("Weekly hours saved."); }
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

  return <div className="w-full space-y-5 pb-24">
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
            <label className="grid gap-1 text-sm font-medium">Court name<Input placeholder="Court 1" required maxLength={100} value={newCourt.name} onChange={e => setNewCourt({ ...newCourt, name: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Description <span className="font-normal text-muted-foreground">Optional, shown on public pages</span><Textarea placeholder="Surface, location, or amenities" rows={3} maxLength={1000} value={newCourt.description} onChange={e => setNewCourt({ ...newCourt, description: e.target.value })} /></label>
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
        const groupedHours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: court.hours.filter(hour => hour.weekday === weekday).sort(hourOrder) }));
        return <section key={court.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="relative aspect-[2/1] overflow-hidden bg-muted">
            {detail?.photoVersion && detail.photoVersion !== "0" ? <img className="h-full w-full object-cover" src={`/api/ethn/courts/${encodeURIComponent(court.id)}/photo?v=${encodeURIComponent(detail.photoVersion)}`} alt={`${court.name} court`} /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No court photo</div>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
              <Button type="button" variant="secondary" size="sm" disabled={busy || stale} onClick={() => { setDialogError(""); setQuickConfirm(false); setQuickCourt(court); setQuick({ opens: "07:00", closes: keepClosingTime("07:00", "20:00", data.anchorMinutes), hourlyRate: "", weekdays: [1, 2, 3, 4, 5] }); }}>Quick setup</Button>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{court.name}</h3><p className="break-words text-sm text-muted-foreground">{detail?.description || (details ? "No description yet." : "Loading court details...")}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{court.active ? "Active" : "Inactive"}</span></div>
            <div className="divide-y overflow-hidden rounded-lg border text-xs sm:text-sm">
              {groupedHours.map(({ weekday, hours }) => <div key={days[weekday]} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 px-3 py-2"><span className="font-medium">{days[weekday].slice(0, 3)}</span><div className="space-y-1 text-muted-foreground">{hours.length === 0 ? <p className="italic">Closed</p> : hours.map((hour, i) => <p key={hour.id || `${hour.opens}-${i}`} className="flex flex-wrap justify-between gap-x-3"><span>{formatWeeklyHours(hour.opens, hour.closes)}</span><span>{hour.hourlyRate ? `₱${hour.hourlyRate}/hr` : "No rate; checkout disabled"}</span></p>)}</div></div>)}
            </div>
            <div className="flex flex-wrap items-center gap-2"><label className="mr-auto flex items-center gap-2 text-sm font-medium"><input className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" type="checkbox" checked={court.active} disabled={busy || stale} onChange={e => void setCourtActive(court, e.target.checked)} /> Active</label>
              <Button type="button" variant="outline" size="sm" disabled={busy || stale || !detail} onClick={() => { if (!detail) return; setDialogError(""); setEditNotice(""); setDetailsStale(false); setEditName(detail.name); setEditDescription(detail.description ?? ""); setEditHours(court.hours); setPhoto(null); setEditing(detail); }}>Edit court</Button>
            </div>
          </div>
        </section>;
      })}
      </div>
      </section>
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">Closures</h2><p className="text-sm text-muted-foreground">Maintenance and private use, including ongoing closures.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/calendar" />}>Open calendar</Button><EventDialog
          closureOnly
          courts={closures.courts}
          disabled={!details}
          busy={closures.busy}
          blocked={closures.uncertain}
          onSubmit={closures.create}
          notice={<>
            {closures.error && <p role="alert" className="text-sm text-destructive">{closures.error}</p>}
            {closures.uncertain && <Button type="button" variant="outline" size="sm" onClick={closures.acknowledge}>I checked the list or calendar</Button>}
          </>}
        /></div></div>
        <div className="space-y-3 p-5 text-sm">
          {closures.error && <p role="alert" className="text-destructive">{closures.error}</p>}
          {closures.uncertain && <Button variant="outline" size="sm" onClick={closures.acknowledge}>I checked the list or calendar</Button>}
          {closures.blocks === null ? <LoadingRows label="Loading closures" /> : closures.loadError ? <p role="alert">{closures.loadError} <button type="button" className="underline" onClick={() => void closures.refresh()}>Try again</button></p> : (() => {
            const upcoming = closures.blocks.filter(block => new Date(block.endsAt).getTime() > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            const groups = upcoming.reduce<Record<string, typeof upcoming>>((result, block) => { const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(block.startsAt)); (result[day] ??= []).push(block); return result; }, {});
            return upcoming.length === 0 ? <p className="text-center text-muted-foreground"><EmptyIcon /> No upcoming closures.</p> : <div className="space-y-4">{Object.entries(groups).map(([day, blocks]) => <div key={day}><h3 className="mb-2 font-semibold">{day}</h3><ul className="divide-y rounded-lg border">{blocks?.map(block => <li key={block.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-medium">{block.courtName} · {kindLabel(block.kind)}</p><p className="text-muted-foreground">{formatScheduleRange(block.startsAt, block.endsAt, day)}</p><p className="break-words text-muted-foreground">{block.reason}</p></div><Button variant="outline" size="sm" disabled={closures.busy || closures.uncertain} onClick={() => setReleaseId(block.id)}>Release<span className="sr-only"> {block.courtName}, {formatScheduleTime(block.startsAt)}</span></Button></li>)}</ul></div>)}</div>;
          })()}
        </div>
      </section>
    </>}

    <Dialog open={releaseId !== null} onOpenChange={open => { if (!open && !closures.busy) setReleaseId(null); }}><DialogContent className="sm:max-w-md"><DialogTitle>Release closure?</DialogTitle><DialogDescription>This releases only the selected court closure. Other court closures remain in place.</DialogDescription>{closures.blocks?.filter(block => block.id === releaseId).map(block => <p key={block.id} className="text-sm"><strong>{block.courtName}</strong> · {kindLabel(block.kind)}<br />{formatScheduleRange(block.startsAt, block.endsAt)}</p>)}{closures.error && <p role="alert" className="text-sm text-destructive">{closures.error}</p>}<div className="flex gap-2"><Button variant="destructive" disabled={closures.busy || closures.uncertain || !closures.blocks?.some(block => block.id === releaseId)} onClick={async () => { if (releaseId && await closures.release(releaseId)) setReleaseId(null); }}>Release closure</Button><Button variant="outline" disabled={closures.busy} onClick={() => setReleaseId(null)}>Cancel</Button></div></DialogContent></Dialog>

    {editing && <EditCourtDialog name={editName} description={editDescription} photoVersion={editing.photoVersion} hours={editHours} anchorMinutes={data?.anchorMinutes ?? 0} busy={busy} blocked={stale || detailsStale || (!detailsDirty && !hoursDirty)} error={dialogError} notice={editNotice} onName={setEditName} onDescription={setEditDescription} onPhoto={setPhoto} onHours={setEditHours} onSave={saveCourt} onClose={closeEdit} />}

    <Dialog open={quickCourt !== null} onOpenChange={open => { if (!open && !busy) setQuickCourt(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl lg:max-w-[840px]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3"><div><DialogTitle>Quick Setup</DialogTitle><DialogDescription className="mt-1">{quickCourt?.name}</DialogDescription></div></div>
        <form onSubmit={applyQuickSetup} className="space-y-5">
          <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">Adds this time and rate to selected days. Overlapping windows show for review; all other hours and unselected days stay unchanged.</p>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Days</legend>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              {days.map((day, i) => { const checked = quick.weekdays.includes(i); return <label key={day} className={`flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${checked ? "border-ring bg-accent" : ""}`}><span className="min-w-0 truncate">{day}</span><Switch className="shrink-0" checked={checked} disabled={busy} onCheckedChange={value => { setQuickConfirm(false); setDialogError(""); setQuick({ ...quick, weekdays: value ? [...quick.weekdays, i].sort((a, b) => a - b) : quick.weekdays.filter(day => day !== i) }); }} aria-label={`${day} ${checked ? "selected" : "not selected"}`} /></label>; })}
            </div>
            {quick.weekdays.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Select at least one day.</p>}
          </fieldset>
          <div className="space-y-1.5"><label className="text-sm font-medium">Hours</label><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {([{ key: "opens", label: "Quick setup start time", value: quick.opens }, { key: "closes", label: "Quick setup end time", value: quick.closes }] as const).map((field, index) => <Fragment key={field.key}>{index === 1 && <span className="text-xs text-muted-foreground">to</span>}<FormSelect aria-label={field.label} aria-invalid={quickTimeInvalid} aria-describedby={quickTimeInvalid ? "quick-schedule-error" : undefined} placeholder="Choose closing time" value={field.value || null} onValueChange={value => { if (value) { setQuickConfirm(false); setDialogError(""); setQuick(field.key === "opens" ? { ...quick, opens: value, closes: keepClosingTime(value, quick.closes, data?.anchorMinutes ?? 0) } : { ...quick, closes: value }); } }} disabled={busy} options={field.key === "opens" ? quickTimeOptions : closingOptions(quick.opens, data?.anchorMinutes ?? 0)} /></Fragment>)}
          </div>{quick.opens === quick.closes && <p className="text-xs text-muted-foreground">Open 24 hours on each selected day.</p>}</div>
          <div className="flex flex-wrap items-center gap-2"><label htmlFor="quick-setup-rate" className="text-sm font-medium">Hourly rate</label><span aria-hidden className="text-sm font-medium text-muted-foreground">₱</span><Input id="quick-setup-rate" aria-invalid={quickRateInvalid} aria-describedby={quickRateInvalid ? "quick-schedule-error" : undefined} inputMode="decimal" placeholder="150" value={quick.hourlyRate} onChange={e => { setQuickConfirm(false); setDialogError(""); setQuick({ ...quick, hourlyRate: e.target.value }); }} className="h-8 max-w-32 text-right font-semibold tabular-nums" /><span className="text-xs text-muted-foreground">per hour</span></div>
          {quickSchedule && (quickSchedule.issues.length > 0 || quickSchedule.unselectedSpill.length > 0) && <p id="quick-schedule-error" role="status" className="text-sm text-destructive">{!quick.closes ? "Choose a closing time that fits the operating day." : quickSchedule.unselectedSpill.length ? `Overlaps unselected hours: ${quickSchedule.unselectedSpill.map(hour => `${days[hour.weekday]} ${formatWeeklyHours(hour.opens, hour.closes)}`).join(", ")}. Select those days or change the times.` : quickTimeInvalid ? "Check opening and closing times. Windows cannot overlap or cross the operating-day boundary." : !quickRateInvalid ? "Existing hours need correction. Open Edit court to find the affected blocks." : ""}{quickRateInvalid && " Enter a valid peso amount or leave blank to disable checkout."}</p>}
          {quickSchedule && quickSchedule.replaced.length > 0 && <div role="alert" className="space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm"><p>{quickConfirm ? "Confirm replacement of these overlapping windows:" : "These windows overlap and will be replaced only after confirmation:"}</p><ul className="list-disc pl-5 text-xs">{quickSchedule.replaced.map(hour => <li key={hour.id || `${hour.weekday}-${hour.opens}`}>{days[hour.weekday]} · {formatWeeklyHours(hour.opens, hour.closes)} · {hour.hourlyRate ? `₱${hour.hourlyRate}/hr` : "Checkout disabled"}</li>)}</ul></div>}
          {dialogError && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{dialogError}</p>}
          <div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setQuickCourt(null)}>Cancel</Button><Button type="submit" disabled={busy || stale || quick.weekdays.length === 0 || !!quickSchedule?.issues.length || !!quickSchedule?.unselectedSpill.length}>{busy ? "Saving…" : quickSchedule?.replaced.length && !quickConfirm ? "Review replacement" : quickSchedule?.replaced.length ? "Confirm and apply" : "Add hours and rate"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
