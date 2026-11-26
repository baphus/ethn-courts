"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { useDashboardResource } from "@/components/admin/dashboard/dashboard-resource";
import { LoadingRows } from "@/components/admin/loading-slots";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FinanceInfo } from "./finance-info";
import { manilaTodayStr } from "@/lib/courts";

type Correction = { id: string; previousId: string | null; amountDelta: string; cashDelta: string; gcashDelta: string; reason: string; createdAt: string };
type Sale = { id: string; description: string; note: string | null; amount: string; method: string; receivedAt: string; createdBy?: string; corrections: Correction[] };
type Pending = { url: string; body: Record<string, string | null> };
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const storageKey = "ethn-sales-pending";

export default function Sales({ from, to, onSaved }: { from: string; to: string; onSaved?: () => void }) {
  const { data, loading, error: readError, retry: retrySales } = useDashboardResource<Sale[]>(`/api/ethn/admin/sales?${new URLSearchParams({ from, to })}`);
  const sales = data ?? [];
  const [message, setMessage] = useState("");
  const [announceMessage, setAnnounceMessage] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(() => manilaTodayStr());
  const [time, setTime] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [voided, setVoided] = useState(false);
  const [target, setTarget] = useState("");
  const [targetMethod, setTargetMethod] = useState("cash");
  const [reason, setReason] = useState("");

  useEffect(() => { try { const saved = sessionStorage.getItem(storageKey); if (saved) setPending(JSON.parse(saved)); } catch { setMessage("Cannot restore retry details. Check sales before recording another."); return; } setReady(true); }, []);

  async function save(item: Pending) {
    setAnnounceMessage(true);
    try { sessionStorage.setItem(storageKey, JSON.stringify(item)); } catch { setMessage("Cannot safely save retry details. Nothing was sent."); return; }
    const retry = pending !== null;
    setPending(item); setSaving(true); setMessage(""); setAnnounceMessage(false);
    try {
      const response = await fetch(item.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
      if ([400, 401, 403, 409].includes(response.status)) {
        const conflict = response.status === 409 ? await response.json().catch(() => null) : null;
        if (response.status === 409 && conflict?.error !== "CORRECTION_CONFLICT") {
          if (conflict?.error !== "IDEMPOTENCY_MISMATCH") throw new Error();
          setMessage("Retry key conflicts with another request. Check sales before taking further action.");
          toast.error("Sale request conflicts with a previous request.");
          return;
        }
        const invalid = response.status === 400;
        let guidance = response.status === 409 ? "This sale changed. Refresh the list and review before correcting again." : invalid ? "Check the sale details and try again." : "Check your owner access before trying again.";
        if (!(retry && [401, 403].includes(response.status))) {
          try { sessionStorage.removeItem(storageKey); setPending(null); }
          catch { guidance += " Saved retry details could not be cleared. Check sales before retrying."; }
        }
        setMessage(guidance);
        setAnnounceMessage(invalid);
        if (!invalid) toast.error("Sale request was not accepted.");
        if (response.status === 409) { setSelected(null); retrySales(); }
        return;
      }
      if (!response.ok || typeof (await response.json())?.id !== "string") throw new Error();
    } catch {
      setMessage("Close the form if open, then retry the same request using the same owner account. Check the list before entering it again.");
      toast.warning("Could not confirm the sale request.");
      return;
    } finally { setSaving(false); }

    toast.success(item.url === "/api/ethn/admin/sales" ? "Sale recorded." : item.body.amount === null ? "Sale void recorded." : "Sale correction recorded.");
    setPending(null); setDescription(""); setNote(""); setAmount(""); setTime(""); setConfirmed(false); setSelected(null); setTarget(""); setReason(""); setCreateOpen(false);
    try { sessionStorage.removeItem(storageKey); }
    catch { setMessage("Saved retry details could not be cleared. If they reappear after reload, do not enter the sale again."); setAnnounceMessage(true); }
    onSaved?.();
  }
  function create(event: React.FormEvent) {
    event.preventDefault();
    setAnnounceMessage(true);
    const received = new Date(`${date}T${time}:00+08:00`);
    if (!confirmed || !time || !Number.isFinite(received.getTime()) || received.getTime() > Date.now()) { setMessage("Confirm full payment and enter an actual received date and time, not in the future."); return; }
    void save({ url: "/api/ethn/admin/sales", body: { description, note: note || null, amount, method, receivedAt: received.toISOString(), idempotencyKey: crypto.randomUUID() } });
  }
  function correct(event: React.FormEvent, sale: Sale) {
    event.preventDefault();
    setAnnounceMessage(true);
    const previousIds = new Set(sale.corrections.map(c => c.previousId));
    const leaves = sale.corrections.filter(c => !previousIds.has(c.id));
    if (sale.corrections.length && leaves.length !== 1) { setMessage("Correction history is unclear. Refresh before correcting."); return; }
    void save({ url: `/api/ethn/admin/sales/${sale.id}/corrections`, body: { amount: voided ? null : target, method: voided ? null : targetMethod, reason, expectedCorrectionId: leaves[0]?.id ?? null, idempotencyKey: crypto.randomUUID() } });
  }
  return <section id="sales" aria-label="Sales" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
    {readError && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Sales unavailable. <button type="button" className="underline" onClick={() => retrySales()}>Retry sales list</button></p>}
    {!createOpen && !selected && message && <p role={announceMessage ? "status" : undefined} className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    {pending && <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>A request may already have been saved. Retry with the same owner account; do not create another sale until you verify the result.</p><button className={button} disabled={saving} onClick={() => void save(pending)}>Retry same request</button></div>}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">Sales</h2><FinanceInfo label="About sales">Latest 200 non-booking sales by Manila receipt date.</FinanceInfo></div></div>
    <Dialog open={createOpen} onOpenChange={open => { if (open) setCreateOpen(true); else if (!saving && (!description && !note && !amount && !time && !confirmed || window.confirm("Close this form? Unsaved entries stay on this page."))) setCreateOpen(false); }}><DialogTrigger render={<Button disabled={!ready || !!pending} />}>Add sale</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogTitle>Record sale</DialogTitle><DialogDescription>Record a fully paid non-booking sale using the actual payment date and time.</DialogDescription>{message && <p role={announceMessage ? "status" : undefined} className="text-sm">{message}</p>}
    <form onSubmit={create} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <fieldset disabled={!ready || !!pending || saving} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold sm:col-span-2">Description<input className={input} required maxLength={160} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="text-sm font-semibold">Amount (₱)<input className={input} required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="text-sm font-semibold">Payment method<select className={input} value={method} onChange={e => setMethod(e.target.value)}><option value="cash">Cash</option><option value="gcash">GCash</option></select></label>
        <label className="text-sm font-semibold">Received date<input className={input} type="date" required value={date} onChange={e => setDate(e.target.value)} /></label><label className="text-sm font-semibold">Received time<input className={input} type="time" required value={time} onChange={e => setTime(e.target.value)} /></label>
        <label className="text-sm font-semibold sm:col-span-2">Note (optional)<textarea className={input} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I confirm full payment was received for this non-booking sale.</label><div><button className={button}>Record sale</button></div>
      </fieldset>
    </form></DialogContent></Dialog>
    </div>
    <div className="space-y-4">
      {!readError && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col">Sale</th><th scope="col">Original amount</th><th scope="col">Actions and history</th></tr></thead><tbody aria-busy={loading}>{loading ? <tr><td colSpan={3}><LoadingRows label="Loading sales" /></td></tr> : sales.map(sale => <tr key={sale.id} className="border-t align-top"><th scope="row" className="py-3 pr-4"><h3 className="font-bold">{sale.description}</h3><p className="text-sm text-slate-600">Received {dateTime(sale.receivedAt)} · {sale.method === "cash" ? "Cash" : "GCash"}</p>{sale.note && <p className="whitespace-pre-wrap font-normal text-muted-foreground">{sale.note}</p>}</th><td className="py-3 pr-4 tabular-nums">₱{sale.amount}</td><td className="py-3">
        {sale.corrections.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Correction history ({sale.corrections.length})</summary><div className="mt-2 space-y-2 border-t border-slate-100 pt-3">{sale.corrections.map(c => <div key={c.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p>{dateTime(c.createdAt)} · {c.reason}</p><p className="mt-1 text-slate-600">Amount change ₱{c.amountDelta} · Cash change ₱{c.cashDelta} · GCash change ₱{c.gcashDelta}</p></div>)}</div></details>}
        {<><button type="button" className="text-sm font-semibold text-orange-700 underline" disabled={!!pending} onClick={() => { setSelected(selected === sale.id ? null : sale.id); setTarget(sale.amount); setTargetMethod(sale.method); setVoided(false); setReason(""); }}>Correct entry</button>{selected === sale.id && <Dialog open onOpenChange={open => { if (!open && !saving && (!reason || window.confirm("Discard this correction draft? It has not been saved."))) {setSelected(null);setReason('');setTarget('');}; }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogTitle>Correct sale</DialogTitle><DialogDescription>{sale.description}</DialogDescription>{message && <p role={announceMessage ? "status" : undefined}>{message}</p>}<form onSubmit={e => correct(e, sale)} className="space-y-4 rounded-xl bg-orange-50 p-4"><p className="text-sm text-orange-950">Data-entry correction only, not a refund or cash movement. Original entry remains; correction is dated when saved.</p><fieldset disabled={!!pending || saving} className="space-y-3"><div className="flex flex-wrap gap-4 text-sm"><label><input type="radio" checked={!voided} onChange={() => setVoided(false)} /> Replace amount and method</label><label><input type="radio" checked={voided} onChange={() => setVoided(true)} /> Void entry</label></div>{!voided && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Correct amount (₱)<input className={input} required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" value={target} onChange={e => setTarget(e.target.value)} /></label><label className="text-sm font-semibold">Correct method<select className={input} value={targetMethod} onChange={e => setTargetMethod(e.target.value)}><option value="cash">Cash</option><option value="gcash">GCash</option></select></label></div>}<label className="block text-sm font-semibold">Reason<textarea className={input} required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><button className={button}>Save correction</button></fieldset></form></DialogContent></Dialog>}</>}
      </td></tr>)}</tbody></table></div>}
      {!loading && !readError && sales.length === 0 && <p className="text-sm text-slate-600 text-center"><EmptyIcon /> No sales to show.</p>}
    </div>
  </section>;
}
