"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, DollarSign, ReceiptText, SlidersHorizontal, TrendingUp } from "lucide-react";
import { StatCard, STAT_CARD_GRID } from "@/components/admin/stat-card";
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
import { addDaysManilaStr, manilaTodayStr } from "@/lib/courts";
import { buildFinanceSheet, type FinanceExportInput } from "@/lib/admin/finance-export";
import { ExpenseActions, ExpenseFields, type Expense } from "./expense-actions";
type Expenses = { rows: Expense[]; page: number; limit: number; total: number };
type Payload = { title: string; category: string; amount: string; paidDate: string; idempotencyKey: string; description?: string; vendor?: string; notes?: string };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const money = (value: string) => `₱${value}`;
const formatCents = (value: number) => {
  const cents = BigInt(Math.abs(value));
  return `₱${value < 0 ? "-" : ""}${(cents / BigInt(100)).toLocaleString("en-PH")}.${String(cents % BigInt(100)).padStart(2, "0")}`;
};

export default function Finance() {
  const [today] = useState(() => manilaTodayStr());
  const params = useSearchParams();
  const filters = useMemo(() => financeFilters(params, today), [params, today]);
  const { from, to } = filters;
  const [draft, setDraft] = useState(filters);
  const filterKey = JSON.stringify(filters);
  const [pagination, setPagination] = useState({ key: filterKey, page: 1 });
  const page = pagination.key === filterKey ? pagination.page : 1;
  const setPage = (page: number) => setPagination({ key: filterKey, page });
  const [report, setReport] = useState<(FinanceReport & { from: string; to: string }) | null>(null);
  const currentRange = useRef(filters);
  currentRange.current = filters;
  const [expenses, setExpenses] = useState<Expenses | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<Payload | null>(null);
  const [saving, setSaving] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function exportReport() {
    if (!report || report.from !== filters.from || report.to !== filters.to || loading || error || exporting) return;
    setExporting(true); setExportError("");
    try {
      const range = filters;
      const response = await fetch(`/api/ethn/admin/finance/export?${new URLSearchParams(range)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const exported: Pick<FinanceExportInput, "bookings" | "expenses"> & { from: string; to: string; generated: string } = await response.json();
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      if (exported.from !== range.from || exported.to !== range.to || Object.keys(range).some(key => currentRange.current[key as keyof typeof range] !== range[key as keyof typeof range])) throw new Error();
      const { rows, columns } = buildFinanceSheet({ ...exported, period: `${formatDisplayDate(range.from)} ? ${formatDisplayDate(range.to)}`, generated: formatDisplayDate(exported.generated) });
      await writeXlsxFile(rows, { sheet: "Finance", columns, stickyRowsCount: 3 }).toFile(`finance-${range.from}_${range.to}.xlsx`);
    } catch { setExportError("Could not export report. Please try again."); }
    finally { setExporting(false); }
  }

  useEffect(() => {
    try { const saved = sessionStorage.getItem("ethn-finance-pending"); if (saved) setPending(JSON.parse(saved)); } catch { setSaveMessage("Could not restore pending expense. Check the expense list before recording another."); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setReport(null); setError("");
    fetch(`/api/ethn/admin/finance?${new URLSearchParams({ from, to, basis: "approval" })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setReport(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Report unavailable. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true); setExpenses(null); setListError("");
    fetch(`/api/ethn/admin/expenses?${new URLSearchParams({ ...filters, page: String(page), limit: "20" })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setExpenses(data); })
      .catch(() => { if (!controller.signal.aborted) setListError("Expenses unavailable. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [filters, page, refresh]);

  async function save(payload: Payload) {
    try { sessionStorage.setItem("ethn-finance-pending", JSON.stringify(payload)); } catch { setSaveMessage("Cannot safely save retry details in this browser. Expense was not sent."); return; }
    setPending(payload); setSaving(true); setSaveMessage("");
    try {
      const response = await fetch("/api/ethn/admin/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status >= 500 || response.status === 409) throw new Error();
      if (!response.ok) { sessionStorage.removeItem("ethn-finance-pending"); setPending(null); setSaveMessage("Expense was not accepted. Check the details and try again."); return; }
      const record = await response.json();
      if (!record || typeof record.id !== "string" || record.title !== payload.title.trim() || record.category !== payload.category || typeof record.amount !== "string" || record.paidDate !== payload.paidDate) throw new Error();
      sessionStorage.removeItem("ethn-finance-pending"); setPending(null); setSaveMessage("Expense recorded."); setExpenseOpen(false); setPage(1); setRefresh(n => n + 1);
    } catch {
      setSaveMessage("Result uncertain. Retry the same expense, or check the expense list before discarding it.");
    } finally { setSaving(false); }
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

  return <main className="mx-auto max-w-7xl space-y-8 p-4 text-slate-900 sm:p-8">
    <header className="space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Finance</h1><p className="max-w-3xl text-sm leading-6 text-slate-600">Booking revenue is counted on the original payment approval date in Manila; expenses use their paid date. Net profit is booking revenue less expenses, not full accounting profit. Cancelled or refunded bookings are excluded, so past reports can change. Extensions and manual sales are excluded.</p></header>
    <div className="flex flex-wrap items-center gap-3">
      <Sheet open={rangeOpen} onOpenChange={open => { setRangeOpen(open); if (open) { setDraft(filters); setFilterError(""); } }}>
        <SheetTrigger render={<Button variant="outline" />}><SlidersHorizontal aria-hidden="true" /> Filters</SheetTrigger>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b"><SheetTitle>Filters</SheetTitle><SheetDescription>Choose a reporting period or narrow expenses by category and title.</SheetDescription></SheetHeader>
          <form onSubmit={event => { event.preventDefault(); applyFilters(draft); }} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              <fieldset><legend className="mb-2 font-medium">Quick date range</legend><div className="flex flex-wrap gap-2">
                {[7, 30, 90].map(days => { const start = addDaysManilaStr(today, 1 - days); return <Button key={days} type="button" size="sm" variant={from === start && to === today ? "secondary" : "outline"} onClick={() => applyFilters({ ...filters, from: start, to: today })}>Last {days} days</Button>; })}
              </div></fieldset>
              <label className="grid gap-1 text-sm font-medium">From<input className={input} type="date" required max={today} value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
              <label className="grid gap-1 text-sm font-medium">To<input className={input} type="date" required max={today} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
              <label className="grid gap-1 text-sm font-medium">Category<select className={input} value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-medium">Title search<input className={input} type="search" maxLength={100} value={draft.q} onChange={e => setDraft({ ...draft, q: e.target.value })} /></label>
              {filterError && <p role="alert" className="text-sm text-destructive">{filterError}</p>}
            </div>
            <SheetFooter className="flex-row justify-between border-t"><Button variant="ghost" type="button" onClick={() => applyFilters(null)}>Reset</Button><Button type="submit">Apply filters</Button></SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <p className="text-sm text-muted-foreground">{formatDisplayDate(from)} to {formatDisplayDate(to)}{filters.category && ` ? ${filters.category}`}{filters.q && ` ? Title: ${filters.q}`}</p>
      <button type="button" className={button} disabled={loading || !!error || !report || report.from !== filters.from || report.to !== filters.to || exporting} onClick={() => void exportReport()}>{exporting ? "Exporting…" : "Export to Sheets"}</button>
      <p className="text-sm text-muted-foreground">XLSX includes customer names and emails. Expense filters change workbook expenses and profit, not the page totals.</p>
      <Dialog open={expenseOpen} onOpenChange={open => { if (open) setExpenseOpen(true); else if (!saving) setExpenseOpen(false); }}><DialogTrigger render={<Button />}>Add expense</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogTitle>Record expense</DialogTitle><DialogDescription>Record an expense already paid.</DialogDescription>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-bold">Record paid expense</h2><p className="mt-1 text-sm leading-6 text-slate-600">Expenses are recorded on the date paid.</p>
        <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); if (!pending) { const fields = new FormData(e.currentTarget); const get = (key: string) => String(fields.get(key) ?? ""); void save({ title: get("title"), category: get("category"), amount: get("amount"), paidDate: get("paidDate"), description: get("description"), vendor: get("vendor"), notes: get("notes"), idempotencyKey: crypto.randomUUID() }); } }}>
          <fieldset disabled={!!pending || saving} className="space-y-4 disabled:opacity-60"><ExpenseFields today={today} className={input} /><button className={`${button} w-full`} disabled={saving}>Record expense</button></fieldset>
          {saveMessage && <p role="status" className="text-sm text-slate-700">{saveMessage}</p>}
          {pending && <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><p>Pending: {pending.title} · {pending.category} · {money(pending.amount)} · {formatDisplayDate(pending.paidDate)}</p><p>Retry only while signed in to the same account that recorded this expense.</p><button type="button" disabled={saving} className={button} onClick={() => void save(pending)}>Retry same expense</button><button type="button" disabled={saving} className="block underline" onClick={() => { if (window.confirm("This expense may already be recorded. Check the expense list for its paid date before discarding. Discard pending retry?")) { sessionStorage.removeItem("ethn-finance-pending"); setPending(null); setSaveMessage("Check the expense list before entering this expense again."); } }}>Discard pending retry</button></div>}
        </form>
      </section></DialogContent></Dialog>
      <span id="finance-sale-action" className="contents" />
      {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
    </div>
    <section aria-label="Finance summary" aria-busy={loading}>
      {loading ? <LoadingAnimation label="Loading report" className="py-4" /> : error ? <p role="alert" className="text-red-700">{error} <button className="underline" onClick={() => setRefresh(n => n + 1)}>Retry</button></p> : report && <div className={STAT_CARD_GRID}>
        <StatCard label="Booking Revenue" value={formatCents(report.revenueCents)} icon={DollarSign} subtitle="Counted on approval date" />
        <StatCard label="Expenses" value={formatCents(report.expenseCents)} icon={ReceiptText} subtitle="Effective amounts by paid date" />
        <StatCard label="Net Profit" value={formatCents(report.profitCents)} icon={TrendingUp} subtitle="Booking revenue less expenses" />
        <StatCard label="Booking Count" value={String(report.bookings)} icon={CalendarDays} subtitle="Eligible bookings approved in range" />
      </div>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="Revenue and profit trend" aria-busy={loading}>
      <div className="mb-5"><h2 className="text-xl font-bold">Revenue and profit trend</h2><p className="mt-1 text-sm text-slate-600">Daily, weekly, or monthly totals based on the selected range.</p></div>
      {loading ? <LoadingAnimation label="Loading trend" className="py-4" /> : error ? <p className="text-sm text-slate-600">Trend unavailable. Retry the report above.</p> : report && <>{report.days.every(day => day.revenueCents === 0 && day.expenseCents === 0 && day.bookings === 0) && <p className="mb-4 text-sm text-slate-600">No activity in this date range.</p>}<FinanceChart days={report.days} /></>}
    </section>
    <Sales from={from} to={to} onSaved={() => setRefresh(n => n + 1)} />
    <CashActivity key={`${from}:${to}`} from={from} to={to} refresh={refresh} />
    {pending && !expenseOpen && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"><span>Expense outcome uncertain. Review or retry the saved request before recording another.</span><Button onClick={() => setExpenseOpen(true)}>Resume pending expense</Button></div>}
    <div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-bold">Recorded expenses</h2><p className="mt-1 text-sm text-slate-600">Paid expenses in the selected period. Edits and deletes are audited.</p>
        {listLoading ? <LoadingAnimation label="Loading expenses" className="mt-5" /> : listError ? <p role="alert" className="mt-5 text-red-700">{listError} <button className="underline" onClick={() => setRefresh(n => n + 1)}>Retry</button></p> : expenses?.rows.length ? <><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col">Expense</th><th scope="col">Paid date</th><th scope="col">Amount</th><th scope="col">Actions</th></tr></thead><tbody>{expenses.rows.map(row => <tr key={row.id} className="border-t"><th scope="row" className="py-3 pr-4 font-semibold">{row.title}<span className="block font-normal text-muted-foreground">{row.category}{row.vendor ? " ? " + row.vendor : ""}</span></th><td className="py-3 pr-4">{formatDisplayDate(row.paidDate)}</td><td className="py-3 pr-4 tabular-nums">{money(row.effectiveAmount)}</td><td className="py-3"><ExpenseActions expense={row} today={today} inputClass={input} onSaved={deleted => { if (deleted && page > 1 && expenses.rows.length === 1) setPage(page - 1); setRefresh(n => n + 1); }} /></td></tr>)}</tbody></table></div><div className="mt-4 flex items-center gap-4 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="underline disabled:opacity-40">Previous</button><span>Page {page} · {expenses.total} expenses</span><button disabled={page * expenses.limit >= expenses.total} onClick={() => setPage(page + 1)} className="underline disabled:opacity-40">Next</button></div></> : <p className="mt-5 text-sm text-slate-600 text-center"><EmptyIcon /> No recorded expenses in this date range.</p>}
      </section>

    </div>
  </main>;
}
