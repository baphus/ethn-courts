"use client";

import { LoadingRows } from "@/components/admin/loading-slots";
import Link from "next/link";
import { toast } from "sonner";
import ExtensionEvidence from "./extension-evidence";
import { useEffect, useState } from "react";
import { toIso } from "@/app/admin/calendar/date-utils";
import { dateTime, money } from "../../booking-list";

type Hold = { extensionId: string; bookingId: string; courtId: string; startsAt: string; endsAt: string; total: string; expiresAt: string; merchant?: string | null; status?: string; evidence?: { proofId: string | null; claimedReference: string | null; claimedAmount: string | null; proofAvailable: boolean } | null };
type Data = { history:{extensionId:string;status:string;total:string;collectedAmount:string|null;method:string|null;receivedAt:string|null}[]; status: string; operatingDate: string; items: { courtId: string; courtName: string; startsAt: string; endsAt: string }[]; active: Hold | null };
type Availability = { settings: { version: string }; courts: { id: string; windows: { opensAt: string; closesAt: string; hourlyRate: string | null }[]; occupied: { startsAt: string; endsAt: string }[] }[] };
type Pending = { path: string; payload: Record<string, unknown> };
const button = "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const field = "mt-1 w-full rounded-md border bg-background px-3 py-2";
export default function ExtensionClient({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null), [availability, setAvailability] = useState<Availability | null>(null), [hold, setHold] = useState<Hold | null>(null);
  const [court, setCourt] = useState(""), [endDate, setEndDate] = useState(""), [endTime, setEndTime] = useState(""), [method, setMethod] = useState<"cash" | "gcash">("cash"), [amount, setAmount] = useState(""), [reference, setReference] = useState(""), [checked, setChecked] = useState(false);
  const [notice, setNotice] = useState({ message: "", announce: true }), [busy, setBusy] = useState(false), [pending, setPending] = useState<Pending | null>(null), [done, setDone] = useState(false), [now, setNow] = useState(Date.now());
  const setError = (message: string, announce = true) => setNotice({ message, announce });
  const [reloadRequired, setReloadRequired] = useState(false);
  const storage = `ethn-extension-${id}`;
  async function load() {
    const r = await fetch(`/api/ethn/admin/extensions?bookingId=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) throw new Error("Unable to load extension details.");
    const d: Data = await r.json(); setData(d); setHold(d.active);
    const a = await fetch(`/api/ethn/availability?date=${encodeURIComponent(d.operatingDate)}`, { cache: "no-store" });
    if (!a.ok) throw new Error("Unable to load availability.");
    setAvailability(await a.json());
  }
  useEffect(() => { try { const saved = sessionStorage.getItem(storage); if (saved) setPending(JSON.parse(saved)); } catch { setError("Could not restore the last request. Check booking before collecting payment."); } void load().catch(e => setError(e.message)); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const courts = data ? [...new Map(data.items.map(i => [i.courtId, i.courtName])).entries()] : [];
  const start = data && court ? data.items.filter(i => i.courtId === court).reduce((a, i) => i.endsAt > a ? i.endsAt : a, "") : "";
  const end = toIso(endDate, endTime);
  const window = availability?.courts.find(c => c.id === court)?.windows.find(w => start >= w.opensAt && end && end <= w.closesAt);
  const eligible = data?.status === "confirmed" && data.items.some(i => Date.parse(i.startsAt) <= now) && !!start && Date.parse(start) > now;
  async function refresh(message: string) {
    try { await load(); }
    catch { setReloadRequired(true); setError(`${message} Reload for current details before proceeding.`); }
  }
  async function send(p: Pending) {
    setBusy(true); setError("");
    try { sessionStorage.setItem(storage, JSON.stringify(p)); }
    catch {
      setBusy(false); setError("Could not save the retry request. No new request was sent.", false);
      toast.error("Extension request not sent.", { description: "Could not save the retry request." });
      return;
    }
    setPending(p);
    let accepted: boolean;
    try {
      const r = await fetch(`/api/ethn/admin/extensions/${p.path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.payload) });
      if (r.status >= 500) throw Error();
      accepted = r.ok;
      if (accepted) {
        const result = await r.json();
        if (p.path === "hold") {
          if (typeof result.extensionId !== "string" || typeof result.total !== "string" || typeof result.expiresAt !== "string" || typeof result.startsAt !== "string" || typeof result.endsAt !== "string" || typeof result.courtId !== "string" || result.bookingId !== id) throw Error();
          setHold(result as Hold);
        } else {
          if (result.status !== "confirmed" || result.extensionId !== p.payload.extensionId) throw Error();
          setDone(true);
        }
      } else {
        setError("Extension request rejected. Review current details before retrying.", r.status === 400);
        if (r.status !== 400) toast.error("Extension request rejected.", { description: "Check the booking before retrying." });
      }
    } catch {
      setBusy(false);
      setError("Extension result uncertain. Retry the same request or check the booking. Do not collect payment again.", false);
      toast.warning("Extension result not confirmed.", { description: "Check the booking before collecting payment again." });
      return;
    }
    if (accepted) toast.success(p.path === "hold" ? "Added time held. Extension not yet confirmed." : "Extension confirmed and payment recorded.");
    setPending(null);
    try { sessionStorage.removeItem(storage); }
    catch { setError("Could not clear the saved retry request. Check the booking before retrying."); }
    if (!accepted || p.path === "hold") await refresh(accepted ? "Added time was held, but current details could not be refreshed." : "Extension request was rejected and current details could not be refreshed.");
    setBusy(false);
  }
  function reserve() { if (!data || !availability || !start || !end) return; void send({ path: "hold", payload: { bookingId: id, courtId: court, date: data.operatingDate, start, end, settingsVersion: availability.settings.version, idempotencyKey: crypto.randomUUID() } }); }
  function confirm() { if (!hold) return; void send({ path: "confirm", payload: { extensionId: hold.extensionId, key: crypto.randomUUID(), method, collectedAmount: amount, receivedAt: new Date().toISOString(), ...(method === "gcash" ? { acceptedReference: reference } : {}), paymentReceived: true } }); }
  async function expire() {
    if (!hold) return;
    setBusy(true); setError("");
    let status: string;
    try {
      const response = await fetch("/api/ethn/admin/extensions/expire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extensionId: hold.extensionId }) });
      if (response.status >= 500) throw Error();
      if (!response.ok) {
        setBusy(false);
        setError("Could not clear the expired hold. Check the booking before retrying.", response.status === 400);
        if (response.status !== 400) toast.error("Could not clear the expired hold.", { description: "Check the booking before retrying." });
        return;
      }
      const result = await response.json();
      if (result?.extensionId !== hold.extensionId || typeof result.status !== "string") throw Error();
      status = result.status;
    } catch {
      setBusy(false);
      setError("Hold clearance uncertain. Check the booking before retrying.", false);
      toast.warning("Hold clearance not confirmed.", { description: "Check the booking before retrying." });
      return;
    }
    if (status === "expired") toast.success("Extension hold cleared.");
    else {
      setError("Hold not cleared. Review the current extension status.", false);
      toast.info("Hold not cleared.", { description: "Check the current extension status." });
    }
    await refresh(status === "expired" ? "Hold cleared, but current details could not be refreshed." : "Current extension details could not be refreshed.");
    setBusy(false);
  }
  const seconds = hold ? Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000)) : 0;
  const exactAmount = /^\d+(?:\.\d{1,2})?$/.test(amount) && /^\d+\.\d{2}$/.test(hold?.total || "") && BigInt(amount.split(".")[0]) * BigInt(100) + BigInt((amount.split(".")[1] || "").padEnd(2, "0")) === BigInt(hold!.total.replace(".", ""));
  return <main className="w-full space-y-5 pb-24"><header className="border-b pb-6"><Link href={`/admin/bookings/${id}`} className="text-sm font-semibold text-primary hover:underline">← Back to booking</Link><h1 className="mt-5 text-2xl font-semibold tracking-tight">Extend court time</h1><p className="mt-2 text-sm text-muted-foreground">Reserve added time before collecting payment. Original booking remains unchanged.</p></header>
  {notice.message && <p role={notice.announce ? "alert" : undefined} className="rounded-lg border border-destructive p-4 text-sm">{notice.message}</p>}
  {!!data?.history.length&&<section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Recorded extension history</h2><p className="text-sm text-muted-foreground">Reconcile these records before collecting again after a lost request.</p><ul className="divide-y">{data.history.map(item=><li key={item.extensionId} className="py-2 text-sm">{item.extensionId} · {item.status} · {money(item.total)} · collected {item.collectedAmount?money(item.collectedAmount):'not recorded'} {item.method||''}</li>)}</ul></section>}
  {pending && <section className="rounded-xl border border-warning p-5"><h2 className="font-semibold">Request needs reconciliation</h2><p className="mt-2 text-sm">Outcome may be unknown. Retry the identical request before changing details or collecting again.</p><button className={`${button} mt-4`} disabled={busy} onClick={() => void send(pending)}>Retry same request</button></section>}
  {done ? <section className="rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">Extension confirmed</h2><p className="mt-2 text-sm">Payment and added time recorded.</p><Link href={`/admin/bookings/${id}`} className="mt-4 inline-block text-primary underline">View booking</Link></section> : !data ? <LoadingRows label="Loading booking" /> : hold ? <section className="space-y-5 rounded-xl border bg-card p-6"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-2xl font-semibold">Reserved extension</h2><p className="mt-1 text-sm text-muted-foreground">Frozen amount: {money(hold.total)} · {dateTime(hold.startsAt)} – {dateTime(hold.endsAt)}</p></div><div className="text-sm"><p className="font-semibold">{hold.status === "pending" ? "Awaiting evidence review" : seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining` : "Hold expired"}</p><p className="text-muted-foreground">Expires {dateTime(hold.expiresAt)}</p></div></div><p className="text-sm">GCash instructions: {hold.merchant || "Not configured"}</p><p className="text-sm text-muted-foreground">Staff-verified payment options.</p><fieldset disabled={busy || reloadRequired || !!pending || !seconds || hold.status === "pending"} className="space-y-4"><label className="block text-sm font-medium">Payment method<select className={field} value={method} onChange={e => setMethod(e.target.value as "cash" | "gcash")}><option value="cash">Cash</option><option value="gcash">Verified GCash</option></select></label><label className="block text-sm font-medium">Exact amount received<input className={field} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>{method === "gcash" && <label className="block text-sm font-medium">Verified GCash reference<input className={field} value={reference} onChange={e => setReference(e.target.value)} /></label>}<label className="flex gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I verified the full payment was received.</label><button className={button} disabled={!checked || !exactAmount || (method === "gcash" && (!reference.trim() || !hold.merchant))} onClick={confirm}>Confirm payment and extension</button></fieldset><fieldset disabled={busy || reloadRequired || !!pending} className="min-w-0"><ExtensionEvidence key={hold.extensionId} extensionId={hold.extensionId} total={hold.total} expiry={hold.expiresAt} pending={hold.status === "pending"} evidence={hold.evidence} onUpdated={() => refresh("Evidence action recorded, but current details could not be refreshed.")} /></fieldset>{hold.status !== "pending" && !seconds && !pending && <button className="rounded-md border px-4 py-2 text-sm font-semibold" disabled={busy || reloadRequired} onClick={() => void expire()}>Clear expired hold</button>}</section> : <section className="space-y-5 rounded-xl border bg-card p-6"><div><h2 className="text-xl font-semibold">Choose added time</h2><p className="mt-1 text-sm text-muted-foreground">Only courts on this booking can be extended. Start follows the latest confirmed time.</p></div><fieldset disabled={busy || reloadRequired || !!pending || data.status !== "confirmed"} className="space-y-4"><label className="block text-sm font-medium">Court<select className={field} value={court} onChange={e => setCourt(e.target.value)}><option value="">Select court</option>{courts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{start && <p className="text-sm">Extension starts: <strong>{dateTime(start)}</strong></p>}<div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">End date<input type="date" className={field} value={endDate} onChange={e => setEndDate(e.target.value)} /></label><label className="block text-sm font-medium">End time<input type="time" className={field} value={endTime} onChange={e => setEndTime(e.target.value)} /></label></div>{window?.hourlyRate && <p className="text-sm">Current rate: {money(window.hourlyRate)} / hour. Final total is fixed when reserved.</p>}<p className="text-sm text-muted-foreground">Availability and price are checked again when reserving.</p><button className={button} disabled={!eligible || !end || !start || end <= start || !window?.hourlyRate} onClick={reserve}>Reserve added time</button>{data.status !== "confirmed" && <p className="text-sm">Only ongoing confirmed bookings can be extended.</p>}</fieldset></section>}</main>;
}
