"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, CalendarDays, ChevronDown, Eye, Filter, ListFilter, RotateCcw } from "lucide-react";
import { BookingStatusBadge, bookingStatusStyle } from "@/components/booking/booking-status";
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
import { GuestName } from "../guest-name";
import { formatPlayTime } from "./booking-play-time";


type Result = { rows: (BookingSummary & { trackingCode: string | null; guestEmail: string | null; guestPhone: string | null; courtNames: string[]; slotCount: number; playTimes: { startsAt: string; endsAt: string; courts: string[] }[] })[]; page: number; limit: number; total: number };
const headers = ["Tracking no.", "Customer", "Contact", "Booking date", "Courts", "No. of slots", "Play time", "Status", "Total", "Created", ""];
const cell = "border-r px-3 py-2 last:border-r-0";
const initial: Filters = { q: "", status: [], from: "", to: "", page: 1, archived: "" };
const input = "h-9 rounded-sm border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
  const active = Number(!!filters.status.length || !!filters.archived) + Number(!!filters.from || !!filters.to);
  const legacyMode = filters.archived === "all" || (filters.archived === "true" && filters.status.length > 0);
  return <div className="w-full space-y-5 pb-24">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6"><div><h1 className="text-2xl font-semibold tracking-tight">Bookings</h1><p className="mt-2 text-sm text-muted-foreground">Find and review reservations.</p></div><Button render={<Link href="/admin/bookings/new" />}>New booking</Button></header>
    <section aria-label="Booking filters" className="flex flex-wrap items-end gap-2 [&_button]:rounded-sm [&_button]:h-9">
      <label className="grid w-full min-w-0 gap-1.5 sm:w-72 text-sm font-medium">Search<input type="search" className={input} value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Name, contact or booking ID" autoComplete="off" /></label>
      {search && <Button type="button" variant="ghost" onClick={() => { setSearch(""); update({ ...filters, q: "", page: 1 }, true); }}>Clear search</Button>}
      <Popover open={open} onOpenChange={value => { setOpen(value); if (value) setDraft(filters); }}>
        <PopoverTrigger render={<Button variant="outline" />}><Filter aria-hidden="true" /> Filter{active > 0 && ` (${active})`}</PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Filter bookings</h2><Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...initial, q: draft.q })}><RotateCcw aria-hidden="true" /> Reset</Button></div>
          {legacyMode && <p className="mb-3 rounded-sm bg-muted p-2 text-xs text-muted-foreground">Current archive filter uses an older mode. Applying these controls will change its results.</p>}
          <details key={open ? "status-open" : "status-closed"} open className="group border-t py-2"><summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><ListFilter className="size-4" aria-hidden="true" /> Status <ChevronDown className="size-4 -rotate-90 text-muted-foreground group-open:rotate-0" aria-hidden="true" /></summary>
            <fieldset className="grid grid-cols-2 gap-x-2 pt-1"><legend className="sr-only">Status</legend>{statuses.map((status) => { const { icon: Icon, accent } = bookingStatusStyle(status); return <label key={status} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm capitalize"><input type="checkbox" className="size-4 accent-primary" checked={draft.status.includes(status)} onChange={e => setDraft({ ...draft, status: e.target.checked ? [...draft.status, status] : draft.status.filter(s => s !== status) })} /><Icon className={`size-4 ${accent}`} aria-hidden="true" />{status}</label>; })}<label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={!!draft.archived} onChange={e => setDraft({ ...draft, archived: e.target.checked ? "true" : "" })} /><Archive className={`size-4 ${bookingStatusStyle("archived").accent}`} aria-hidden="true" />Archived</label></fieldset>
          </details>
          <details key={open ? "open" : "closed"} open={!!(filters.from || filters.to)} className="group border-t py-2"><summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><CalendarDays className="size-4" aria-hidden="true" /> Booking date <ChevronDown className="size-4 -rotate-90 text-muted-foreground group-open:rotate-0" aria-hidden="true" /></summary>
            <div className="grid grid-cols-2 gap-2 pt-2"><label className="grid min-w-0 gap-1 text-xs font-medium">From date<input className={`${input} w-full min-w-0 px-1`} type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label><label className="grid min-w-0 gap-1 text-xs font-medium">To date<input className={`${input} w-full min-w-0 px-1`} type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label></div>
          </details>
          {invalidRange && <p role="alert" className="mb-2 text-sm text-destructive">End date must be on or after start date.</p>}
          <div className="border-t pt-3"><Button className="w-full" disabled={invalidRange} onClick={() => { update({ ...filters, status: draft.status, from: draft.from, to: draft.to, archived: draft.archived ? (draft.status.length ? "include" : "true") : "", page: 1 }); setOpen(false); }}>Apply</Button></div>
        </PopoverContent>
      </Popover>
      <div role="group" aria-label="Quick status filters" className="flex flex-wrap gap-2">
        {([ ["pending", "Pending"], ["confirmed", "Approved"], ["completed", "Completed"] ] as const).map(([status, label]) => {
          const pressed = filters.status.includes(status);
          const { icon: Icon, className } = bookingStatusStyle(status);
          return <Button key={status} type="button" variant={pressed ? "default" : "outline"} aria-pressed={pressed} className="!rounded-full px-3" onClick={() => {
            const nextStatus = pressed ? filters.status.filter(s => s !== status) : [...filters.status, status];
            const archived = filters.archived === "true" && !filters.status.length ? "include" : filters.archived === "include" && !nextStatus.length ? "true" : filters.archived;
            setOpen(false);
            update({ ...filters, status: nextStatus, archived, page: 1 });
          }}><span className={`inline-flex rounded-full p-0.5 ${className}`}><Icon aria-hidden="true" className="size-3" /></span>{label}</Button>;
        })}
      </div>
      {active > 0 && <Button variant="ghost" onClick={() => update({ ...initial, q: filters.q })}>Clear filters</Button>}
    </section>
    {error && <ErrorNotice message={error} />}
    <section aria-label="Search results" className="overflow-hidden rounded-md border bg-card">
      <div role="region" aria-label="Booking results table" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <table className="w-full min-w-[68rem] text-left text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground"><tr>{headers.map(h => <th key={h} scope="col" className={`${cell} whitespace-nowrap font-medium ${h === "Total" || h === "No. of slots" ? "text-right" : ""}`}>{h || <span className="sr-only">Details</span>}</th>)}</tr></thead>
          <tbody className="divide-y" aria-busy={loading}>{loading ? [0, 1, 2].map(index => <tr key={index}>{headers.map(h => <td key={h} className={cell}><Skeleton className="h-4 w-full max-w-24 motion-reduce:animate-none" /></td>)}</tr>) : !error && result?.rows.map(row => <tr key={row.id} className="hover:bg-muted/30">
            <td className={cell + " whitespace-nowrap font-mono text-xs"}>{row.trackingCode || "—"}</td>
            <td className={cell + " font-medium"}><GuestName name={row.guestName} /></td>
            <td className={cell + " text-xs"}>{row.guestEmail && <div className="max-w-48 wrap-anywhere">{row.guestEmail}</div>}{row.guestPhone && <div className="whitespace-nowrap text-muted-foreground">{row.guestPhone}</div>}{!row.guestEmail && !row.guestPhone && "—"}</td>
            <td className={cell + " whitespace-nowrap"}>{formatDisplayDate(row.operatingDate)}</td>
            <td className={cell}>{row.courtNames.join(", ") || "—"}</td>
            <td className={cell + " text-right tabular-nums"}>{row.slotCount}</td>
            <td className={cell}>{row.playTimes.length ? <ul className="space-y-1">{row.playTimes.map(range => <li key={range.startsAt + "/" + range.endsAt}><span className="whitespace-nowrap">{formatPlayTime(range.startsAt, range.endsAt, row.operatingDate)}</span>{row.playTimes.length > 1 && <span className="block text-xs text-muted-foreground">{range.courts.join(", ")}</span>}</li>)}</ul> : "—"}</td>
            <td className={cell}><BookingStatusBadge state={row.status} />{row.archived && <span className="ml-2"><BookingStatusBadge state="archived" /></span>}</td>
            <td className={cell + " text-right font-medium tabular-nums"}>{money(row.total)}</td>
            <td className={cell}>{dateTime(row.createdAt)}</td>
            <td className={cell}><Button variant="outline" size="sm" className="rounded-sm" onClick={() => setSelected(row.id)} aria-label={`View booking for ${row.guestName || "customer"}`}><Eye aria-hidden="true" /> View</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!loading && !error && result?.rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No bookings match these filters.</p>}
      {!error && result && <div className="border-t px-3 [&_nav]:border-0"><TablePager page={result.page} pageSize={result.limit} total={result.total} onPageChange={page => update({ ...filters, page })} busy={loading} /></div>}
    </section>
    <StaffOccupancy revision={refresh} onBooking={setSelected} />
    <Dialog open={!!selected} onOpenChange={value => { if (!value) setSelected(null); }}><DialogContent className="max-h-[90vh] gap-2 overflow-y-auto sm:max-w-3xl"><DialogTitle>Booking details</DialogTitle><DialogDescription>Review reservation and payment information.</DialogDescription>{selected && <BookingDetail key={selected} id={selected} embedded allowCompletion onSaved={() => setRefresh(n => n + 1)} />}</DialogContent></Dialog>
  </div>;
}
