"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type QueueItem = { paymentId: string; bookingId: string; operatingDate: string; guestName: string | null; total: string; claimedReference: string | null; claimedAmount: string | null; createdAt: string; proofAvailable: boolean };
type Detail = QueueItem & { review: { note: string; reviewedAt: string; reviewedBy: string } | null };

const money = (value: string | null) => value === null ? "Not provided" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const message = (status: number) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "This exception is no longer available." : status === 409 ? "This exception was already reviewed with a different note. Reload to see the final review." : status === 400 ? "Enter a review note of 1 to 500 characters." : "Service unavailable. Please try again.";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  if (!response.ok) throw new Error(message(response.status));
  return response.json();
}

export default function ExceptionReview() {
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<{ signedUrl: string; expiresAt: number } | null>(null);
  const selection = useRef(0);
  const inflight = useRef(false);

  const loadQueue = useCallback(async () => {
    try { setQueue(await request<QueueItem[]>("/api/ethn/admin/exceptions")); }
    catch (e) { setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }
  }, []);
  useEffect(() => { void loadQueue(); }, [loadQueue]);

  async function open(item: QueueItem) {
    const sequence = ++selection.current;
    setSelected(item.paymentId); setDetail(null); setProof(null); setNote(""); setError(""); setNotice(""); setLoadingDetail(true);
    try {
      const result = await request<Detail>(`/api/ethn/admin/exceptions/${item.paymentId}`);
      if (selection.current === sequence) setDetail(result);
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

  async function submit() {
    if (!detail || busy) return;
    const trimmed = note.trim();
    if (!trimmed || trimmed.length > 500) { setError("Enter a review note of 1 to 500 characters."); return; }
    if (!window.confirm("Record this review note? The booking stays expired, the payment stays an exception, and no slot, refund or acceptance is created.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/ethn/admin/exceptions/${detail.paymentId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: trimmed }) });
      if (!response.ok) {
        setError(message(response.status));
        if (response.status === 409) await open(detail);
        if (response.status === 401 || response.status === 403) { setQueue(null); setDetail(null); }
        return;
      }
      setNotice("Review recorded. This exception is no longer in the pending queue.");
      setDetail(null); setSelected(null); setProof(null);
      await loadQueue();
    } catch { setError("Could not confirm whether the review was saved. Reload before trying again."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
    <header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">STAFF REVIEW</p><h1 className="text-3xl font-semibold tracking-tight">Late payment exceptions</h1><p className="max-w-2xl text-muted-foreground">Payments submitted after the hold expired. Reviewing evidence records your assessment only: the booking stays expired, the payment stays an exception, and nothing is restored, refunded or accepted.</p></header>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error} {error.includes("sign in") && <a className="underline" href="/login?next=/admin/exceptions">Sign in</a>}</div>}
    {notice && <p role="status" className="rounded-lg border bg-muted p-4 text-sm">{notice}</p>}
    {queue && queue.length === 0 && <p className="rounded-lg border bg-muted p-4 text-sm">No unreviewed exceptions.</p>}
    {queue && queue.length > 0 && <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">Pending review <span className="text-sm font-normal text-muted-foreground">· {queue.length}</span></h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="text-muted-foreground"><th className="pb-2 pr-3 font-medium">Operating date</th><th className="pb-2 pr-3 font-medium">Guest</th><th className="pb-2 pr-3 font-medium">Amount due</th><th className="pb-2 pr-3 font-medium">Claimed</th><th className="pb-2 pr-3 font-medium">Submitted</th><th className="pb-2 text-right font-medium"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{queue.map(item => <tr key={item.paymentId} className="border-t">
          <td className="py-2 pr-3">{item.operatingDate}</td>
          <td className="py-2 pr-3">{item.guestName ?? "Guest"}</td>
          <td className="py-2 pr-3">{money(item.total)}</td>
          <td className="py-2 pr-3">{money(item.claimedAmount)}{item.claimedReference ? <span className="block text-xs text-muted-foreground">{item.claimedReference}</span> : null}</td>
          <td className="py-2 pr-3">{dateTime(item.createdAt)}</td>
          <td className="py-2 text-right"><Button type="button" variant={selected === item.paymentId ? undefined : "outline"} disabled={busy || loadingDetail} onClick={() => void open(item)}>Review</Button></td>
        </tr>)}</tbody>
      </table></div>
    </section>}
    {loadingDetail && <p role="status" className="text-sm text-muted-foreground">Loading exception…</p>}
    {detail && <section className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{detail.operatingDate} · {money(detail.total)}</h2><p className="text-sm text-muted-foreground">{detail.guestName ?? "Guest"} · submitted {dateTime(detail.createdAt)} · booking stays expired</p></div><div className="flex gap-2">{detail.proofAvailable && <Button type="button" variant="outline" disabled={busy} onClick={() => void loadProof()}>View proof</Button>}<Button type="button" variant="outline" disabled={busy} onClick={() => { setDetail(null); setSelected(null); setProof(null); }}>Close</Button></div></div>
      {proof && (Date.now() < proof.expiresAt ? <a className="inline-block text-sm underline" href={proof.signedUrl} target="_blank" rel="noreferrer">Open private proof (expires {Math.max(0, Math.round((proof.expiresAt - Date.now()) / 1000))}s)</a> : <p className="text-sm text-muted-foreground">Proof link expired. Load it again.</p>)}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-muted-foreground">Claimed reference</dt><dd className="font-medium">{detail.claimedReference ?? "Not provided"}</dd></div><div><dt className="text-muted-foreground">Claimed amount</dt><dd className="font-medium">{money(detail.claimedAmount)}</dd></div><div><dt className="text-muted-foreground">Amount due</dt><dd className="font-medium">{money(detail.total)}</dd></div><div><dt className="text-muted-foreground">Proof attached</dt><dd className="font-medium">{detail.proofAvailable ? "Yes" : "No"}</dd></div></dl>
      {detail.review ? <div className="rounded-lg border bg-muted/40 p-4 text-sm"><p className="font-medium">Reviewed {dateTime(detail.review.reviewedAt)}</p><p className="mt-1 whitespace-pre-wrap">{detail.review.note}</p></div> : <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="review-note">Review note <span className="font-normal text-muted-foreground">· visible to staff only, 1–500 characters</span></label>
        <textarea id="review-note" rows={3} maxLength={500} className="w-full rounded-md border bg-background p-3 text-sm" value={note} onChange={e => setNote(e.target.value)} />
        <div className="flex items-center gap-3"><Button type="button" disabled={busy || !note.trim()} onClick={() => void submit()}>{busy ? "Saving…" : "Record review"}</Button><span className="text-xs text-muted-foreground">Records assessment only. No slot, refund or acceptance is created.</span></div>
      </div>}
    </section>}
    {!queue && <Button variant="outline" onClick={() => void loadQueue()}>Try again</Button>}
  </div>;
}
