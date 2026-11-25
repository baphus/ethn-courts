"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePager } from "@/components/admin/table-pager";
import { formatDisplayDate } from "@/lib/display-date";
import { dateTime, ErrorNotice, money, request, type BookingSummary } from "./booking-list";
import { parseFilters, serializeFilters, statuses, type Filters } from "./booking-filters";
import StaffOccupancy from "./staff-occupancy";
import BookingDetail from "./booking-detail";


type Result = { rows: BookingSummary[]; page: number; limit: number; total: number };
const initial: Filters = { q: "", status: [], from: "", to: "", page: 1, archived: "" };
const input = "h-10 rounded-md border bg-background px-3 text-sm";

export default function BookingsView() {
  const [filters, setFilters] = useState(initial); const [ready, setReady] = useState(false);
  const [search, setSearch] = useState(""); const [draft, setDraft] = useState(initial); const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { const read = () => { const params = new URLSearchParams(window.location.search); const f = parseFilters(params); if (params.has("q")) { params.delete("q"); const qs = params.toString(); window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`); } setFilters(previous => ({ ...f, q: previous.q })); setReady(true); }; read(); window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read); }, []);
  function update(next: Filters, replace = false) { const qs = serializeFilters(next); window.history[replace ? "replaceState" : "pushState"](null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`); setFilters(next); }
  useEffect(() => { if (!ready || search.trim() === filters.q) return; const timer = setTimeout(() => update({ ...filters, q: search.trim(), page: 1 }, true), 300); return () => clearTimeout(timer); }, [search, filters, ready]);
  useEffect(() => { if (!ready) return; const controller = new AbortController(); setLoading(true); setError(""); const params = new URLSearchParams(serializeFilters(filters)); if (filters.q) params.set("q", filters.q); params.set("page", String(filters.page)); params.set("limit", "20"); void request<Result>(`/api/ethn/admin/bookings?${params}`, controller.signal).then(data => { if (!controller.signal.aborted) { const last = Math.min(1000, Math.max(1, Math.ceil(data.total / data.limit))); if (filters.page > last) update({ ...filters, page: last }, true); else setResult(data); } }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [filters, refresh, ready]);
  const invalidRange = !!draft.from && !!draft.to && draft.from > draft.to;
  const active = filters.status.length + [filters.from, filters.to, filters.archived].filter(Boolean).length;
  const show = (row: BookingSummary) => setSelected(row.id);
  return <div className="w-full space-y-5 pb-24">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">ETHN Courts / Staff</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Bookings</h1><p className="mt-2 text-sm text-muted-foreground">Find and review reservations.</p></div><Button render={<Link href="/admin/bookings/new" />}>New booking</Button></header>
    <section aria-label="Booking filters" className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 basis-64 gap-1.5 text-sm font-medium">Search<input type="search" className={input} value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Name, contact or booking ID" autoComplete="off" /></label>
      {search && <Button type="button" variant="ghost" onClick={() => { setSearch(""); update({ ...filters, q: "", page: 1 }, true); }}>Clear search</Button>}
      <Popover><PopoverTrigger render={<Button variant="outline" />}>Status{filters.status.length ? ` (${filters.status.length})` : ""}</PopoverTrigger><PopoverContent className="w-56 p-3"><fieldset><legend className="font-semibold">Booking status</legend>{statuses.map(status => <label key={status} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm capitalize"><input type="checkbox" className="size-4 accent-primary" checked={filters.status.includes(status)} onChange={e => update({ ...filters, status: e.target.checked ? [...filters.status, status] : filters.status.filter(s => s !== status), page: 1 })} />{status}</label>)}</fieldset></PopoverContent></Popover>
      <Popover open={open} onOpenChange={value => { setOpen(value); if (value) setDraft(filters); }}><PopoverTrigger render={<Button variant="outline" />}>Play date{(filters.from || filters.to) && " (set)"}</PopoverTrigger><PopoverContent className="w-72 space-y-4 p-4"><h2 className="font-semibold">Play date</h2><label className="grid gap-1.5 text-sm font-medium">From date<input className={input} type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label><label className="grid gap-1.5 text-sm font-medium">To date<input className={input} type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>{invalidRange && <p role="alert" className="text-sm text-destructive">End date must be on or after start date.</p>}<Button disabled={invalidRange} onClick={() => { update({ ...filters, from: draft.from, to: draft.to, page: 1 }); setOpen(false); }}>Apply</Button></PopoverContent></Popover>
      <label className="grid gap-1.5 text-sm font-medium">View<select className={input} value={filters.archived} onChange={e => update({ ...filters, archived: e.target.value as Filters["archived"], page: 1 })}><option value="">Current</option><option value="true">Archived</option><option value="all">All</option></select></label>
      {active > 0 && <Button variant="ghost" onClick={() => update({ ...initial, q: filters.q })}>Clear filters</Button>}
    </section>
    {error && <ErrorNotice message={error} />}
    <section aria-label="Search results" className="overflow-hidden rounded-xl border bg-card"><div className="flex items-center justify-between gap-4 border-b px-5 py-3"><h2 className="font-semibold">Bookings</h2>{!error && !loading && result && <span className="text-sm text-muted-foreground">{result.total} found</span>}</div>
      <div role="region" aria-label="Booking results table" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"><table className="w-full min-w-[44rem] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Guest", "Status", "Play date", "Date booked", "Items", "Total", ""].map((h, i) => <th key={i} scope="col" className="px-5 py-3 font-medium">{h || <span className="sr-only">Details</span>}</th>)}</tr></thead><tbody className="divide-y" aria-busy={loading}>{loading ? [0, 1, 2].map(index => <tr key={index}>{Array.from({ length: 7 }, (_, column) => <td key={column} className="px-5 py-3"><Skeleton className="h-4 w-full max-w-24 motion-reduce:animate-none" /></td>)}</tr>) : !error && result?.rows.map(row => <tr key={row.id} className="hover:bg-muted/30"><td className="px-5 py-3 font-medium">{row.guestName || "Guest"}</td><td className="px-5 py-3 capitalize">{row.status}{row.archived && filters.archived === "all" && <span className="ml-2 rounded bg-muted px-2 py-1 text-xs">Archived</span>}</td><td className="px-5 py-3">{formatDisplayDate(row.operatingDate)}</td><td className="px-5 py-3">{dateTime(row.createdAt)}</td><td className="px-5 py-3">{row.itemCount}</td><td className="px-5 py-3 font-medium">{money(row.total)}</td><td className="px-5 py-3"><Button variant="outline" size="sm" onClick={() => show(row)} aria-label={`View booking for ${row.guestName || "Guest"}`}>View</Button></td></tr>)}</tbody></table></div>
      {!loading && !error && result?.rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No bookings match these filters.</p>}
      {!error && result && <div className="px-5"><TablePager page={result.page} pageSize={result.limit} total={result.total} onPageChange={page => update({ ...filters, page })} busy={loading} /></div>}
    </section>
    <StaffOccupancy revision={refresh} onBooking={setSelected} />
    <Dialog open={!!selected} onOpenChange={value => { if (!value) setSelected(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogTitle>Booking details</DialogTitle><DialogDescription>Review reservation and payment information.</DialogDescription>{selected && <BookingDetail key={selected} id={selected} embedded onSaved={() => setRefresh(n => n + 1)} />}</DialogContent></Dialog>
  </div>;
}
