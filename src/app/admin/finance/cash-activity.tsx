"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { Button } from "@/components/ui/button";
import { cashChange, formatCashAmount, type CashReport } from "@/lib/admin/finance-cash";
import { FinanceInfo } from "./finance-info";

const series = [
  ["bookingPayments", "Booking and extension receipts"],
  ["otherSales", "Other sales"],
  ["expenses", "Expenses"],
  ["refunds", "External refunds"],
] as const;
const metrics = [...series, ["net", "Net recorded cash"]] as const;
const pesos = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function CashActivity({ from, to, refresh }: { from: string; to: string; refresh: number }) {
  const [report, setReport] = useState<CashReport | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError(false);
    fetch(`/api/ethn/admin/finance?${new URLSearchParams({ basis: "cash", from, to })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setReport(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [from, to, refresh, retry]);
  const methodTotal = report?.paymentMethods.reduce((sum, { amount }) => sum + Number(amount), 0) ?? 0;
  return <section className="space-y-4" aria-labelledby="cash-activity-heading" aria-busy={!report && !error}>
    <div className="flex items-center gap-2"><h2 id="cash-activity-heading" className="text-lg font-semibold">Cash activity</h2><FinanceInfo label="About cash activity">Manila receipt dates for verified booking and extension payments. When receipt time is missing, the verification date is used instead. Sales, corrections and recorded external refunds use their own ledger dates. Net recorded cash is receipts and sales less expenses and refunds.</FinanceInfo></div>
    {error ? <p role="alert">Cash activity unavailable. <Button variant="link" onClick={() => setRetry(n => n + 1)}>Retry</Button></p> : !report ? <LoadingAnimation label="Loading cash activity" /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([key, label]) => {
        const change = cashChange(report.current[key], report.previous[key]);
        return <div key={key} className="rounded-xl border bg-card p-4 shadow-sm"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{formatCashAmount(report.current[key])}</p>{change && <p className="mt-2"><span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{change} vs previous period</span></p>}</div>;
      })}</div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm"><div className="mb-5"><h3 className="font-semibold">Cash activity trend</h3><p className="mt-1 text-sm text-muted-foreground">Daily activity in the selected period</p></div>
          <div className="h-72 w-full"><ResponsiveContainer><LineChart data={report.daily.map(day => ({ date: day.date, ...Object.fromEntries(series.map(([key]) => [key, Number(day[key])])) }))}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={value => pesos.format(Number(value))} /><Legend />
            {series.map(([key, label], i) => <Line key={key} dataKey={key} name={label} stroke={`var(--chart-${i + 1})`} strokeWidth={2} strokeDasharray={i ? `${i + 2} ${i + 1}` : undefined} dot={false} />)}
          </LineChart></ResponsiveContainer></div>
        </div>
        <aside className="space-y-4"><section className="rounded-xl border bg-card p-5 shadow-sm"><h3 className="font-semibold">Payment methods</h3><p className="mt-1 text-xs text-muted-foreground">Verified booking and extension receipts</p><div className="mt-4 space-y-3">{report.paymentMethods.map(({ id, name, amount }) => <div key={id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{name}</span><span className="text-right tabular-nums">{formatCashAmount(amount)}{methodTotal > 0 && Number(amount) >= 0 && <span className="ml-2 text-muted-foreground">{(Number(amount) / methodTotal * 100).toFixed(1)}%</span>}</span></div>)}</div></section>
          <section className="rounded-xl border bg-card p-5 shadow-sm"><h3 className="font-semibold">Expense categories</h3><p className="mt-1 text-xs text-muted-foreground">Highest amounts by ledger date, including corrections</p><div className="mt-4 space-y-3">{report.expenseCategories.length ? [...report.expenseCategories].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5).map(item => <div key={item.category} className="flex justify-between gap-3 text-sm"><span>{item.category}</span><span className="tabular-nums">{formatCashAmount(item.amount)}</span></div>) : <p className="text-sm text-muted-foreground">No expenses in this period.</p>}</div></section></aside>
      </div>
    </>}
  </section>;
}
