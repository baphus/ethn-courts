"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { settingsPayload, updateMerchant, updateCourtName, updateRate, type Snapshot } from "./pricing-payload";
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const endpoint = "/api/ethn/admin/settings";
const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled. You cannot save these settings." : status === 400 ? "Some values are invalid. Check names and rates, then try again." : status === 409 ? "Settings changed elsewhere or a court name conflicts. Reload before saving; your unsaved changes will be lost." : "Settings are unavailable. Please try again later.";

export default function OwnerPricing() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stale, setStale] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dirty = data !== null && JSON.stringify(data) !== original;
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setData(null); return; }
      const snapshot: Snapshot = await response.json();
      setData(snapshot); setOriginal(JSON.stringify(snapshot)); setStale(false); setConfirmed(false); setSuccess("");
    } catch { setError(message(503)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data || busy || !dirty || stale) return;
    if (!confirmed) { setError("Confirm the official GCash instructions before saving."); return; }
    if (!window.confirm("Save settings for new checkouts only? Existing agreed prices and payment recipients stay frozen.")) return;
    setBusy(true); setError(""); setSuccess("");
    const payload = settingsPayload(data);
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setError(message(response.status)); if (response.status === 409) setStale(true); if (response.status === 401 || response.status === 403) setData(null); return; }
      const result: { version: string } = await response.json();
      const saved = { ...data, version: result.version, merchant: payload.merchant, courts: data.courts.map((c, i) => ({ ...c, name: payload.courts[i].name, hours: c.hours.map((h, j) => ({ ...h, hourlyRate: payload.courts[i].rates[j].hourlyRate })) })) };
      setData(saved); setOriginal(JSON.stringify(saved)); setConfirmed(false);
      setSuccess(`Saved version ${result.version}.${!payload.merchant || payload.courts.some(c => c.rates.some(r => r.hourlyRate === null)) ? " Checkout is disabled where payment instructions or rates are blank." : ""}`);
    } catch { setError("Could not confirm whether settings were saved. Reload before trying again; unsaved changes will be lost."); setStale(true); } finally { setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
    <header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">OWNER SETTINGS</p><h1 className="text-3xl font-semibold tracking-tight">Pricing & payment</h1><p className="max-w-2xl text-muted-foreground">Set court names, hourly rates and official GCash instructions for new checkouts. Existing agreed prices and payment recipients stay frozen.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/settings">Sign in</a>}</div>}
    {success && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{success}</p>}
    {!data && <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Try again"}</Button>}
    {data && <form onSubmit={save} className="space-y-6"><fieldset disabled={busy} className="space-y-6">
      <section className="rounded-xl border bg-card p-5 space-y-4"><div><h2 className="text-lg font-semibold">Official GCash instructions</h2><p className="text-sm text-muted-foreground">Shown to customers at checkout. Leave blank to disable payment checkout.</p></div><label className="block text-sm font-medium" htmlFor="merchant">Payment instructions</label><textarea id="merchant" maxLength={2000} rows={4} className="w-full rounded-md border bg-background p-3 text-sm" value={data.merchant ?? ""} onChange={e => { setData(updateMerchant(e.target.value)); setConfirmed(false); }} /><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /> <span>I confirm these are the official GCash instructions, or that payment checkout should be disabled.</span></label></section>
      <section className="rounded-xl border bg-muted/30 p-5"><h2 className="font-semibold">Booking rules <span className="text-sm font-normal text-muted-foreground">· Read only</span></h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">{[["Interval", `${data.intervalMinutes} min`], ["Minimum", `${data.minimumMinutes} min`], ["Anchor", `${data.anchorMinutes} min`], ["Booking horizon", `${data.horizonDays} days`], ["Hold", `${data.holdMinutes} min`]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl></section>
      <div className="space-y-4"><div><h2 className="text-xl font-semibold">Courts & hourly rates</h2><p className="text-sm text-muted-foreground">Leave a rate blank to disable checkout for that hours row. Hours and active status are read only.</p></div>{data.courts.map((court, ci) => <section key={court.id} className="rounded-xl border bg-card p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Court {ci + 1}</h3><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{court.active ? "Active" : "Inactive"}</span></div><label className="block space-y-1 text-sm font-medium">Court name<Input required maxLength={100} value={court.name} onChange={e => setData(updateCourtName(ci, e.target.value))} /></label><div className="divide-y">{court.hours.map((hour, hi) => <div key={hour.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="text-sm"><p className="font-medium">{days[hour.weekday] ?? `Day ${hour.weekday}`}</p><p className="text-muted-foreground">{hour.opens.slice(0, 5)}–{hour.closes.slice(0, 5)}{hour.closes <= hour.opens ? " (next day)" : ""}</p></div><label className="w-36 space-y-1 text-sm"><span className="text-muted-foreground">₱ per hour</span><Input aria-label={`${court.name}, ${days[hour.weekday]} ${hour.opens.slice(0, 5)} hourly rate in pesos`} inputMode="decimal" placeholder="Disabled" value={hour.hourlyRate ?? ""} onChange={e => setData(updateRate(ci, hi, e.target.value))} /></label></div>)}</div></section>)}</div>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={!dirty || stale || busy}> {busy ? "Saving…" : "Save changes"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { if (!dirty || window.confirm("Reload settings and discard your unsaved changes?")) void load(); }}>Reload settings</Button><span className="text-sm text-muted-foreground">Version {data.version}{dirty ? " · Unsaved changes" : ""}</span></div>
    </fieldset></form>}
  </div>;
}
