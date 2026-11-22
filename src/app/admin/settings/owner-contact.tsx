"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Values = { version: string; facebook: string; phone: string; email: string };
export default function OwnerContact() {
  const [values, setValues] = useState<Values | null>(null), [busy, setBusy] = useState(true), [message, setMessage] = useState(""), [stale, setStale] = useState(false);
  const load = useCallback(async () => { setBusy(true); setMessage(""); try { const r = await fetch("/api/ethn/admin/contact", { cache: "no-store" }); if (!r.ok) throw new Error(); setValues(await r.json()); setStale(false); } catch { setValues(null); setMessage("Contact settings are unavailable. Try again."); } finally { setBusy(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!values || busy || stale) return; setBusy(true); setMessage("");
    try { const r = await fetch("/api/ethn/admin/contact", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      if (r.status === 409) { setStale(true); setMessage("Settings changed elsewhere. Reload before saving; your edits will be lost."); return; }
      if (!r.ok) { setMessage(r.status === 400 ? "Check the Facebook URL, phone number and email address." : "Could not save contact settings. Check your access and try again."); return; }
      const result = await r.json(); setValues({ ...values, version: result.version, facebook: values.facebook.trim(), phone: values.phone.trim(), email: values.email.trim() }); setMessage("Contact details saved.");
    } catch { setStale(true); setMessage("Could not confirm the save. Reload before trying again; your edits will be lost."); } finally { setBusy(false); }
  }
  return <section className="mx-auto mb-8 w-full max-w-4xl rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Public contact details</h2><p className="mt-1 text-sm text-muted-foreground">Shown on the contact page. Leave fields blank to hide them. Email enables visitors to open a message in their email app.</p>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {!values ? <Button className="mt-4" variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Try again"}</Button> : <form onSubmit={save} className="mt-4 space-y-4"><fieldset disabled={busy || stale} className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium sm:col-span-2">Facebook page URL<input type="url" maxLength={500} placeholder="https://www.facebook.com/yourpage" value={values.facebook} onChange={e => setValues({ ...values, facebook: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background p-3 font-normal" /></label>
      <label className="block text-sm font-medium">Phone number<input type="tel" maxLength={40} value={values.phone} onChange={e => setValues({ ...values, phone: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background p-3 font-normal" /></label>
      <label className="block text-sm font-medium">Owner email<input type="email" maxLength={254} value={values.email} onChange={e => setValues({ ...values, email: e.target.value })} className="mt-1 block w-full rounded-md border border-input bg-background p-3 font-normal" /></label>
      <div><Button type="submit">{busy ? "Saving…" : "Save contact details"}</Button></div>
    </fieldset>{stale && <Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm("Reload and discard your edits?")) void load(); }}>Reload settings</Button>}</form>}
  </section>;
}
