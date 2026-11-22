"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDisplayDate } from "@/lib/display-date";

type QueueItem = { bookingId: string; guestName: string | null; operatingDate: string; total: string; createdAt: string; claimedAmount: string | null };
type Payment = { method: string; status: string; claimedReference: string | null; claimedAmount: string | null; merchant: string | null; proofAvailable: boolean };
type Detail = { bookingId: string; operatingDate: string; status: string; total: string; guestName: string | null; guestEmail: string | null; guestPhone: string | null; createdAt: string; items: { court: string; startsAt: string; endsAt: string; amount: string }[]; payments: Payment[] };
type Decision = { action: "approve"; acceptedReference: string; collectedAmount: string; receivedAt: string } | { action: "reject"; reason: string };

const money = (value: string | null) => value === null ? "Not provided" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const manilaNow = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
const message = (status: number) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 409 ? "This decision conflicts with the latest record. Reload the booking before trying again." : status === 404 ? "This record is no longer available." : status === 400 ? "Check the information entered and try again." : "Service unavailable. Please try again.";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  if (!response.ok) throw new Error(message(response.status));
  return response.json();
}

export default function PaymentReview() {
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [queueFailed, setQueueFailed] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<Decision | null>(null);
  const [proof, setProof] = useState<{ signedUrl: string; expiresAt: number } | null>(null);
  const keys = useRef<Record<string, string>>({});
  const selection = useRef(0);
  const inflight = useRef(false);

  const loadQueue = useCallback(async () => {
    try { setQueue(await request<QueueItem[]>("/api/ethn/admin/payments")); setQueueFailed(false); }
    catch (e) { setQueueFailed(true); setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }
  }, []);
  useEffect(() => { void loadQueue(); }, [loadQueue]);

  async function loadDetail(id: string) {
    const sequence = ++selection.current;
    setSelected(id); setDetail(null); setProof(null); setConfirmation(null); setError(""); setLoadingDetail(true);
    try {
      const result = await request<Detail>(`/api/ethn/admin/payments/${id}`);
      if (selection.current !== sequence) return;
      setDetail(result); setReference(""); setAmount(""); setReason(""); setReceivedAt(manilaNow());
    } catch (e) { if (selection.current === sequence) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }
    finally { if (selection.current === sequence) setLoadingDetail(false); }
  }

  async function loadProof() {
    if (!detail || inflight.current) return;
    inflight.current = true; setBusy(true); setError(""); setProof(null);
    try {
      const result = await request<{ signedUrl: string; expiresIn: number }>(`/api/ethn/admin/payments/${detail.bookingId}/proof`);
      setProof({ signedUrl: result.signedUrl, expiresAt: Date.now() + result.expiresIn * 1000 });
    } catch (e) { setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }
    finally { inflight.current = false; setBusy(false); }
  }

  function prepare(action: "approve" | "reject") {
    if (!detail) return;
    setError("");
    if (action === "reject") {
      if (!reason.trim() || reason.trim().length > 500) { setError("Enter a customer-safe reason of up to 500 characters."); return; }
      setConfirmation({ action, reason: reason.trim() });
      return;
    }
    const received = new Date(`${receivedAt}:00+08:00`);
    if (!reference.trim() || !amount.trim() || !receivedAt || !Number.isFinite(received.getTime()) || received.getTime() > Date.now()) {
      setError("Enter the reference, full amount, and a valid receipt time that is not in the future."); return;
    }
    setConfirmation({ action, acceptedReference: reference.trim(), collectedAmount: amount.trim(), receivedAt: received.toISOString() });
  }

  async function decide() {
    if (!detail || !confirmation || inflight.current) return;
    inflight.current = true; setBusy(true); setError(""); setNotice("");
    const id = detail.bookingId;
    const fingerprint = JSON.stringify({ bookingId: id, ...confirmation });
    const key = keys.current[fingerprint] ??= crypto.randomUUID();
    try {
      await request(`/api/ethn/admin/payments/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ...confirmation }) });
      setConfirmation(null); setNotice("Decision recorded. Reservation and payment statuses have been refreshed.");
      await Promise.all([loadQueue(), loadDetail(id)]);
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setError(!text || text === "Failed to fetch" || text.startsWith("Service unavailable") ? "The result may be unknown. Retry this same decision or reload the booking before making changes." : text);
    } finally { inflight.current = false; setBusy(false); }
  }

  const payment = detail?.payments.length === 1 ? detail.payments[0] : undefined;
  const canDecide = detail?.status === "pending" && payment?.status === "unverified";
  const field = "grid gap-1.5 text-sm font-medium";
  return <div className="mx-auto w-full max-w-7xl space-y-6 py-2">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ETHN Courts / Staff</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Payment review</h1><p className="mt-2 text-sm text-muted-foreground">Review proof and verify payment before confirming a reservation.</p></div>
      <Button variant="outline" disabled={busy} onClick={() => { setError(""); void loadQueue(); if (selected) void loadDetail(selected); }}>Refresh</Button>
    </header>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/payments">Sign in</a>}</div>}
    {notice && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <section aria-labelledby="queue-heading" className="rounded-xl border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2"><h2 id="queue-heading" className="font-semibold">Awaiting review</h2><span className="text-xs text-muted-foreground">{queue ? `${queue.length} shown` : queueFailed ? "Unavailable" : "Loading…"}</span></div>
        {queue?.length === 0 && <p className="py-8 text-sm text-muted-foreground">No payments awaiting review.</p>}
        <ul className="mt-3 space-y-2">{queue?.map(item => <li key={item.bookingId}><button type="button" disabled={busy} onClick={() => { setNotice(""); void loadDetail(item.bookingId); }} aria-pressed={selected === item.bookingId} className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-muted disabled:opacity-50"><span className="flex justify-between gap-2 font-medium"><span className="truncate">{item.guestName || "Guest"}</span><span>{money(item.total)}</span></span><span className="mt-1 block text-xs text-muted-foreground">{formatDisplayDate(item.operatingDate)} · Submitted {dateTime(item.createdAt)}</span><span className="mt-1 block text-xs text-muted-foreground">Claimed: {money(item.claimedAmount)}</span></button></li>)}</ul>
      </section>
      <section aria-label="Payment details" className="min-w-0 rounded-xl border bg-card p-5 sm:p-6">
        {loadingDetail ? <p role="status" className="text-sm text-muted-foreground">Loading payment details…</p> : !detail ? <p className="py-8 text-sm text-muted-foreground">Select a payment to review its details.</p> : <div className="space-y-7">
          <div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reservation · {formatDisplayDate(detail.operatingDate)}</p><h2 className="mt-1 text-2xl font-semibold">{detail.guestName || "Guest"}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{detail.guestEmail || "No email"} · {detail.guestPhone || "No phone"}</p></div><div className="sm:text-right"><p className="text-sm text-muted-foreground">Frozen total</p><p className="text-xl font-semibold">{money(detail.total)}</p><p className="mt-1 text-sm">Reservation: <strong className="capitalize">{detail.status}</strong></p></div></div>
          <div><h3 className="font-semibold">Court schedule</h3><p className="mt-1 text-xs text-muted-foreground">All times are in Asia/Manila.</p><ul className="mt-3 divide-y border-y">{detail.items.map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><strong>{item.court}</strong><p className="mt-1 text-muted-foreground">{dateTime(item.startsAt)} – {dateTime(item.endsAt)}</p></div><span>{money(item.amount)}</span></li>)}</ul></div>
          <div><h3 className="font-semibold">Payment details</h3>{detail.payments.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No payment recorded.</p>}{detail.payments.map((p, index) => <div key={index} className="mt-3 grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2"><p>Payment status: <strong className="capitalize">{p.status}</strong></p><p>Method: <strong className="uppercase">{p.method}</strong></p><p>Claimed reference: <strong className="break-all">{p.claimedReference || "Not provided"}</strong></p><p>Claimed amount: <strong>{money(p.claimedAmount)}</strong></p><p className="sm:col-span-2">Merchant at booking: <strong>{p.merchant || "Not provided"}</strong></p></div>)}
            {detail.payments.some(p => p.proofAvailable) && <div className="mt-3 flex flex-wrap items-center gap-3"><Button variant="outline" disabled={busy} onClick={() => void loadProof()}>Get proof link</Button>{proof && <a href={proof.signedUrl} target="_blank" rel="noopener noreferrer" onClick={e => { if (Date.now() >= proof.expiresAt) { e.preventDefault(); setProof(null); setError("Proof link expired. Get a new link."); } }} className="text-sm font-medium text-primary underline underline-offset-4">Open proof in new tab</a>}<span className="text-xs text-muted-foreground">Link expires after 5 minutes; get a new link to refresh.</span></div>}
          </div>
          {canDecide ? <div className="space-y-5 border-t pt-6"><div><h3 className="font-semibold">Record decision</h3><p className="mt-1 text-sm text-muted-foreground">Check proof against the merchant account before recording payment. Both fields must match the claimed reference and full frozen total.</p></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className={field}>Accepted reference<Input value={reference} onChange={e => { setReference(e.target.value); setConfirmation(null); }} autoComplete="off" /></label><label className={field}>Full collected amount (PHP)<Input value={amount} onChange={e => { setAmount(e.target.value); setConfirmation(null); }} inputMode="decimal" placeholder="0.00" /></label><label className={`${field} sm:col-span-2`}>Actual payment received at (Asia/Manila)<Input type="datetime-local" value={receivedAt} onChange={e => { setReceivedAt(e.target.value); setConfirmation(null); }} /></label></div>
            <Button disabled={busy} onClick={() => prepare("approve")}>Review approval</Button>
            <div className="space-y-3 border-t pt-5"><label className={field}>Reason for rejection <span className="font-normal text-muted-foreground">Customer can see this message. Do not include internal details.</span><textarea className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" maxLength={500} value={reason} onChange={e => { setReason(e.target.value); setConfirmation(null); }} /></label><Button variant="destructive" disabled={busy} onClick={() => prepare("reject")}>Review rejection</Button></div>
            {confirmation && <div role="region" aria-label="Confirm decision" className="space-y-3 rounded-lg border border-primary/40 bg-muted p-4"><h4 className="font-semibold">Confirm {confirmation.action === "approve" ? "approval" : "rejection"}</h4>{confirmation.action === "approve" ? <p className="text-sm">Reference {confirmation.acceptedReference} · {money(confirmation.collectedAmount)} · received {dateTime(confirmation.receivedAt)} Manila time.</p> : <p className="whitespace-pre-wrap text-sm">Customer-visible reason: {confirmation.reason}</p>}<p className="text-sm">This decision is final. Check the details before continuing.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void decide()}>{busy ? "Recording…" : `Confirm ${confirmation.action === "approve" ? "approval" : "rejection"}`}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Go back</Button></div></div>}
          </div> : <p className="border-t pt-5 text-sm text-muted-foreground">No decision is available for this reservation and payment state.</p>}
        </div>}
      </section>
    </div>
  </div>;
}
