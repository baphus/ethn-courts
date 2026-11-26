"use client";

import { LoadingRows } from "@/components/admin/loading-slots";
import { toast } from "sonner";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Access = { userId: string; enabled: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled for this account." : status === 404 ? "That Auth account does not exist. Create the login first, then grant access." : status === 409 ? "Rejected: at least one enabled owner must remain." : status === 400 ? "That user ID is not valid." : "Owner access services are unavailable. Please try again later.";

export default function OwnerAccessManager() {
  const [owners, setOwners] = useState<Access[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [editing, setEditing] = useState<Access | null>(null);
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ethn/admin/owner-access", { cache: "no-store" });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setOwners(null); return; }
      setOwners(((await response.json()) as { owners: Access[] }).owners);
    } catch { setError(message(503)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(next: Access) {
    if (busy) return;
    if (!uuid.test(next.userId)) { setError("Enter a valid Auth user ID (UUID)."); return; }
    if (!window.confirm(`${next.enabled ? "Grant" : "Revoke"} Owner access for ${next.userId}? This takes effect immediately.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ethn/admin/owner-access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) { if (response.status !== 400) toast.error("Owner access was not saved."); setError(message(response.status)); if (response.status === 401 || response.status === 403) setOwners(null); return; }
      toast.success("Owner access saved."); setUserId(""); setOpen(false); setEditing(null); returnFocus?.focus();
      await load();
    } catch { toast.warning("Owner access save could not be confirmed."); setError("Could not confirm whether access changed. Reload before retrying."); } finally { setBusy(false); }
  }

  return <div className="w-full space-y-5 pb-24">
    <header className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">Owner access</h1><p className="max-w-2xl text-muted-foreground">Grant or revoke Owner access for accounts that already exist in Auth. This page does not create logins or send invitations. At least one enabled owner must always remain.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/owner-access">Sign in</a>}</div>}
    {owners && <Dialog open={open} onOpenChange={next => { if (next) { setError(""); setOpen(true); } else if (!busy) { if (editing ? (enabled !== editing.enabled) : !!userId) setDiscard(true); else { setOpen(false); returnFocus?.focus(); } } }}>
        <DialogTrigger render={<Button onClick={() => { setReturnFocus(null); setEditing(null); setUserId(""); setEnabled(true); setDiscard(false); }} />}>+ Grant access</DialogTrigger>
        <DialogContent className="sm:max-w-lg"><DialogTitle>{editing ? "Edit access" : "Grant access"}</DialogTitle><DialogDescription>Access applies to existing Auth accounts only. At least one enabled owner must remain.</DialogDescription>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {discard && <div role="alert" className="space-y-2 rounded-md border p-3"><p>Close without saving? Your entries remain until you leave this page.</p><div className="flex gap-2"><Button variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button onClick={() => { setDiscard(false); setOpen(false); returnFocus?.focus(); }}>Close form</Button></div></div>}
          <label className="space-y-1 text-sm font-medium" htmlFor="new-user">Auth user ID<Input id="new-user" value={userId} onChange={e => setUserId(e.target.value)} disabled={busy || !!editing} placeholder="00000000-0000-4000-8000-000000000000" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} /></label>
          {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={e => setEnabled(e.target.checked)} /> Enabled</label>}
          <Button type="button" disabled={busy || !userId.trim()} onClick={() => void save({ userId: userId.trim().toLowerCase(), enabled })}>{busy ? "Saving…" : editing ? "Save access" : "Grant access"}</Button>
        </DialogContent>
      </Dialog>}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Current access</h2>
        {!owners ? (busy ? <LoadingRows label="Loading owner access" /> : <Button variant="outline" onClick={() => void load()}>Try again</Button>) : owners.length === 0 ? <p className="mt-2 text-sm text-muted-foreground text-center"><EmptyIcon /> No access records.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="text-muted-foreground"><th className="pb-2 pr-3 font-medium">Auth user ID</th><th className="pb-2 pr-3 font-medium">State</th><th className="pb-2 text-right font-medium"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{owners.map(row => <tr key={row.userId} className="border-t"><td className="break-all py-3 pr-3 font-mono text-xs">{row.userId}</td><td className="py-3 pr-3">{row.enabled ? "Enabled" : "Disabled"}</td><td className="py-3 text-right"><Button variant="outline" disabled={busy} onClick={event => { setReturnFocus(event.currentTarget); setDiscard(false); setEditing(row); setUserId(row.userId); setEnabled(row.enabled); setError(""); setOpen(true); }}>Edit<span className="sr-only"> access for {row.userId}</span></Button></td></tr>)}</tbody>
        </table></div>}
      </section>
  </div>;
}
