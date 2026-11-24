"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, DollarSign, ReceiptText, TrendingUp } from "lucide-react";
import { StatCard, STAT_CARD_GRID } from "@/components/admin/stat-card";
import { FinanceChart } from "@/components/admin/finance-chart";
import type { FinanceReport } from "@/lib/admin/finance";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDisplayDate } from "@/lib/display-date";
import { Button } from "@/components/ui/button";
import { addDaysManilaStr, manilaTodayStr } from "@/lib/courts";
import { financeExportRows, type Report } from "./finance-export";
import { ExpenseCorrection } from '@/components/admin/expense-correction';
type Expense = { id: string; title: string; category: string; amount: string; effectiveAmount:string; lastCorrectionId:string|null; paidDate: string };
type Expenses = { rows: Expense[]; page: number; limit: number; total: number };
const categories = ["Other", "Utilities", "Maintenance", "Supplies", "Staff"];
type Payload = { title: string; category: string; amount: string; paidDate: string; idempotencyKey: string };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const money = (value: string) => `₱${value}`;
const formatCents = (value: number) => {
  const cents = BigInt(Math.abs(value));
  return `₱${value < 0 ? "-" : ""}${(cents / BigInt(100)).toLocaleString("en-PH")}.${String(cents % BigInt(100)).padStart(2, "0")}`;
};

export default function Finance() {
  const [today] = useState(() => manilaTodayStr());
  const [draft, setDraft] = useState(() => { const to = manilaTodayStr(); return { from: addDaysManilaStr(to, -29), to }; });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
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
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paidDate, setPaidDate] = useState(today);
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
      const range = { ...filters };
      const response = await fetch(`/api/ethn/admin/finance?${new URLSearchParams(range)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const legacyReport: Report = await response.json();
      if (legacyReport.from !== range.from || legacyReport.to !== range.to || currentRange.current.from !== range.from || currentRange.current.to !== range.to) throw new Error();
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      if (currentRange.current.from !== range.from || currentRange.current.to !== range.to) throw new Error();
      await writeXlsxFile(financeExportRows(legacyReport), { sheet: "Finance", columns: [18, 20, 20, 20, 32, 22, 22, 32].map(width => ({ width })) }).toFile(`finance-${range.from}-to-${range.to}.xlsx`);
    } catch { setExportError("Could not export report. Please try again."); }
    finally { setExporting(false); }
  }

  useEffect(() => {
    try { const saved = sessionStorage.getItem("ethn-finance-pending"); if (saved) setPending(JSON.parse(saved)); } catch { setSaveMessage("Could not restore pending expense. Check the expense list before recording another."); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setReport(null); setError("");
    fetch(`/api/ethn/admin/finance?${new URLSearchParams({ ...filters, basis: "approval" })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setReport(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Report unavailable. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, refresh]);

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
      sessionStorage.removeItem("ethn-finance-pending"); setPending(null); setTitle(""); setAmount(""); setSaveMessage("Expense recorded."); setExpenseOpen(false); setPage(1); setRefresh(n => n + 1);
    } catch {
      setSaveMessage("Result uncertain. Retry the same expense, or check the expense list before discarding it.");
    } finally { setSaving(false); }
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.from || !draft.to || draft.from > draft.to || draft.to > today || draft.to > addDaysManilaStr(draft.from, 365)) { setFilterError("Choose a date range of up to 366 days, ending no later than today."); return; }
    setFilterError(""); setPage(1); setFilters({ ...draft }); setRangeOpen(false);
  }

  return <main className="mx-auto max-w-7xl space-y-8 p-4 text-slate-900 sm:p-8">
    <header className="space-y-3"><h1 className="text-2xl font-semibold tracking-tight">Finance</h1><p className="max-w-3xl text-sm leading-6 text-slate-600">Booking revenue is counted on the original payment approval date in Manila; expenses use their paid date. Net profit is booking revenue less expenses, not full accounting profit. Cancelled or refunded bookings are excluded, so past reports can change. Extensions and manual sales are excluded.</p></header>
    <div className="flex flex-wrap items-center gap-3">
      <Popover open={rangeOpen} onOpenChange={open => { setRangeOpen(open); if (open) { setDraft(filters); setFilterError(""); } }}>
        <PopoverTrigger render={<Button variant="outline" />}>Date range</PopoverTrigger>
        <PopoverContent className="w-72 space-y-4 p-4">
          <h2 className="font-semibold">Report date range</h2>
          <form onSubmit={applyFilters} className="space-y-3">
            <label className="grid gap-1 text-sm font-medium">From<input className={input} type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">To<input className={input} type="date" required value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
            {filterError && <p role="alert" className="text-sm text-destructive">{filterError}</p>}
            <Button type="submit">Apply</Button>
          </form>
        </PopoverContent>
      </Popover>
      <p className="text-sm text-muted-foreground">{formatDisplayDate(filters.from)} to {formatDisplayDate(filters.to)}</p>
      <button type="button" className={button} disabled={loading || !!error || !report || report.from !== filters.from || report.to !== filters.to || exporting} onClick={() => void exportReport()}>{exporting ? "Exporting…" : "Download XLSX"}</button>
      <p className="text-sm text-muted-foreground">XLSX uses receipt-date collections and includes sales, refunds, and expenses.</p>
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
    {pending && !expenseOpen && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"><span>Expense outcome uncertain. Review or retry the saved request before recording another.</span><Button onClick={() => setExpenseOpen(true)}>Resume pending expense</Button></div>}
    <Dialog open={expenseOpen} onOpenChange={open => { if (open) setExpenseOpen(true); else if (!saving && (!title && !amount && !category || window.confirm("Close this form? Your entries will remain until you leave this page."))) setExpenseOpen(false); }}><DialogTrigger render={<Button />}>+ Record expense</DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogTitle>Record expense</DialogTitle><DialogDescription>Record an expense already paid. Original entries are permanent.</DialogDescription>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-bold">Record paid expense</h2><p className="mt-1 text-sm leading-6 text-slate-600">Original entries are permanent and audited. Owner corrections append a separately dated record; they never delete history or process a cash return.</p>
        <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); if (!pending) void save({ title, category, amount, paidDate, idempotencyKey: crypto.randomUUID() }); }}>
          <fieldset disabled={!!pending || saving} className="space-y-4 disabled:opacity-60"><label className="block text-sm font-semibold">Title<input required maxLength={100} className={`${input} mt-1`} value={title} onChange={e => setTitle(e.target.value)} /></label><label className="block text-sm font-semibold">Category<select required className={`${input} mt-1`} value={category} onChange={e => setCategory(e.target.value)}><option value="">Select category</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label><label className="block text-sm font-semibold">Amount (PHP)<input required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" className={`${input} mt-1`} value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="block text-sm font-semibold">Paid date<input required type="date" max={today} className={`${input} mt-1`} value={paidDate} onChange={e => setPaidDate(e.target.value)} /></label><button className={`${button} w-full`} disabled={saving}>Record expense</button></fieldset>
          {saveMessage && <p role="status" className="text-sm text-slate-700">{saveMessage}</p>}
          {pending && <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><p>Pending: {pending.title} · {pending.category} · {money(pending.amount)} · {formatDisplayDate(pending.paidDate)}</p><p>Retry only while signed in to the same account that recorded this expense.</p><button type="button" disabled={saving} className={button} onClick={() => void save(pending)}>Retry same expense</button><button type="button" disabled={saving} className="block underline" onClick={() => { if (window.confirm("This expense may already be recorded. Check the expense list for its paid date before discarding. Discard pending retry?")) { sessionStorage.removeItem("ethn-finance-pending"); setPending(null); setSaveMessage("Check the expense list before entering this expense again."); } }}>Discard pending retry</button></div>}
        </form>
      </section></DialogContent></Dialog>
    <div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-bold">Recorded expenses</h2><p className="mt-1 text-sm text-slate-600">Original paid dates within selected range. History is immutable; owner corrections append current-date records without processing cash returns.</p>
        {listLoading ? <LoadingAnimation label="Loading expenses" className="mt-5" /> : listError ? <p role="alert" className="mt-5 text-red-700">{listError} <button className="underline" onClick={() => setRefresh(n => n + 1)}>Retry</button></p> : expenses?.rows.length ? <><div className="mt-5 divide-y divide-slate-100">{expenses.rows.map(row => <div key={row.id} className="flex flex-wrap items-start justify-between gap-4 py-4"><div><p className="font-semibold">{row.title}</p><p className="mt-1 text-sm text-slate-500">{row.category} · {formatDisplayDate(row.paidDate)}</p></div><div><p className="font-semibold tabular-nums">Original {money(row.amount)} · Effective {money(row.effectiveAmount)}</p><details className="mt-2"><summary className="cursor-pointer text-sm underline">Correct entry</summary><ExpenseCorrection expenseId={row.id} lastCorrectionId={row.lastCorrectionId} onCorrect={()=>setRefresh(n=>n+1)}/></details></div></div>)}</div><div className="mt-4 flex items-center gap-4 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="underline disabled:opacity-40">Previous</button><span>Page {page} · {expenses.total} expenses</span><button disabled={page * expenses.limit >= expenses.total} onClick={() => setPage(page + 1)} className="underline disabled:opacity-40">Next</button></div></> : <p className="mt-5 text-sm text-slate-600 text-center"><EmptyIcon /> No recorded expenses in this date range.</p>}
      </section>

    </div>
  </main>;
}
