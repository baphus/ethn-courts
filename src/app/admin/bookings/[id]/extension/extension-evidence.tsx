"use client";
import { manilaDateStr } from '@/lib/booking/slots';
import { useState } from "react";
import { toast } from "sonner";

type Evidence = { proofId: string | null; claimedReference: string | null; claimedAmount: string | null; proofAvailable: boolean };
type Props = { extensionId: string; total: string; expiry: string; pending: boolean; evidence?: Evidence | null; onUpdated: () => Promise<void> };
type RequestData = { path: string; payload: Record<string, unknown> };
const field = "mt-1 w-full rounded-md border bg-background px-3 py-2";
const button = "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
async function post(path: string, payload: Record<string, unknown>) {
  const r = await fetch(`/api/ethn/admin/extensions/proofs/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw Object.assign(new Error(), { status: r.status });
  return r.json();
}
export default function ExtensionEvidence({ extensionId, total, expiry, pending, evidence, onUpdated }: Props) {
  const [file, setFile] = useState<File | null>(null), [reference, setReference] = useState(""), [claim, setClaim] = useState(total), [accepted, setAccepted] = useState(evidence?.claimedReference || ""), [amount, setAmount] = useState(total), [received, setReceived] = useState(() => { const now = new Date(); return `${manilaDateStr(now)}T${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hour12:false}).format(now)}`; }), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState({ message: "", announce: true }), [proof, setProof] = useState<{ signedUrl: string; expiresAt: number } | null>(null);
  const setError = (message: string, announce = true) => setNotice({ message, announce });
  const [reservation, setReservation] = useState<{ key: string; proofId?: string; signature: string } | null>(null), [request, setRequest] = useState<RequestData | null>(null);
  function failure(e: unknown, uncertain: string, submitted = false) {
    const status = e && typeof e === "object" && "status" in e ? e.status : null;
    if (typeof status === "number" && status < 500) {
      setRequest(null);
      setError(submitted ? "Image uploaded, but proof was not submitted. Review entered values and refresh the booking before retrying." : "Request rejected. Review entered values and refresh the booking before submitting again.", status === 400);
      if (status !== 400) toast.error(submitted ? "Proof submission rejected after upload." : "Extension proof action rejected.", { description: "Review the evidence before retrying." });
    } else {
      setError(uncertain, false);
      toast.warning(submitted ? "Image uploaded. Proof submission not confirmed." : "Extension proof action not confirmed.", { description: "Check the booking before retrying or collecting payment again." });
    }
  }
  async function run(r: RequestData, uploaded = false) {
    setRequest(r); setBusy(true); setError("");
    let status: string;
    try {
      const result = await post(r.path, r.payload);
      status = result?.status;
      if (result?.extensionId !== extensionId || !(r.path === "submit" ? status === "pending" || status === "exception" : r.path === "approve" ? status === "confirmed" : status === "rejected")) throw Error();
    } catch (e) {
      failure(e, uploaded ? "Image uploaded, but proof submission is uncertain. Check the booking or retry the same submission. Do not collect payment again." : "Outcome uncertain. Refresh the booking and review evidence before retrying the same request. Do not collect payment again.", uploaded);
      setBusy(false);
      return;
    }
    setRequest(null);
    if (status === "exception") toast.warning("Late proof recorded. Added time is not reserved.");
    else if (status === "pending") toast.success("Extension proof submitted for review.");
    else if (status === "confirmed") toast.success("Extension payment approved and added time confirmed.");
    else toast.success("Extension proof rejected.");
    try { await onUpdated(); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP image up to 5 MiB."); return; }
    if (!reference.trim() || !claim.trim()) { setError("Enter the claimed reference and amount."); return; }
    setBusy(true); setError("");
    const signature = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
    let saved = reservation?.signature === signature ? reservation : { key: crypto.randomUUID(), signature };
    setReservation(saved);
    let next: RequestData;
    try {
      if (!saved.proofId) { const result = await post("reserve", { extensionId, mimeType: file.type, byteSize: file.size, key: saved.key }); saved = { ...saved, proofId: result.proofId }; setReservation(saved); }
      if (!saved.proofId) throw new Error();
      const signed = await post("sign", { extensionId, proofId: saved.proofId });
      next = request?.path === "submit" && request.payload.proofId === saved.proofId ? request : { path: "submit", payload: { extensionId, proofId: saved.proofId, key: crypto.randomUUID(), claimedReference: reference, claimedAmount: claim } };
      setRequest(next);
      const uploaded = await fetch(signed.signedUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!uploaded.ok) throw Error();
    } catch (e) {
      failure(e, "Upload or reservation outcome uncertain. Retry with the same image, or refresh the booking to reconcile. No payment is collected by submission.");
      setBusy(false);
      return;
    }
    await run(next, true);
  }
  async function openProof() {
    setBusy(true); setError(""); setProof(null);
    try { const r = await fetch(`/api/ethn/admin/extensions/proofs/proof?extensionId=${encodeURIComponent(extensionId)}`, { cache: "no-store" }); if (!r.ok) throw new Error(); const result = await r.json(); setProof({ signedUrl: result.signedUrl, expiresAt: Date.now() + result.expiresIn * 1000 }); }
    catch { setError("Proof unavailable. Refresh the booking and try again."); } finally { setBusy(false); }
  }
  function decide(path: "approve" | "reject") {
    if (path === "approve") {
      const date = new Date(`${received}:00+08:00`); if (!accepted.trim() || !amount.trim() || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()) { setError("Enter reference, exact amount and a received time not in the future."); return; }
      void run({ path, payload: { extensionId, key: crypto.randomUUID(), receivedAt: date.toISOString(), amount, acceptedReference: accepted } });
    } else { if (!reason.trim()) { setError("Enter a rejection reason."); return; } void run({ path, payload: { extensionId, key: crypto.randomUUID(), reason } }); }
  }
  return <section className="space-y-4 rounded-lg border bg-muted/30 p-4"><div><h3 className="font-semibold">GCash proof {pending ? "awaiting review" : "submission"}</h3><p className="mt-1 text-sm text-muted-foreground">A claim is not collected payment. Pending evidence holds only the added time; the original booking stays unchanged. Late exceptions do not reserve a slot.</p></div>
    {notice.message && <p role={notice.announce ? "alert" : undefined} className="text-sm text-destructive">{notice.message}</p>}
    {request && <div className="space-y-2 rounded-md border border-warning p-3 text-sm"><p>Request needs reconciliation. Reload this page to check the booking before retrying unchanged details.</p><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void run(request)}>Retry same request</button>{request.path === "submit" && file && <button className="rounded-md border px-3 py-2" disabled={busy} onClick={() => void upload()}>Retry upload with same image</button>}</div></div>}
    {pending ? <><p className="text-sm">Claimed amount: {evidence?.claimedAmount || "Not recorded"} · Claimed reference: {evidence?.claimedReference || "Not recorded"}</p>{evidence?.proofAvailable && <div className="space-x-3 text-sm"><button className="rounded-md border px-3 py-2" disabled={busy} onClick={() => void openProof()}>Get private proof link</button>{proof && <a href={proof.signedUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline" onClick={e => { if (Date.now() >= proof.expiresAt) { e.preventDefault(); setProof(null); setError("Link expired. Get a new proof link."); } }}>Open proof</a>}</div>}
    <fieldset disabled={busy || !!request} className="space-y-3"><label className="block text-sm">Accepted reference<input className={field} value={accepted} onChange={e => setAccepted(e.target.value)} /></label><label className="block text-sm">Exact amount received<input className={field} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="block text-sm">Received at<input className={field} type="datetime-local" value={received} onChange={e => setReceived(e.target.value)} /></label><button className={button} onClick={() => decide("approve")}>Approve payment and added time</button><label className="block text-sm">Reason for rejection<textarea className={field} value={reason} onChange={e => setReason(e.target.value)} /></label><button className="rounded-md border px-4 py-2 text-sm font-semibold" onClick={() => decide("reject")}>Reject evidence</button></fieldset></> : <fieldset disabled={busy || !!request || Date.parse(expiry) <= Date.now()} className="space-y-3"><label className="block text-sm">Proof image (JPG, PNG or WebP; up to 5 MiB)<input className={field} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} /></label><label className="block text-sm">Claimed reference<input className={field} value={reference} onChange={e => setReference(e.target.value)} /></label><label className="block text-sm">Claimed amount<input className={field} inputMode="decimal" value={claim} onChange={e => setClaim(e.target.value)} /></label><button className={button} onClick={() => void upload()}>Upload and submit proof</button></fieldset>}
  </section>;
}
