"use client";

import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Archive, CalendarDays, ChevronDown, Eye, Filter, ListFilter, RotateCcw } from "lucide-react";
import { BookingStatusBadge, bookingStatusStyle } from "@/components/booking/booking-status";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewToggle } from "@/components/ui/view-toggle";
import { TablePager } from "@/components/admin/table-pager";
import { ResultsTable, resultsCell as cell } from "@/components/admin/results-table";
import { formatDisplayDate } from "@/lib/display-date";
import { dateTime, ErrorNotice, money, request, type BookingSummary } from "./booking-list";
import { parseFilters, serializeFilters, statuses, type Filters } from "./booking-filters";
import StaffOccupancy from "./staff-occupancy";
import BookingDetail from "./booking-detail";
import { GuestName } from "../guest-name";
import { formatPlayTime } from "./booking-play-time";


type Result = { rows: (BookingSummary & { canComplete: boolean; trackingCode: string | null; guestEmail: string | null; guestPhone: string | null; courtNames: string[]; slotCount: number; playTimes: { startsAt: string; endsAt: string; courts: string[] }[] })[]; page: number; limit: number; total: number };
const headers = ["Tracking no.", "Customer", "Contact", "Booking date", "Courts", "No. of slots", "Play time", "Status", "Total", "Date booked", "Actions"];
const initial: Filters = { q: "", status: [], from: "", to: "", page: 1, archived: "" };
const input = "h-9 rounded-sm border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function BookingsView() {
  const [view, setView] = useState<"list" | "grid">("list");
  const [filters, setFilters] = useState(initial); const [ready, setReady] = useState(false);
  const [search, setSearch] = useState(""); const [draft, setDraft] = useState(initial); const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  const [selectedRow, setSelected] = useState<string | null>(null);
  const linkedBooking = useSearchParams().get("booking");
  const selected = selectedRow ?? linkedBooking;

  function closeBooking() {
    setSelected(null);
    if (linkedBooking) {
      const url = new URL(window.location.href);
      url.searchParams.delete("booking");
      window.history.replaceState(null, "", url);
    }
  }
  const confirm = useConfirm();
  const completing = useRef(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  async function complete(row: Result["rows"][number]) {
    if (completing.current || !row.canComplete) return;
    completing.current = true;
    try {
      if (!await confirm("Mark this booking completed? Payment and booking history stay unchanged.", { title: "Complete booking", confirmLabel: "Complete booking" })) return;
      setCompletingId(row.id);
      const response = await fetch("/api/ethn/admin/outcomes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", bookingId: row.id }),
      });
      if (response.ok) toast.success("Booking marked completed.");
      else if (response.status >= 500) toast.warning("Completion could not be confirmed. Check the refreshed booking before retrying.");
      else toast.error(response.status === 409 ? "This booking is no longer eligible for completion." : "Could not complete this booking. Check your access and booking details.");
      setRefresh(value => value + 1);
    } catch {
      toast.warning("Completion could not be confirmed. Check the refreshed booking before retrying.");
      setRefresh(value => value + 1);
    } finally {
      completing.current = false;
      setCompletingId(null);
    }
  }

  function actions(row: Result["rows"][number]) {
    return <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setSelected(row.id)} aria-label={`View booking for ${row.guestName || "customer"}`}><Eye aria-hidden="true" /> View</Button>
      {row.canComplete && <Button type="button" variant="outline" size="sm" disabled={completingId !== null} onClick={() => void complete(row)} aria-label={`Complete booking for ${row.guestName || "customer"}`}>{completingId === row.id ? "Completing…" : "Complete"}</Button>}
    </div>;
  }
  useEffect(() => { const read = () => { const params = new URLSearchParams(window.location.search); const f = parseFilters(params); if (params.has("q")) { params.delete("q"); const qs = params.toString(); window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`); } setFilters(previous => ({ ...f, q: previous.q })); setReady(true); }; read(); window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read); }, []);
  function update(next: Filters, replace = false) { const params = new URLSearchParams(serializeFilters(next)); const booking = new URLSearchParams(window.location.search).get("booking"); if (booking) params.set("booking", booking); const qs = params.toString(); window.history[replace ? "replaceState" : "pushState"](null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`); setFilters(next); }
  useEffect(() => { if (!ready || search.trim() === filters.q) return; const timer = setTimeout(() => update({ ...filters, q: search.trim(), page: 1 }, true), 300); return () => clearTimeout(timer); }, [search, filters, ready]);
  useEffect(() => { if (!ready) return; const controller = new AbortController(); setLoading(true); setError(""); const params = new URLSearchParams(serializeFilters(filters)); if (filters.q) params.set("q", filters.q); params.set("page", String(filters.page)); params.set("limit", "20"); void request<Result>(`/api/ethn/admin/bookings?${params}`, controller.signal).then(data => { if (!controller.signal.aborted) { const last = Math.min(1000, Math.max(1, Math.ceil(data.total / data.limit))); if (filters.page > last) update({ ...filters, page: last }, true); else setResult(data); } }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [filters, refresh, ready]);
  const invalidRange = !!draft.from && !!draft.to && draft.from > draft.to;
  const active = Number(!!filters.status.length || !!filters.archived) + Number(!!filters.from || !!filters.to);
  const legacyMode = filters.archived === "all" || (filters.archived === "true" && filters.status.length > 0);
  return <div className="w-full space-y-5 pb-24">
    <header className="border-b pb-6"><h1 className="text-2xl font-semibold tracking-tight">Bookings</h1><p className="mt-2 text-sm text-muted-foreground">Find and review reservations.</p></header>
    <section aria-label="Booking controls" className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-0 flex-wrap items-end gap-2 [&_button]:rounded-sm [&_button]:h-9">
      <label className="grid w-full min-w-0 gap-1.5 sm:w-72 text-sm font-medium">Search<Input type="search" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} placeholder="Name, contact or booking ID" autoComplete="off" /></label>
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
            <div className="grid grid-cols-2 gap-2 pt-2"><label className="grid min-w-0 gap-1 text-xs font-medium">From date<DateField value={draft.from} onValueChange={value => setDraft({ ...draft, from: value })} /></label><label className="grid min-w-0 gap-1 text-xs font-medium">To date<DateField value={draft.to} onValueChange={value => setDraft({ ...draft, to: value })} /></label></div>
          </details>
          {invalidRange && <p role="alert" className="mb-2 text-sm text-destructive">End date must be on or after start date.</p>}
          <div className="border-t pt-3"><Button className="w-full" disabled={invalidRange} onClick={() => { update({ ...filters, status: draft.status, from: draft.from, to: draft.to, archived: draft.archived ? (draft.status.length ? "include" : "true") : "", page: 1 }); setOpen(false); }}>Apply</Button></div>
        </PopoverContent>
      </Popover>
      <div role="group" aria-label="Quick status filters" className="flex flex-wrap gap-2">
        {([ ["pending", "Pending"], ["confirmed", "Confirmed"], ["completed", "Completed"] ] as const).map(([status, label]) => {
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
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ViewToggle view={view} onViewChange={setView} />
        <Button className="h-9" nativeButton={false} render={<Link href="/admin/bookings/new" />}>New booking</Button>
      </div>
    </section>
    {error && <ErrorNotice message={error} />}
    <section aria-label="Search results" className="space-y-3">
      {view === "grid" ? <div className="min-w-0" aria-busy={loading}>
        {!error && <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loading ? [0, 1, 2].map(index => <li key={index} aria-hidden="true" className="rounded-xl border bg-card p-4"><Skeleton className="h-32 motion-reduce:animate-none" /></li>) : result?.rows.map(row => <li key={row.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 text-base font-semibold"><GuestName name={row.guestName} email={row.guestEmail} /></h3><div className="flex flex-wrap gap-1"><BookingStatusBadge state={row.status} />{row.archived && <BookingStatusBadge state="archived" />}</div></div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm [&_dt]:text-muted-foreground">
              <dt>Tracking no.</dt><dd className="font-mono">{row.trackingCode || "—"}</dd>
              <dt>Contact</dt><dd className="wrap-anywhere">{row.guestEmail && <span className="block">{row.guestEmail}</span>}{row.guestPhone && <span className="block">{row.guestPhone}</span>}{!row.guestEmail && !row.guestPhone && "—"}</dd>
              <dt>Booking date</dt><dd>{formatDisplayDate(row.operatingDate)}</dd>
              <dt>Courts</dt><dd className="wrap-anywhere">{row.courtNames.join(", ") || "—"}</dd>
              <dt>Play time</dt><dd>{row.playTimes.length ? <ul className="space-y-1">{row.playTimes.map(range => <li key={range.startsAt + "/" + range.endsAt}>{formatPlayTime(range.startsAt, range.endsAt, row.operatingDate)}{row.playTimes.length > 1 && <span className="block wrap-anywhere text-xs text-muted-foreground">{range.courts.join(", ")}</span>}</li>)}</ul> : "—"}</dd>
              <dt>Slots</dt><dd className="tabular-nums">{row.slotCount}</dd>
              <dt>Date booked</dt><dd>{dateTime(row.createdAt)}</dd>
            </dl>
            <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3"><span className="text-sm font-medium tabular-nums">Total {money(row.total)}</span>{actions(row)}</div>
          </li>)}
        </ul>}
      </div> : <ResultsTable label="Booking results table" loadingLabel="Loading bookings" headers={headers} numeric={["Total", "No. of slots"]} minWidth="min-w-[76rem]" loading={loading}>
          {!error && result?.rows.map(row => <tr key={row.id}>
            <td className={cell + " whitespace-nowrap font-mono text-xs"}>{row.trackingCode || "—"}</td>
            <td className={cell + " font-medium"}><GuestName name={row.guestName} email={row.guestEmail} /></td>
            <td className={cell + " min-w-40 text-xs"}>{row.guestEmail && <div className="max-w-56 wrap-anywhere">{row.guestEmail}</div>}{row.guestPhone && <div className="whitespace-nowrap text-muted-foreground">{row.guestPhone}</div>}{!row.guestEmail && !row.guestPhone && "—"}</td>
            <td className={cell + " whitespace-nowrap"}>{formatDisplayDate(row.operatingDate)}</td>
            <td className={cell + " min-w-28"}>{row.courtNames.length ? <ul className="max-w-48 space-y-0.5 wrap-anywhere">{row.courtNames.map(court => <li key={court}>{court}</li>)}</ul> : "—"}</td>
            <td className={cell + " text-right tabular-nums"}>{row.slotCount}</td>
            <td className={cell}>{row.playTimes.length ? <ul className="space-y-1">{row.playTimes.map(range => <li key={range.startsAt + "/" + range.endsAt}><span className="whitespace-nowrap">{formatPlayTime(range.startsAt, range.endsAt, row.operatingDate)}</span>{row.playTimes.length > 1 && <span className="block text-xs text-muted-foreground">{range.courts.join(", ")}</span>}</li>)}</ul> : "—"}</td>
            <td className={cell}><BookingStatusBadge state={row.status} />{row.archived && <span className="ml-2"><BookingStatusBadge state="archived" /></span>}</td>
            <td className={cell + " text-right font-medium tabular-nums"}>{money(row.total)}</td>
            <td className={cell + " whitespace-nowrap text-xs text-muted-foreground"}>{dateTime(row.createdAt)}</td>
            <td className={cell + " min-w-40"}>{actions(row)}</td>
          </tr>)}
      </ResultsTable>}
      {!loading && !error && result?.rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No bookings match these filters.</p>}
      {!error && result && <div className="border-t px-3 [&_nav]:border-0"><TablePager page={result.page} pageSize={result.limit} total={result.total} onPageChange={page => update({ ...filters, page })} busy={loading} /></div>}
    </section>
    <StaffOccupancy revision={refresh} onBooking={setSelected} />
    <Dialog open={!!selected} onOpenChange={value => { if (!value) closeBooking(); }}><DialogContent className="grid h-[min(90dvh,52rem)] max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden sm:max-w-3xl"><DialogTitle>Booking details</DialogTitle><DialogDescription>Review reservation and payment information.</DialogDescription>{selected && <BookingDetail key={selected} id={selected} allowCompletion onSaved={() => setRefresh(n => n + 1)} />}</DialogContent></Dialog>
  </div>;
}
