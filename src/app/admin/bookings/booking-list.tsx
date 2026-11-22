"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDisplayDate } from "@/lib/display-date";

export type BookingSummary = { id: string; guestName: string | null; status: string; operatingDate: string; createdAt: string; total: string; itemCount: number };
export const money = (value: string) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
export const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export const errorMessage = (status: number) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "Booking not found." : status === 400 ? "Check your search filters and try again." : "Service unavailable. Please try again.";
export async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(errorMessage(response.status));
  return response.json();
}
export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{message} {message.includes("Sign in") && <Link className="underline" href="/login">Sign in</Link>}</div>;
}
export function BookingRows({ rows }: { rows: BookingSummary[] }) {
  return <ul className="divide-y">{rows.map(row => <li key={row.id}><Link href={`/admin/bookings/${encodeURIComponent(row.id)}`} className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><strong className="block">{row.guestName || "Guest"}</strong><span className="text-sm text-muted-foreground">{formatDisplayDate(row.operatingDate)} · {row.itemCount} {row.itemCount === 1 ? "item" : "items"} · Created {dateTime(row.createdAt)}</span></span><span className="text-right text-sm"><span className="block font-semibold capitalize">{row.status}</span><span className="text-muted-foreground">Booking total {money(row.total)}</span></span></Link></li>)}</ul>;
}

type SearchResult = { rows: BookingSummary[]; page: number; limit: number; total: number };
export default function BookingList() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [draftFrom, setDraftFrom] = useState(""); const [draftTo, setDraftTo] = useState(""); const [datesOpen, setDatesOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: q.trim(), status, from, to, page: String(page), limit: "20" });
    void request<SearchResult>(`/api/ethn/admin/bookings?${params}`, controller.signal).then(data => { if (!controller.signal.aborted) setResult(data); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [q, status, from, to, page]);
  function change(fn: () => void) { setLoading(true); setError(""); setResult(null); setPage(1); fn(); }
  const field = "grid gap-1.5 text-sm font-medium"; const input = "h-10 rounded-md border bg-background px-3 text-sm";
  return <div className="mx-auto w-full max-w-7xl space-y-6 py-2"><header className="border-b pb-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ETHN Courts / Staff</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Bookings</h1><p className="mt-2 text-sm text-muted-foreground">Find a reservation by guest, contact details, booking ID or tracking code.</p></header>
    <section aria-label="Booking filters" className="space-y-4 rounded-xl border bg-card p-5"><div className="flex flex-wrap items-end gap-3"><label className={`${field} min-w-0 flex-1 basis-64`}>Search<input className={input} value={q} maxLength={100} onChange={e => change(() => setQ(e.target.value))} placeholder="Name, contact or ID" /></label><Popover open={datesOpen} onOpenChange={open => { setDatesOpen(open); if (open) { setDraftFrom(from); setDraftTo(to); } }}><PopoverTrigger render={<Button variant="outline" />}>Dates{(from || to) && " •"}</PopoverTrigger><PopoverContent className="w-72 space-y-4 p-4"><h2 className="font-semibold">Booking dates</h2><label className={field}>From date<input className={input} type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} /></label><label className={field}>To date<input className={input} type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} /></label><div className="flex gap-2"><Button type="button" onClick={() => { if (draftFrom !== from || draftTo !== to) change(() => { setFrom(draftFrom); setTo(draftTo); }); setDatesOpen(false); }}>Apply</Button><Button type="button" variant="outline" onClick={() => { setDraftFrom(""); setDraftTo(""); if (from || to) change(() => { setFrom(""); setTo(""); }); setDatesOpen(false); }}>Clear</Button></div></PopoverContent></Popover></div><div role="group" aria-label="Booking status" className="flex flex-wrap gap-1">{["", "held", "pending", "confirmed", "completed", "expired", "rejected"].map(s => <button key={s} type="button" aria-pressed={status === s} onClick={() => { if (status !== s) change(() => setStatus(s)); }} className="rounded-md px-3 py-2 text-sm capitalize text-muted-foreground hover:bg-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">{s || "All statuses"}</button>)}</div></section>
    {error && <ErrorNotice message={error}/>}<section aria-label="Search results" className="rounded-xl border bg-card p-5"><div className="flex justify-between gap-4"><h2 className="font-semibold">Results</h2>{result && <span className="text-sm text-muted-foreground">{result.total} found</span>}</div>{loading ? <LoadingAnimation label="Loading bookings" className="py-8" /> : result?.rows.length === 0 ? <p className="py-8 text-sm text-muted-foreground text-center"><EmptyIcon /> No bookings match these filters.</p> : result && <BookingRows rows={result.rows}/>} {result && result.total > result.limit && <nav aria-label="Results pages" className="mt-4 flex items-center justify-between gap-4 text-sm"><button className="rounded-md border px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => { setLoading(true); setResult(null); setPage(page - 1); }}>Previous</button><span>Page {result.page}</span><button className="rounded-md border px-3 py-2 disabled:opacity-40" disabled={page >= 1000 || page * result.limit >= result.total} onClick={() => { setLoading(true); setResult(null); setPage(page + 1); }}>Next</button></nav>}</section></div>;
}
