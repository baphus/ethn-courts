"use client";
import Link from "next/link";
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
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [pending, setPending] = useState<Pending | null>(null), [done, setDone] = useState(false), [now, setNow] = useState(Date.now());
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
  async function send(p: Pending) {
    setBusy(true); setError(""); setPending(p); sessionStorage.setItem(storage, JSON.stringify(p));
    try {
      const r = await fetch(`/api/ethn/admin/extensions/${p.path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.payload) });
      let result: Record<string, unknown>; try { result = await r.json(); } catch { throw new Error("Response unclear. Retry the same request; do not collect payment again."); }
      if (r.status >= 500) throw new Error("Result uncertain. Retry the same request; do not collect payment again.");
      if (!r.ok) { sessionStorage.removeItem(storage); setPending(null); await load(); throw new Error(`Request rejected: ${String(result.error || "unknown error")}. Current booking refreshed; review before proceeding.`); }
      if (p.path === "hold") {
        if (typeof result.extensionId !== "string" || typeof result.total !== "string" || typeof result.expiresAt !== "string" || typeof result.startsAt !== "string" || typeof result.endsAt !== "string" || typeof result.courtId !== "string" || result.bookingId !== id) throw new Error("Response unclear. Retry the same request; do not collect payment again.");
        setHold(result as Hold);
        await load();
      } else {
        if (result.status !== "confirmed" || result.extensionId !== p.payload.extensionId) throw new Error("Response unclear. Retry the same request; do not collect payment again.");
        setDone(true);
      }
      sessionStorage.removeItem(storage); setPending(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Connection failed. Retry the same request; do not collect payment again."); }
    finally { setBusy(false); }
  }
  function reserve() { if (!data || !availability || !start || !end) return; void send({ path: "hold", payload: { bookingId: id, courtId: court, date: data.operatingDate, start, end, settingsVersion: availability.settings.version, idempotencyKey: crypto.randomUUID() } }); }
  function confirm() { if (!hold) return; void send({ path: "confirm", payload: { extensionId: hold.extensionId, key: crypto.randomUUID(), method, collectedAmount: amount, receivedAt: new Date().toISOString(), ...(method === "gcash" ? { acceptedReference: reference } : {}), paymentReceived: true } }); }
  async function expire() {
    if (!hold) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ethn/admin/extensions/expire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extensionId: hold.extensionId }) });
      if (!response.ok) throw new Error("Could not refresh the expired hold. Try again.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not refresh the expired hold."); }
    finally { setBusy(false); }
  }
  const seconds = hold ? Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000)) : 0;
  const exactAmount = /^\d+(?:\.\d{1,2})?$/.test(amount) && /^\d+\.\d{2}$/.test(hold?.total || "") && BigInt(amount.split(".")[0]) * BigInt(100) + BigInt((amount.split(".")[1] || "").padEnd(2, "0")) === BigInt(hold!.total.replace(".", ""));
  return <main className="mx-auto max-w-3xl space-y-6 py-2"><header className="border-b pb-6"><Link href={`/admin/bookings/${id}`} className="text-sm font-semibold text-primary hover:underline">← Back to booking</Link><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Staff operations · Manila time</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Extend court time</h1><p className="mt-2 text-sm text-muted-foreground">Reserve added time before collecting payment. Original booking remains unchanged.</p></header>
  {error && <p role="alert" className="rounded-lg border border-destructive p-4 text-sm">{error}</p>}
  {!!data?.history.length&&<section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Recorded extension history</h2><p className="text-sm text-muted-foreground">Reconcile these records before collecting again after a lost request.</p><ul className="divide-y">{data.history.map(item=><li key={item.extensionId} className="py-2 text-sm">{item.extensionId} · {item.status} · {money(item.total)} · collected {item.collectedAmount?money(item.collectedAmount):'not recorded'} {item.method||''}</li>)}</ul></section>}
  {pending && <section className="rounded-xl border border-warning p-5"><h2 className="font-semibold">Request needs reconciliation</h2><p className="mt-2 text-sm">Outcome may be unknown. Retry the identical request before changing details or collecting again.</p><button className={`${button} mt-4`} disabled={busy} onClick={() => void send(pending)}>Retry same request</button></section>}
  {done ? <section className="rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">Extension confirmed</h2><p className="mt-2 text-sm">Payment and added time recorded.</p><Link href={`/admin/bookings/${id}`} className="mt-4 inline-block text-primary underline">View booking</Link></section> : !data ? <p role="status">Loading booking…</p> : hold ? <section className="space-y-5 rounded-xl border bg-card p-6"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Reserved extension</p><h2 className="mt-2 text-2xl font-semibold">{money(hold.total)}</h2><p className="mt-1 text-sm text-muted-foreground">Frozen amount · {dateTime(hold.startsAt)} – {dateTime(hold.endsAt)}</p></div><div className="text-sm"><p className="font-semibold">{hold.status === "pending" ? "Awaiting evidence review" : seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining` : "Hold expired"}</p><p className="text-muted-foreground">Expires {dateTime(hold.expiresAt)}</p></div></div><p className="text-sm">GCash instructions: {hold.merchant || "Not configured"}</p><p className="text-sm text-muted-foreground">Staff-verified payment options.</p><fieldset disabled={busy || !!pending || !seconds || hold.status === "pending"} className="space-y-4"><label className="block text-sm font-medium">Payment method<select className={field} value={method} onChange={e => setMethod(e.target.value as "cash" | "gcash")}><option value="cash">Cash</option><option value="gcash">Verified GCash</option></select></label><label className="block text-sm font-medium">Exact amount received<input className={field} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>{method === "gcash" && <label className="block text-sm font-medium">Verified GCash reference<input className={field} value={reference} onChange={e => setReference(e.target.value)} /></label>}<label className="flex gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I verified the full payment was received.</label><button className={button} disabled={!checked || !exactAmount || (method === "gcash" && (!reference.trim() || !hold.merchant))} onClick={confirm}>Confirm payment and extension</button></fieldset><ExtensionEvidence key={hold.extensionId} extensionId={hold.extensionId} total={hold.total} expiry={hold.expiresAt} pending={hold.status === "pending"} evidence={hold.evidence} onUpdated={load} />{hold.status !== "pending" && !seconds && !pending && <button className="rounded-md border px-4 py-2 text-sm font-semibold" disabled={busy} onClick={() => void expire()}>Refresh expired hold</button>}</section> : <section className="space-y-5 rounded-xl border bg-card p-6"><div><h2 className="text-xl font-semibold">Choose added time</h2><p className="mt-1 text-sm text-muted-foreground">Only courts on this booking can be extended. Start follows the latest confirmed time.</p></div><fieldset disabled={busy || !!pending || data.status !== "confirmed"} className="space-y-4"><label className="block text-sm font-medium">Court<select className={field} value={court} onChange={e => setCourt(e.target.value)}><option value="">Select court</option>{courts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{start && <p className="text-sm">Extension starts: <strong>{dateTime(start)}</strong></p>}<div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">End date<input type="date" className={field} value={endDate} onChange={e => setEndDate(e.target.value)} /></label><label className="block text-sm font-medium">End time (Manila)<input type="time" className={field} value={endTime} onChange={e => setEndTime(e.target.value)} /></label></div>{window?.hourlyRate && <p className="text-sm">Current rate: {money(window.hourlyRate)} / hour. Final total is fixed when reserved.</p>}<p className="text-sm text-muted-foreground">Availability and price are checked again when reserving.</p><button className={button} disabled={!eligible || !end || !start || end <= start || !window?.hourlyRate} onClick={reserve}>Reserve added time</button>{data.status !== "confirmed" && <p className="text-sm">Only ongoing confirmed bookings can be extended.</p>}</fieldset></section>}</main>;
}
