"use client";

import { LoadingRows } from "@/components/admin/loading-slots";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Method = { id: string; name: string; instructions: string; enabled: boolean; qrAvailable: boolean; version: string };
type Form = { id?: string; name: string; instructions: string; enabled: boolean };
const blank: Form = { name: "", instructions: "", enabled: false };

export default function OwnerPayment() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [form, setForm] = useState<Form>(blank);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [qrRetryId, setQrRetryId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/ethn/admin/payment-methods", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setMethods((await r.json()).methods);
    } catch { setError("Payment methods unavailable. Reload this page to try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function showForm(method?: Method) {
    setMode(method ? "edit" : "add");
    setForm(method ? { id: method.id, name: method.name, instructions: method.instructions, enabled: method.enabled } : blank);
    setFile(null); setDialogError(""); setQrRetryId(null); setUncertain(false); setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || uncertain || !form.name.trim() || (qrRetryId && !file)) return;
    if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 1048576 || file.size === 0)) {
      setDialogError("Choose a JPG, PNG or WebP QR image up to 1 MiB."); return;
    }
    setSaving(true); setDialogError("");
    let id = qrRetryId;
    if (!id) {
      try {
        const r = await fetch("/api/ethn/admin/payment-methods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        if (r.status >= 500) throw new Error();
        if (!r.ok) {
          if (r.status !== 400) toast.error("Payment method was not saved.");
          setDialogError("Payment method was not saved. Check details and access before retrying.");
          setSaving(false); return;
        }
        id = (await r.json()).id;
        if (!id) throw new Error();
      } catch {
        toast.warning("Payment method save could not be confirmed.");
        setDialogError("Save could not be confirmed. Close this dialog and reload this page before retrying; the method may already have been saved.");
        setUncertain(true); setSaving(false); return;
      }
    }
    if (file) {
      try {
        const body = new FormData(); body.set("file", file);
        const qr = await fetch(`/api/ethn/admin/payment-methods/${encodeURIComponent(id!)}/qr`, { method: "POST", body });
        if (qr.status >= 500) throw new Error();
        if (!qr.ok) {
          setQrRetryId(id); toast.warning("Payment method saved; QR image was not saved.");
          setDialogError("Method saved, but the QR image was not accepted. Check the image and retry the QR upload only.");
          setSaving(false); return;
        }
      } catch {
        toast.warning("Payment method saved; QR upload could not be confirmed.");
        setQrRetryId(id);
        setDialogError("Method saved, but the QR upload could not be confirmed. Retry the QR upload for this method, or close and reload this page to check it.");
        setSaving(false); return;
      }
    }
    setOpen(false); setSaving(false); toast.success(qrRetryId ? "Payment QR image saved." : file ? "Payment method and QR image saved." : "Payment method saved.");
    await load();
  }

  return <div className="w-full space-y-5 pb-24">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Payment Setup</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Manage payment methods and QR codes shown to customers. Verify recipient details before enabling a method.</p></div>
      <Button disabled={loading} onClick={() => showForm()}>Add method</Button>
    </header>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    <section aria-labelledby="payment-methods-heading" className="space-y-4">
      <h2 id="payment-methods-heading" className="font-semibold">Payment methods</h2>
      {loading ? <LoadingRows label="Loading payment methods" /> : !error && methods.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No payment methods yet. Add a method to get started.</p> : null}
      {!loading && methods.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{methods.map(m => <article key={m.id} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
        <header className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{m.name}</h3><span className={m.enabled ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>{m.enabled ? "Enabled" : "Disabled"}</span></header>
        <div className="flex-1 space-y-2">
          {m.qrAvailable && <img src={`/api/ethn/admin/payment-methods/${encodeURIComponent(m.id)}/qr?v=${encodeURIComponent(m.version)}`} alt={`${m.name} payment QR code`} loading="lazy" width={128} height={128} className="aspect-square h-auto w-32 max-w-full rounded-lg bg-white object-contain p-2" />}
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground"><strong className="font-medium text-foreground">Instructions:</strong> {m.instructions ? `“${m.instructions}”` : "None added."}</p>
        </div>
        <footer><Button variant="outline" disabled={loading} onClick={() => showForm(m)}>Edit<span className="sr-only"> {m.name}</span></Button></footer>
      </article>)}</div>}
    </section>
    <Dialog open={open} onOpenChange={next => { if (!saving) { setOpen(next); if (!next && (qrRetryId || uncertain)) void load(); } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" showCloseButton={!saving}>
        <DialogHeader><DialogTitle>{mode === "add" ? "Add payment method" : "Edit payment method"}</DialogTitle><DialogDescription>Verify recipient details before making this method available for online booking.</DialogDescription></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          {dialogError && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{dialogError}</p>}
          <fieldset disabled={saving || !!qrRetryId || uncertain} className="space-y-4 disabled:opacity-70">
            <label className="grid gap-1 text-sm font-medium">Method name<input autoFocus required maxLength={100} className="rounded-md border bg-background p-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Payment instructions<textarea maxLength={4000} rows={4} className="rounded-md border bg-background p-2" value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">QR code (optional, JPG, PNG or WebP up to 1 MiB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />Available for online booking</label>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => { setOpen(false); if (qrRetryId || uncertain) void load(); }}>Cancel</Button><Button disabled={saving || uncertain} type="submit">{saving ? "Saving…" : qrRetryId ? "Retry QR upload" : "Save method"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
