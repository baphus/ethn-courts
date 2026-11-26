"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { useDashboardResource, useInvalidateOwnerResources } from "@/components/admin/dashboard/dashboard-resource";
import { TablePager } from "@/components/admin/table-pager";
import { LoadingRows } from "@/components/admin/loading-slots";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { ReportStats } from "./report-stats";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceChart } from "@/components/admin/finance-chart";
import { CashActivity } from "./cash-activity";
import Sales from "./sales";
import type { FinanceReport } from "@/lib/admin/finance";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSearchParams } from "next/navigation";
import { expenseCategories as categories, financeFilters, validFinancePeriod } from "@/lib/admin/finance-filters";
import { formatDisplayDate } from "@/lib/display-date";
import { Button } from "@/components/ui/button";
import { FinanceInfo } from "./finance-info";
import { addDaysManilaStr, manilaTodayStr } from "@/lib/courts";
import { buildCashWorkbook } from "@/lib/admin/finance-cash-workbook";
import type { CashFinanceExport } from "@/lib/admin/finance-cash";
import { ExpenseActions, ExpenseFields, type Expense } from "./expense-actions";
type Expenses = { rows: Expense[]; page: number; limit: number; total: number };
type Payload = { title: string; category: string; amount: string; paidDate: string; idempotencyKey: string; description?: string; vendor?: string; notes?: string };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const money = (value: string) => `₱${value}`;

export default function Finance() {
  const [today] = useState(() => manilaTodayStr());
  const params = useSearchParams();
  const filters = useMemo(() => financeFilters(params, today), [params, today]);
  const [searchDraft, setSearchDraft] = useState(filters.q);
  useEffect(() => { setSearchDraft(filters.q); }, [filters.q]);
  const { from, to } = filters;
  const [draft, setDraft] = useState(filters);
  const filterKey = JSON.stringify(filters);
  const [pagination, setPagination] = useState({ key: filterKey, page: 1 });
  const page = pagination.key === filterKey ? pagination.page : 1;
  const setPage = (page: number) => setPagination({ key: filterKey, page });
  const currentRange = useRef({ from, to });
  currentRange.current = { from, to };
  const { data: fetchedExpenses, loading: listLoading, error: listError, retry: retryExpenses } = useDashboardResource<Expenses>(`/api/ethn/admin/expenses?${new URLSearchParams({ ...filters, page: String(page), limit: "20" })}`);
  const previousExpenses = useRef<Expenses | null>(null);
  useEffect(() => { if (fetchedExpenses) previousExpenses.current = fetchedExpenses; }, [fetchedExpenses]);
  const expenses = fetchedExpenses ?? (listLoading ? previousExpenses.current : null);
  useEffect(() => { if (!listLoading && expenses) { const last = Math.min(1000, Math.max(1, Math.ceil(expenses.total / expenses.limit))); if (page > last) setPage(last); } }, [expenses, listLoading, page, filterKey]);
  const [filterError, setFilterError] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const invalidate = useInvalidateOwnerResources();
  const [pending, setPending] = useState<Payload | null>(null);
  const [saving, setSaving] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [announceSaveMessage, setAnnounceSaveMessage] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [view, setView] = useState<"cash" | "approval">("cash");

  async function exportReport() {
    if (exporting) return;
    setExporting(true); setExportError("");
    try {
      const response = await fetch(`/api/ethn/admin/finance/export?${new URLSearchParams({ from, to })}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const exported: CashFinanceExport = await response.json();
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      if (exported.from !== from || exported.to !== to || currentRange.current.from !== from || currentRange.current.to !== to) return;
      await writeXlsxFile(buildCashWorkbook(exported)).toFile(`finance-cash-${from}_${to}.xlsx`);
    } catch { setExportError("Could not export cash activity. Try again or choose a shorter date range."); }
    finally { setExporting(false); }
  }

  useEffect(() => {
    try { const saved = sessionStorage.getItem("ethn-finance-pending"); if (saved) setPending(JSON.parse(saved)); } catch { setSaveMessage("Could not restore pending expense. Check the expense list before recording another."); }
  }, []);


  async function save(payload: Payload) {
    setAnnounceSaveMessage(true);
    try { sessionStorage.setItem("ethn-finance-pending", JSON.stringify(payload)); } catch { setSaveMessage("Cannot safely save retry details in this browser. Expense was not sent."); return; }
    const retry = pending !== null;
    setPending(payload); setSaving(true); setSaveMessage(""); setAnnounceSaveMessage(false);
    try {
      const response = await fetch("/api/ethn/admin/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if ([400, 401, 403, 409].includes(response.status)) {
        if (response.status === 409) {
          if ((await response.json().catch(() => null))?.error !== "IDEMPOTENCY_MISMATCH") throw new Error();
          setSaveMessage("Retry key conflicts with another request. Check the expense list before taking further action.");
          toast.error("Expense request conflicts with a previous request.");
          return;
        }
        const invalid = response.status === 400;
        let guidance = invalid ? "Check the expense details and try again." : "Check your owner access before trying again.";
        if (invalid || !retry) {
          try { sessionStorage.removeItem("ethn-finance-pending"); setPending(null); }
          catch { guidance += " Saved retry details could not be cleared. Check expenses before retrying."; }
        }
        setSaveMessage(guidance);
        setAnnounceSaveMessage(invalid);
        if (!invalid) toast.error("Expense was not accepted.");
        return;
      }
      if (!response.ok) throw new Error();
      const record = await response.json();
      if (!record || typeof record.id !== "string" || record.title !== payload.title.trim() || record.category !== payload.category || typeof record.amount !== "string" || record.paidDate !== payload.paidDate) throw new Error();
    } catch {
      setSaveMessage("Retry the same expense, or check the expense list before discarding it.");
      toast.warning("Could not confirm the expense was recorded.");
      return;
    } finally { setSaving(false); }

    toast.success("Expense recorded.");
    setPending(null); setExpenseOpen(false); setPage(1); invalidate?.();
    try { sessionStorage.removeItem("ethn-finance-pending"); }
    catch { setSaveMessage("Saved retry details could not be cleared. If they reappear after reload, do not enter the expense again."); setAnnounceSaveMessage(true); }
  }

  function applyFilters(next: typeof filters | null) {
    if (next && !validFinancePeriod(next.from, next.to, today)) {
      setFilterError("Choose a date range of up to 366 days, ending no later than today.");
      return;
    }
    const query = new URLSearchParams();
    if (next) for (const [key, value] of Object.entries(next)) if (value.trim()) query.set(key, value.trim());
    window.history.pushState(null, "", query.size ? `?${query}` : "/admin/finance");
    setPage(1); setRangeOpen(false);
  }

  return <main className="space-y-5 pb-24">
    <header className="flex items-center gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
    </header>
    <div className="flex flex-wrap items-center gap-3">
      <Sheet open={rangeOpen} onOpenChange={open => { setRangeOpen(open); if (open) { setDraft(filters); setFilterError(""); } }}>
        <SheetTrigger render={<Button variant="outline" />}><SlidersHorizontal aria-hidden="true" /> Filters</SheetTrigger>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b"><SheetTitle>Filters</SheetTitle><SheetDescription>Choose a reporting period for Finance.</SheetDescription></SheetHeader>
          <form onSubmit={event => { event.preventDefault(); applyFilters({ ...filters, from: draft.from, to: draft.to }); }} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              <fieldset><legend className="mb-2 font-medium">Quick date range</legend><div className="flex flex-wrap gap-2">
                {[7, 30, 90].map(days => { const start = addDaysManilaStr(today, 1 - days); return <Button key={days} type="button" size="sm" variant={from === start && to === today ? "secondary" : "outline"} onClick={() => applyFilters({ ...filters, from: start, to: today })}>Last {days} days</Button>; })}
              </div></fieldset>
              <label className="grid gap-1 text-sm font-medium">From<input className={input} type="date" required max={today} value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
              <label className="grid gap-1 text-sm font-medium">To<input className={input} type="date" required max={today} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
              {filterError && <p role="alert" className="text-sm text-destructive">{filterError}</p>}
            </div>
            <SheetFooter className="flex-row justify-between border-t"><Button variant="ghost" type="button" onClick={() => applyFilters(null)}>Reset</Button><Button type="submit">Apply filters</Button></SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <p className="text-sm text-muted-foreground">{formatDisplayDate(from)} to {formatDisplayDate(to)}</p>
      {view === "cash" && <Button type="button" disabled={exporting} onClick={() => void exportReport()}>{exporting ? "Exporting…" : "Download cash XLSX"}</Button>}
      {view === "cash" && exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
    </div>
    <nav aria-label="Finance report view" className="flex gap-2 border-b">
      <Button variant={view === "cash" ? "secondary" : "ghost"} aria-pressed={view === "cash"} onClick={() => setView("cash")}>Cash activity</Button>
      <Button variant={view === "approval" ? "secondary" : "ghost"} aria-pressed={view === "approval"} onClick={() => setView("approval")}>Approval report</Button>
    </nav>
    {view === "cash" ? <CashActivity from={from} to={to} /> : <ApprovalReport from={from} to={to} />}
    <Sales from={from} to={to} onSaved={invalidate} />
    {!expenseOpen && saveMessage && <p role={announceSaveMessage ? "status" : undefined} className="text-sm text-slate-700">{saveMessage}</p>}
    {pending && !expenseOpen && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"><span>Review or retry the saved expense request before recording another.</span><Button onClick={() => setExpenseOpen(true)}>Resume pending expense</Button></div>}
    <div>
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">Recorded expenses</h2><FinanceInfo label="About recorded expenses">Paid expenses in the selected period. Edits and deletes are audited.</FinanceInfo></div></div>
          <Dialog open={expenseOpen} onOpenChange={open => { if (open) setExpenseOpen(true); else if (!saving) setExpenseOpen(false); }}><DialogTrigger render={<Button />}>Add expense</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogTitle>Record expense</DialogTitle><DialogDescription>Expenses are recorded on the date paid.</DialogDescription>

        <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); if (!pending) { const fields = new FormData(e.currentTarget); const get = (key: string) => String(fields.get(key) ?? ""); void save({ title: get("title"), category: get("category"), amount: get("amount"), paidDate: get("paidDate"), description: get("description"), vendor: get("vendor"), notes: get("notes"), idempotencyKey: crypto.randomUUID() }); } }}>
          <fieldset disabled={!!pending || saving} className="space-y-4 disabled:opacity-60"><ExpenseFields today={today} className={input} /><button className={`${button} w-full`} disabled={saving}>Record expense</button></fieldset>
          {saveMessage && <p role={announceSaveMessage ? "status" : undefined} className="text-sm text-slate-700">{saveMessage}</p>}
          {pending && <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><p>Pending: {pending.title} · {pending.category} · {money(pending.amount)} · {formatDisplayDate(pending.paidDate)}</p><p>Retry only while signed in to the same account that recorded this expense.</p><button type="button" disabled={saving} className={button} onClick={() => void save(pending)}>Retry same expense</button><button type="button" disabled={saving} className="block underline" onClick={() => { if (window.confirm("This expense may already be recorded. Check the expense list for its paid date before discarding. Discard pending retry?")) { sessionStorage.removeItem("ethn-finance-pending"); setPending(null); setSaveMessage("Check the expense list before entering this expense again."); } }}>Discard pending retry</button></div>}
        </form>
      </DialogContent></Dialog>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); applyFilters({ ...filters, q: searchDraft.trim() }); }}><label className="grid min-w-0 flex-1 basis-56 gap-1 text-sm font-medium">Search expense title<input className={input} type="search" maxLength={100} value={searchDraft} onChange={e => setSearchDraft(e.target.value)} /></label><Button variant="outline" type="submit">Search</Button><label className="grid gap-1 text-sm font-medium">Category<select className={input} value={filters.category} onChange={e => applyFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label></form>
        {listError ? <p role="alert" className="mt-5 text-red-700">{listError} <button className="underline" onClick={retryExpenses}>Retry</button></p> : <><div role="region" aria-label="Expense results table" tabIndex={0} className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"><table className="w-full text-left text-sm"><thead><tr><th scope="col">Expense</th><th scope="col">Paid date</th><th scope="col">Amount</th><th scope="col">Actions</th></tr></thead><tbody aria-busy={listLoading}>{listLoading ? <tr><td colSpan={4}><LoadingRows label="Loading expenses" /></td></tr> : expenses?.rows.map(row => <tr key={row.id} className="border-t"><th scope="row" className="py-3 pr-4 font-semibold">{row.title}<span className="block font-normal text-muted-foreground">{row.category}{row.vendor ? " ? " + row.vendor : ""}</span></th><td className="py-3 pr-4">{formatDisplayDate(row.paidDate)}</td><td className="py-3 pr-4 tabular-nums">{money(row.effectiveAmount)}</td><td className="py-3"><ExpenseActions expense={row} today={today} inputClass={input} onSaved={deleted => { if (deleted && page > 1 && expenses.rows.length === 1) setPage(page - 1); invalidate?.(); }} /></td></tr>)}</tbody></table></div>{expenses && <div className="mt-4"><TablePager page={expenses.page} pageSize={expenses.limit} total={expenses.total} onPageChange={setPage} busy={listLoading} /></div>}{!listLoading && expenses?.rows.length === 0 && <p className="mt-5 text-sm text-slate-600 text-center"><EmptyIcon /> No recorded expenses in this date range.</p>}</>}
      </section>

    </div>
  </main>;
}

function ApprovalReport({ from, to }: { from: string; to: string }) {
  const { data: report, loading, error, retry: retryReport } = useDashboardResource<FinanceReport & { from: string; to: string }>(`/api/ethn/admin/finance?${new URLSearchParams({ from, to, basis: "approval" })}`);
  return <>
    <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Approval report</h2><FinanceInfo label="How approval totals are calculated">Booking revenue is counted on the original payment approval date in Manila; expenses use their paid date. Net profit is booking revenue less expenses, not full accounting profit. Cancelled or refunded bookings are excluded, so past reports can change. Extensions and manual sales are excluded.</FinanceInfo></div>
    <section aria-label="Finance summary" aria-busy={loading}>
      {loading ? <ReportStats /> : error ? <p role="alert" className="text-red-700">{error} <button className="underline" onClick={retryReport}>Retry</button></p> : report && <ReportStats report={report} />}
    </section>
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-label="Revenue and profit trend" aria-busy={loading}>
      <div className="mb-5"><h2 className="font-semibold">Revenue and profit trend</h2></div>
      {loading ? <Skeleton role="status" aria-label="Loading revenue and profit trend" className="h-64 w-full motion-reduce:animate-none" /> : error ? <p className="text-sm text-slate-600">Trend unavailable. Retry the report above.</p> : report && <>{report.days.every(day => day.revenueCents === 0 && day.expenseCents === 0 && day.bookings === 0) && <p className="mb-4 text-sm text-slate-600">No activity in this date range.</p>}<FinanceChart days={report.days} /></>}
    </section>
  </>;
}
