"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Filters = { from: string; to: string; action: string; q: string };
type Row = { id: string; occurredAt: string; label: string; actorLabel: "Staff" | "Customer" | "System"; actorId: string | null; bookingId: string | null; summary: string };
type Result = { rows: Row[]; page: number; limit: number; total: number; actions: string[] };
const empty: Filters = { from: "", to: "", action: "", q: "" };
const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ActivityLog() {
  const [draft, setDraft] = useState<Filters>(empty);
  const [filters, setFilters] = useState<Filters>(empty);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inputError, setInputError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setResult(null);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    async function load() {
      try {
        const response = await fetch(`/api/ethn/admin/activity?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setError(response.status === 401 ? "Your session ended. Please sign in again." : response.status === 403 ? "Owner access is no longer enabled for this account." : response.status === 400 ? "These filters could not be applied. Check the dates and try again." : "Activity history is unavailable. Please try again later.");
          return;
        }
        const data = await response.json() as Result;
        if (!controller.signal.aborted) { setResult(data); setActions(data.actions); }
      } catch {
        if (!controller.signal.aborted) setError("Activity history is unavailable. Please try again later.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [filters, page, retry]);

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = draft.q.trim();
    if (q && !uuid.test(q)) { setInputError("Enter a complete booking UUID."); return; }
    if (draft.from && draft.to && draft.from > draft.to) { setInputError("From date must be before or equal to the to date."); return; }
    setInputError(""); setPage(1); setFilters({ ...draft, q }); setFiltersOpen(false);
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
    <header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">OWNER SETTINGS</p><h1 className="text-3xl font-semibold tracking-tight">Activity history</h1><p className="max-w-2xl text-muted-foreground">Review recorded booking and administrative activity.</p></header>
    <div className="flex flex-wrap items-center gap-3">
      <Popover open={filtersOpen} onOpenChange={open => { setFiltersOpen(open); if (open) { setDraft(filters); setInputError(""); } }}>
        <PopoverTrigger render={<Button variant="outline" />}>Filters{activeCount > 0 && ` (${activeCount})`}</PopoverTrigger>
        <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-4">
      <h2 className="text-lg font-semibold">Filter activity</h2><p className="mt-1 text-sm text-muted-foreground">Dates refer to when activity occurred, not the booking date.</p>
      <form onSubmit={apply} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium" htmlFor="activity-from">From date<Input id="activity-from" type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="space-y-1 text-sm font-medium" htmlFor="activity-to">To date<Input id="activity-to" type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
        <label className="space-y-1 text-sm font-medium" htmlFor="activity-action">Action<select id="activity-action" className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value })}><option value="">All actions</option>{actions.map(action => <option key={action} value={action}>{action}</option>)}</select></label>
        <label className="space-y-1 text-sm font-medium" htmlFor="activity-booking">Booking UUID<Input id="activity-booking" value={draft.q} onChange={e => setDraft({ ...draft, q: e.target.value })} maxLength={36} autoComplete="off" spellCheck={false} placeholder="Complete booking UUID" /></label>
        {inputError && <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{inputError}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit">Apply filters</Button><Button type="button" variant="outline" onClick={() => { setDraft(empty); setFilters({ ...empty }); setPage(1); setInputError(""); }}>Clear filters</Button></div>
      </form>
        </PopoverContent>
      </Popover>
      {activeCount > 0 && <><span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{activeCount} active {activeCount === 1 ? "filter" : "filters"}</span><Button type="button" variant="ghost" onClick={() => { setDraft(empty); setFilters({ ...empty }); setPage(1); setInputError(""); }}>Clear</Button></>}
    </div>
    <section className="rounded-xl border bg-card p-5" aria-labelledby="activity-results">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="activity-results" className="text-lg font-semibold">Recorded activity</h2>{result && <p className="text-sm text-muted-foreground">{result.total} {result.total === 1 ? "event" : "events"}</p>}</div>
      {loading && <LoadingAnimation label="Loading activity" className="mt-4" />}
      {error && <div role="alert" className="mt-4 space-y-3"><p className="text-sm text-destructive">{error} {error.includes("sign in") && <Link className="underline" href="/login?next=/admin/activity">Sign in</Link>}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>}
      {result && (result.rows.length === 0 ? <p className="mt-4 text-sm text-muted-foreground text-center"><EmptyIcon /> No activity found for these filters.</p> : <div role="region" aria-label="Activity records, scroll horizontally for more columns" tabIndex={0} className="mt-4 max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="text-muted-foreground"><th scope="col" className="pb-3 pr-5 font-medium">When</th><th scope="col" className="pb-3 pr-5 font-medium">Activity</th><th scope="col" className="pb-3 pr-5 font-medium">Actor</th><th scope="col" className="pb-3 font-medium">Booking</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.id} className="border-t align-top"><td className="whitespace-nowrap py-4 pl-2 pr-5">{time.format(new Date(row.occurredAt))}</td><td className="py-4 pl-2 pr-5"><div className="font-medium">{row.label}</div><div className="mt-1 text-muted-foreground">{row.summary}</div></td><td className="py-4 pl-2 pr-5">{row.actorLabel}{row.actorId && uuid.test(row.actorId) && <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{row.actorId}</span>}</td><td className="py-4">{row.bookingId && uuid.test(row.bookingId) ? <Link className="break-all font-mono text-xs underline underline-offset-4" href={`/admin/bookings/${row.bookingId}`}>{row.bookingId}</Link> : <span className="text-muted-foreground">—</span>}</td></tr>)}</tbody></table></div>)}
      {result && result.total > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-sm text-muted-foreground">Page {result.page} of {Math.max(1, Math.ceil(result.total / result.limit))}</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><Button variant="outline" disabled={page >= 1000 || page * result.limit >= result.total} onClick={() => setPage(value => value + 1)}>Next</Button></div></div>}
    </section>
  </div>;
}
