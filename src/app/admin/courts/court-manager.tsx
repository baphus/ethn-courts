"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Court = { id: string; name: string; description: string | null; active: boolean };
type Payload = { name: string; description: string; idempotencyKey: string };
const endpoint = "/api/ethn/admin/courts";
function isCourt(value: unknown): value is Court {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.name === "string" && (typeof c.description === "string" || c.description === null) && typeof c.active === "boolean";
}

export default function CourtManager() {
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isCourt)) throw new Error();
      setCourts(data);
    } catch { setError("Could not load courts. Try again."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const payload = pending ?? { name, description, idempotencyKey: crypto.randomUUID() };
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const code = result && typeof result === "object" && "error" in result ? result.error : null;
        if (response.status === 409 && code === "NAME_COLLISION") { setPending(null); setError("A court with this name already exists. Choose another name."); }
        else if (response.status === 409 && code === "IDEMPOTENCY_MISMATCH") { setPending(payload); setError("This request key was already used with different details. Do not create a new request; contact support."); }
        else if (pending) { setPending(payload); setError("Retry was not accepted. Sign in with the same owner account, then retry this exact request."); }
        else setError(response.status === 401 ? "Your session ended. Sign in and try again." : response.status === 403 ? "Owner access is required." : "Could not create court. Check your details and try again.");
        return;
      }
      const result: unknown = await response.json();
      if (!isCourt(result) || result.active) throw new Error();
      setPending(null); setName(""); setDescription(""); setOpen(false); setNotice(`${result.name} created inactive. Configure hours and rates before enabling bookings.`);
      await load();
    } catch {
      setPending(payload);
      setError("Could not confirm whether the court was created. Retry this exact request using the same owner account. Do not change accounts or create another request.");
    } finally { setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
    <header className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Courts</h1><p className="max-w-2xl text-muted-foreground">View your courts and add a new space for bookings.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</div>}
    {notice && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</p>}
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={next => { if (next) { setError(""); setOpen(true); } else if (!busy && !pending) { if (name || description) setDiscard(true); else setOpen(false); } }}><DialogTrigger render={<Button />}>+ Add court</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogTitle>Add court</DialogTitle><DialogDescription>New courts start inactive. Configure hours and rates before enabling bookings.</DialogDescription>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{discard && <div role="alert" className="space-y-2 rounded-md border p-3"><p>Close this form? Your entries remain available until you leave this page.</p><div className="flex gap-2"><Button variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button onClick={() => { setDiscard(false); setOpen(false); }}>Close form</Button></div></div>}
      <section className="h-fit space-y-4 rounded-xl border bg-muted/30 p-5"><div><h2 className="text-xl font-semibold">Add a court</h2><p className="mt-1 text-sm text-muted-foreground">New courts start inactive with no hours. Checkout stays disabled until hours and rates are configured and the court is activated.</p></div><p className="text-sm"><a className="underline underline-offset-4" href="/admin/hours">Court hours</a><span className="text-muted-foreground"> · </span><a className="underline underline-offset-4" href="/admin/settings">Settings</a></p>
        <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy || pending !== null} className="space-y-4"><label className="block space-y-1 text-sm font-medium"><span>Court name</span><Input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label><label className="block space-y-1 text-sm font-medium"><span>Description <span className="font-normal text-muted-foreground">(optional)</span></span><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} /></label></fieldset><Button type="submit" disabled={busy}>{busy ? "Saving…" : pending ? "Retry same request" : "Create inactive court"}</Button>{pending && <p className="text-sm text-muted-foreground">Details are locked while the outcome is uncertain. Retry with the same owner account. Leaving this page loses the retry request.</p>}</form>
      </section></DialogContent></Dialog>
      <section className="space-y-4"><div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Your courts</h2><p className="text-sm text-muted-foreground">Current booking spaces</p></div><Button type="button" variant="outline" onClick={() => { setError(""); void load(); }}>Refresh</Button></div>
        {courts === null ? <p className="text-sm text-muted-foreground">Courts not loaded.</p> : courts.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No courts yet. Add your first court to get started.</p> : <ul className="space-y-3">{courts.map(court => <li key={court.id} className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-semibold">{court.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${court.active ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"}`}>{court.active ? "Active" : "Inactive"}</span></div><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{court.description || "No description"}</p></li>)}</ul>}
      </section>

    </div>
  </div>;
}
