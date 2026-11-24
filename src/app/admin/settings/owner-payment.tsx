"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Method = { id: string; name: string; instructions: string; enabled: boolean; qrAvailable: boolean; version: string };
const blank = { name: "", instructions: "", enabled: true };
export default function OwnerPayment() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [form, setForm] = useState<{id?: string; name: string; instructions: string; enabled: boolean}>(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setBusy(true); setError("");
    try { const r = await fetch("/api/ethn/admin/payment-methods", { cache: "no-store" }); if (!r.ok) throw new Error(); setMethods((await r.json()).methods); }
    catch { setError("Payment methods unavailable. Reload to try again."); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (busy || !form.name.trim()) return;
    if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1048576 || file.size === 0)) { setError("Choose a JPG, PNG or WebP QR image up to 1 MiB."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/ethn/admin/payment-methods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error(); const { id } = await r.json();
      if (file) { const body = new FormData(); body.set("file", file); const qr = await fetch(`/api/ethn/admin/payment-methods/${encodeURIComponent(id)}/qr`, { method: "POST", body }); if (!qr.ok) { setForm({ ...form, id }); throw new Error(); } }
      setForm(blank); setFile(null); setNotice("Payment method saved."); await load();
    } catch { setError("Save could not be confirmed. Reload methods before retrying; a method or QR may already have been saved."); } finally { setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-4xl space-y-6 pb-12"><header><h1 className="text-2xl font-semibold">Payment instructions</h1><p className="mt-2 text-sm text-muted-foreground">Manage payment methods and QR codes shown to customers. Verify recipient details before enabling a method.</p></header>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <section className="space-y-3 rounded-xl border bg-card p-5"><div className="flex justify-between gap-3"><h2 className="font-semibold">Payment methods</h2><Button variant="outline" disabled={busy} onClick={() => void load()}>Reload</Button></div>{methods.length === 0 && <p className="text-sm text-muted-foreground">No methods available.</p>}{methods.map(m => <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 border-t pt-3"><div><p className="font-medium">{m.name} <span className="text-xs text-muted-foreground">{m.enabled ? "Enabled" : "Disabled"} · {m.qrAvailable ? "QR available" : "No QR"}</span></p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{m.instructions}</p></div><Button variant="outline" disabled={busy} onClick={() => { setForm({ id:m.id, name:m.name, instructions:m.instructions, enabled:m.enabled }); setFile(null); setNotice(""); }}>Edit</Button></div>)}</section>
    <form onSubmit={save} className="space-y-4 rounded-xl border bg-card p-5"><h2 className="font-semibold">{form.id ? "Edit method" : "Add method"}</h2><label className="grid gap-1 text-sm font-medium">Method name<input required maxLength={100} className="rounded-md border bg-background p-2" value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></label><label className="grid gap-1 text-sm font-medium">Payment instructions<textarea maxLength={4000} rows={4} className="rounded-md border bg-background p-2" value={form.instructions} onChange={e => setForm({...form,instructions:e.target.value})} /></label><label className="grid gap-1 text-sm font-medium">QR code (optional, JPG, PNG or WebP up to 1 MiB)<input key={form.id || "new"} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({...form,enabled:e.target.checked})} />Available for online booking</label><div className="flex gap-2"><Button disabled={busy} type="submit">{busy ? "Saving…" : "Save method"}</Button>{form.id && <Button type="button" variant="outline" onClick={() => { setForm(blank); setFile(null); }}>Add another</Button>}</div></form></div>;
}
