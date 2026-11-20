"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Role = "owner" | "staff";
type Access = { userId: string; role: Role; enabled: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const message = (status: number) => status === 401 ? "Your session ended. Please sign in again." : status === 403 ? "Owner access is no longer enabled for this account." : status === 404 ? "That Auth account does not exist. Create the login first, then grant access." : status === 409 ? "Rejected: at least one enabled owner must remain." : status === 400 ? "That user ID is not valid." : "Staff services are unavailable. Please try again later.";

function EditRow({ access, busy, onSave }: { access: Access; busy: boolean; onSave: (next: Access) => Promise<void> }) {
  const [role, setRole] = useState<Role>(access.role);
  const [enabled, setEnabled] = useState(access.enabled);
  const changed = role !== access.role || enabled !== access.enabled;
  return <tr className="border-t align-middle">
    <td className="break-all py-2 pr-3 font-mono text-xs">{access.userId}</td>
    <td className="py-2 pr-3"><label className="sr-only" htmlFor={`role-${access.userId}`}>Role for {access.userId}</label>
      <select id={`role-${access.userId}`} className="rounded-md border bg-background px-2 py-1 text-sm" value={role} onChange={e => setRole(e.target.value as Role)} disabled={busy}>
        <option value="staff">Staff</option><option value="owner">Owner</option>
      </select></td>
    <td className="py-2 pr-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={busy} />Enabled</label></td>
    <td className="py-2 text-right"><Button type="button" variant="outline" disabled={busy || !changed} onClick={() => void onSave({ userId: access.userId, role, enabled })}>Save</Button></td>
  </tr>;
}

export default function StaffManager() {
  const [staff, setStaff] = useState<Access[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Role>("staff");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ethn/admin/staff", { cache: "no-store" });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setStaff(null); return; }
      setStaff(((await response.json()) as { staff: Access[] }).staff);
    } catch { setError(message(503)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(next: Access) {
    if (busy) return;
    if (!uuid.test(next.userId)) { setError("Enter a valid Auth user ID (UUID)."); return; }
    if (!window.confirm(`Set ${next.userId} to ${next.role}, ${next.enabled ? "enabled" : "disabled"}? This takes effect immediately.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ethn/admin/staff", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) { setError(message(response.status)); if (response.status === 401 || response.status === 403) setStaff(null); return; }
      setNotice(`Access saved for ${next.userId}.`); setUserId("");
      await load();
    } catch { setError(message(503)); } finally { setBusy(false); }
  }

  return <div className="mx-auto w-full max-w-4xl space-y-6 pb-12">
    <header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">OWNER SETTINGS</p><h1 className="text-3xl font-semibold tracking-tight">Staff access</h1><p className="max-w-2xl text-muted-foreground">Grant or revoke staff access for accounts that already exist in Auth. This page does not create logins or send invitations. At least one enabled owner must always remain.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/staff">Sign in</a>}</div>}
    {notice && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</p>}
    {!staff && <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Try again"}</Button>}
    {staff && <>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Current access</h2>
        {staff.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No staff records.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="text-muted-foreground"><th className="pb-2 pr-3 font-medium">Auth user ID</th><th className="pb-2 pr-3 font-medium">Role</th><th className="pb-2 pr-3 font-medium">State</th><th className="pb-2 text-right font-medium"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{staff.map(row => <EditRow key={`${row.userId}:${row.role}:${row.enabled}`} access={row} busy={busy} onSave={save} />)}</tbody>
        </table></div>}
      </section>
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div><h2 className="text-lg font-semibold">Add access</h2><p className="text-sm text-muted-foreground">Paste the Auth user ID of an existing account. Granting an unknown ID is rejected.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 space-y-1 text-sm font-medium" htmlFor="new-user">Auth user ID<Input id="new-user" value={userId} onChange={e => setUserId(e.target.value)} placeholder="00000000-0000-4000-8000-000000000000" autoComplete="off" spellCheck={false} /></label>
          <label className="space-y-1 text-sm font-medium" htmlFor="new-role">Role<select id="new-role" className="block rounded-md border bg-background px-2 py-2 text-sm" value={role} onChange={e => setRole(e.target.value as Role)}><option value="staff">Staff</option><option value="owner">Owner</option></select></label>
          <Button type="button" disabled={busy || !userId.trim()} onClick={() => void save({ userId: userId.trim().toLowerCase(), role, enabled: true })}>Grant access</Button>
        </div>
      </section>
    </>}
  </div>;
}
