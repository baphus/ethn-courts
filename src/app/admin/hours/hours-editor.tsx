"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Snapshot } from "../settings/pricing-payload";
import { hoursPayload } from "./hours-payload";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const endpoint = "/api/ethn/admin/hours";
const time = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled." : status === 400 ? "Invalid schedule or rate. Check your entries and try again." : "Hours are unavailable. Please try again later.";

export default function HoursEditor() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const dirty = data !== null && JSON.stringify(data) !== original;
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setData(null); return; }
      const snapshot: Snapshot = await response.json();
      setData(snapshot); setOriginal(JSON.stringify(snapshot)); setStale(false); setSuccess("");
    } catch { setError(message(503)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function updateCourt(index: number, change: (court: Snapshot["courts"][number]) => Snapshot["courts"][number]) {
    setData(prev => prev && { ...prev, courts: prev.courts.map((court, i) => i === index ? change(court) : court) });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data || busy || !dirty || stale) return;
    if (!window.confirm("Save these hours? Changes that conflict with existing future bookings or holds will be rejected. No bookings will be cancelled.")) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hoursPayload(data)) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        if (response.status === 409 && result.error === "HOURS_CONFLICT") setError("These changes conflict with an existing booking or hold. Your edits are preserved; no booking was cancelled.");
        else if (response.status === 409) { setStale(true); setError("Hours changed elsewhere. Reload before saving; your edits are preserved until you reload."); }
        else { setError(message(response.status)); if (response.status === 401 || response.status === 403) setData(null); }
        return;
      }
      setStale(true);
      const refreshed = await fetch(endpoint, { cache: "no-store" });
      if (!refreshed.ok) { setError("Saved, but the latest hours could not be loaded. Reload before editing again."); return; }
      const snapshot: Snapshot = await refreshed.json();
      setData(snapshot); setOriginal(JSON.stringify(snapshot)); setStale(false); setSuccess("Hours saved.");
    } catch { setStale(true); setError("Could not confirm whether hours were saved. Reload before trying again; your edits are preserved until you reload."); } finally { setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
    <header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">OWNER SETTINGS</p><h1 className="text-3xl font-semibold tracking-tight">Court hours</h1><p className="max-w-2xl text-muted-foreground">Set weekly opening windows and availability for each court. Existing bookings and holds must still fit within one window.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/hours">Sign in</a>}</div>}
    {success && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{success}</p>}
    {!data && <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Try again"}</Button>}
    {data && <><section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Weekly schedule</h2><p className="text-sm text-muted-foreground">Version {data.version}{dirty ? " · Unsaved changes" : ""}</p></div><Sheet open={open} onOpenChange={next => { if (!next && (busy || (dirty && !window.confirm("Close editor? Unsaved changes remain until saved or reloaded.")))) return; setOpen(next); }}><SheetTrigger render={<Button variant="outline" />}>Edit hours</SheetTrigger><SheetContent className="w-full overflow-y-auto p-5 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"><SheetTitle className="font-sans">Edit court hours</SheetTitle><SheetDescription>Save all courts together. Existing bookings and holds must fit within a window.</SheetDescription>{error && <p role="alert" className="text-destructive">{error}</p>}<form onSubmit={save} className="space-y-6"><fieldset disabled={busy} className="space-y-6">
      <section className="space-y-3 rounded-xl border bg-muted/30 p-5"><h2 className="font-semibold">Booking rules <span className="text-sm font-normal text-muted-foreground">· Read only</span></h2><dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">{[["Interval", `${data.intervalMinutes} min`], ["Minimum", `${data.minimumMinutes} min`], ["Day anchor", time(data.anchorMinutes)], ["Booking horizon", `${data.horizonDays} days`], ["Hold", `${data.holdMinutes} min`]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl></section>
      <div className="space-y-4"><div><h2 className="text-xl font-semibold">Weekly windows</h2><p className="mt-1 text-sm text-muted-foreground">No windows means closed. Blank rate disables checkout for that window. A closing time at or before opening is next day; equal times mean 24 hours. Bookings must fit one window, not span separate windows.</p></div>
      {data.courts.map((court, ci) => <section key={court.id} className="space-y-4 rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{court.name}</h3><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={court.active} onChange={e => { const active = e.target.checked; updateCourt(ci, c => ({ ...c, active })); }} /> Active</label></div><p className="text-sm text-muted-foreground">{court.active ? "Available according to these windows." : "Inactive: windows remain stored; booking history is retained. Reactivation may be rejected if it conflicts with existing bookings."}</p>
        {court.hours.length === 0 && <p className="rounded-md bg-muted p-3 text-sm">Closed all week: no windows configured.</p>}
        <div className="space-y-3">{court.hours.map((hour, hi) => <fieldset key={hi} className="space-y-3 rounded-lg border p-4"><legend className="px-1 text-sm font-medium">Window {hi + 1}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm font-medium"><span>Day</span><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={hour.weekday} onChange={e => { const weekday = Number(e.target.value); updateCourt(ci, c => ({ ...c, hours: c.hours.map((h, i) => i === hi ? { ...h, weekday } : h) })); }}>{days.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
          {(["opens", "closes"] as const).map(field => <label key={field} className="space-y-1 text-sm font-medium"><span>{field === "opens" ? "Opens" : "Closes"}</span><Input type="time" required value={hour[field].slice(0, 5)} onChange={e => { const value = e.target.value; updateCourt(ci, c => ({ ...c, hours: c.hours.map((h, i) => i === hi ? { ...h, [field]: value } : h) })); }} /></label>)}
          <label className="space-y-1 text-sm font-medium"><span>₱ per hour</span><Input inputMode="decimal" placeholder="Checkout disabled" value={hour.hourlyRate ?? ""} onChange={e => { const hourlyRate = e.target.value; updateCourt(ci, c => ({ ...c, hours: c.hours.map((h, i) => i === hi ? { ...h, hourlyRate } : h) })); }} /></label></div>
          {hour.opens && hour.closes && hour.closes.slice(0, 5) <= hour.opens.slice(0, 5) && <p className="text-sm text-muted-foreground">Closes next day{hour.closes.slice(0, 5) === hour.opens.slice(0, 5) ? " · 24-hour window" : ""}.</p>}
          <Button type="button" variant="outline" onClick={() => updateCourt(ci, c => ({ ...c, hours: c.hours.filter((_, i) => i !== hi) }))}>Remove window {hi + 1}</Button></fieldset>)}</div>
        <Button type="button" variant="outline" onClick={() => updateCourt(ci, c => ({ ...c, hours: [...c.hours, { id: "", weekday: 0, opens: "", closes: "", hourlyRate: null }] }))}>Add window</Button></section>)}</div>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={!dirty || stale || busy}>Save changes</Button><Button type="button" variant="outline" onClick={() => { if (!dirty || window.confirm("Reload hours and discard your unsaved changes?")) void load(); }}>Reload hours</Button><span className="text-sm text-muted-foreground">Version {data.version}{dirty ? " · Unsaved changes" : ""}</span></div>
    </fieldset></form></SheetContent></Sheet></div><div className="divide-y rounded-xl border bg-card">{data.courts.map(court => <section key={court.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{court.name}</h3><span className="text-sm text-muted-foreground">{court.active ? "Active" : "Inactive"}</span></div>{court.hours.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Closed all week</p> : <ul className="mt-2 space-y-1 text-sm">{court.hours.map((hour, i) => <li key={i} className="flex flex-wrap gap-x-4"><span className="w-24 text-muted-foreground">{days[hour.weekday]}</span><span>{hour.opens.slice(0, 5)}–{hour.closes.slice(0, 5)}{hour.closes <= hour.opens ? " · next day" : ""}</span><span className="text-muted-foreground">{hour.hourlyRate == null || hour.hourlyRate === "" ? "Checkout disabled" : `₱${hour.hourlyRate} / hour`}</span></li>)}</ul>}</section>)}</div></section></>}
  </div>;
}
