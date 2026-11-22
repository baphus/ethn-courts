"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { settingsPayload, updateMerchant, type Snapshot } from "./pricing-payload";

const endpoint = "/api/ethn/admin/settings";
const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled. You cannot save these settings." : status === 400 ? "Check the instructions and try again." : status === 409 ? "Settings changed elsewhere. Reload before saving; your unsaved changes will be lost." : "Settings are unavailable. Please try again later.";

export default function OwnerPayment() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [original, setOriginal] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dirty = data !== null && JSON.stringify(data) !== original;

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setData(null); return; }
      const snapshot: Snapshot = await response.json();
      setData(snapshot); setOriginal(JSON.stringify(snapshot)); setStale(false); setNotice("");
    } catch { setError(message(503)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data || busy || !dirty || stale) return;
    if (!confirmed) { setError("Confirm the official GCash instructions before saving."); return; }
    if (!window.confirm("Save payment instructions for new checkouts only? Existing agreed prices and payment recipients stay frozen.")) return;
    setBusy(true); setError(""); setNotice("");
    const payload = settingsPayload(data);
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setError(message(response.status)); if (response.status === 409) setStale(true); if (response.status === 401 || response.status === 403) { setData(null); setOpen(false); } return; }
      const result: { version: string } = await response.json();
      const saved = { ...data, version: result.version, merchant: payload.merchant };
      setData(saved); setOriginal(JSON.stringify(saved)); setOpen(false); setConfirmed(false);
      setNotice(`Saved version ${result.version}.${!payload.merchant ? " Payment checkout stays disabled until instructions are entered." : ""}`);
    } catch { setError("Could not confirm whether settings were saved. Reload before trying again; unsaved changes will be lost."); setStale(true); } finally { setBusy(false); }
  }

  return <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">Payment instructions</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">The official GCash recipient and instructions shown at checkout. Court rates and windows live in <a className="underline underline-offset-4" href="/admin/courts">Court setup</a>. Existing agreed prices and payment recipients stay frozen.</p>
    </header>
    {error && !open && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/settings">Sign in</a>}</div>}
    {notice && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</p>}
    {!data && <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Try again"}</Button>}
    {data && <>
      {stale && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">Settings changed elsewhere. <button type="button" className="underline" onClick={() => { if (window.confirm("Reload settings and discard your unsaved changes?")) void load(); }}>Reload settings</button></div>}
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold">Checkout instructions</h2><p className="text-sm text-muted-foreground">Blank disables payment checkout.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={open} onOpenChange={next => { if (!next && busy) return; setOpen(next); setError(""); setConfirmed(false); if (!next && dirty) setData(JSON.parse(original) as Snapshot); }}>
              <DialogTrigger render={<Button disabled={busy} />}>Edit instructions</DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogTitle>Edit payment instructions</DialogTitle>
                <DialogDescription>These instructions appear at checkout. Leave blank to disable payment checkout.</DialogDescription>
                <form onSubmit={save} className="space-y-4">
                  <fieldset disabled={busy} className="space-y-4">
                    <label className="block space-y-1 text-sm font-medium" htmlFor="merchant">Payment instructions<textarea id="merchant" maxLength={2000} rows={6} className="w-full rounded-md border border-input bg-background p-3 text-sm font-normal" value={data.merchant ?? ""} onChange={e => { setData(updateMerchant(e.target.value)); setConfirmed(false); }} /></label>
                    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /><span>I confirm these are the official GCash instructions, or that payment checkout should be disabled.</span></label>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={!dirty || stale || busy}>{busy ? "Saving…" : "Save instructions"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></div>
                  </fieldset>
                </form>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" disabled={busy} onClick={() => { if (!dirty || window.confirm("Reload settings and discard your unsaved changes?")) void load(); }}>Reload</Button>
          </div>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{data.merchant || "Not configured — payment checkout is disabled."}</p>
        <p className="text-xs text-muted-foreground">Version {data.version}</p>
      </section>
    </>}
  </div>;
}
