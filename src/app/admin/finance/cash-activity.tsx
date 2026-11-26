"use client";

import { useDashboardResource } from "@/components/admin/dashboard/dashboard-resource";
import { Skeleton } from "@/components/ui/skeleton";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingRows } from "@/components/admin/loading-slots";
import { Button } from "@/components/ui/button";
import { cashChange, formatCashAmount, type CashReport } from "@/lib/admin/finance-cash";
import { FinanceInfo } from "./finance-info";
import { KpiCard } from "@/components/admin/kpi-row";
import { Wallet } from "lucide-react";

const series = [
  ["bookingPayments", "Booking receipts"],
  ["otherSales", "Other sales"],
  ["expenses", "Expenses"],
] as const;
const metrics = [...series, ["net", "Net recorded cash"]] as const;
const pesos = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function CashActivity({ from, to }: { from: string; to: string }) {
  const { data: report, error, loading, retry } = useDashboardResource<CashReport>(`/api/ethn/admin/finance?${new URLSearchParams({ basis: "cash", from, to })}`);
  const methodTotal = report?.paymentMethods.reduce((sum, { amount }) => sum + Number(amount), 0) ?? 0;
  return <section className="space-y-4" aria-labelledby="cash-activity-heading" aria-busy={loading}>
    <div className="flex items-center gap-2"><h2 id="cash-activity-heading" className="text-lg font-semibold">Cash activity</h2><FinanceInfo label="About cash activity">Verified receipts use Manila receipt dates, or the verification date if no receipt time was recorded. Historical extension receipts are included. Net recorded cash subtracts expenses and recorded refunds.</FinanceInfo></div>
    {error && <p role="alert">{error} <Button variant="link" onClick={retry}>Retry</Button></p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([key, label]) => {
        const change = report && cashChange(report.current[key], report.previous[key]);
        return <KpiCard key={key} label={label} Icon={Wallet} value={report ? formatCashAmount(report.current[key]) : error ? "Unavailable" : <Skeleton className="h-7 w-24 motion-reduce:animate-none" />}>{change && <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{change} vs previous period</span>}{key === "net" && report && <p className="text-xs text-muted-foreground">Recorded refunds deducted: {formatCashAmount(report.current.refunds)}</p>}</KpiCard>;
      })}</div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm"><div className="mb-5"><h3 className="font-semibold">Cash activity trend</h3><p className="mt-1 text-sm text-muted-foreground">Daily activity in the selected period</p></div>
          {report ? <div className="h-72 w-full"><ResponsiveContainer><LineChart data={report.daily.map(day => ({ date: day.date, ...Object.fromEntries(series.map(([key]) => [key, Number(day[key])])) }))}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={value => pesos.format(Number(value))} /><Legend />
            {series.map(([key, label], i) => <Line key={key} dataKey={key} name={label} stroke={`var(--chart-${i + 1})`} strokeWidth={2} strokeDasharray={i ? `${i + 2} ${i + 1}` : undefined} dot={false} />)}
          </LineChart></ResponsiveContainer></div> : !error && <Skeleton className="h-72 w-full motion-reduce:animate-none" />}
        </div>
        <aside className="space-y-4"><section className="rounded-xl border bg-card p-5 shadow-sm"><h3 className="font-semibold">Payment methods</h3><p className="mt-1 text-xs text-muted-foreground">Verified booking receipts</p><div className="mt-4 space-y-3">{!report && !error && <LoadingRows label="Loading payment methods" />}{report?.paymentMethods.map(({ id, name, amount }) => <div key={id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{name}</span><span className="text-right tabular-nums">{formatCashAmount(amount)}{methodTotal > 0 && Number(amount) >= 0 && <span className="ml-2 text-muted-foreground">{(Number(amount) / methodTotal * 100).toFixed(1)}%</span>}</span></div>)}</div></section>
          <details className="rounded-xl border bg-card p-5 shadow-sm"><summary className="cursor-pointer font-semibold">Expense categories</summary><p className="mt-1 text-xs text-muted-foreground">Highest amounts by ledger date, including corrections</p><div className="mt-4 space-y-3">{!report ? !error && <LoadingRows label="Loading expense categories" /> : report.expenseCategories.length ? [...report.expenseCategories].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5).map(item => <div key={item.category} className="flex justify-between gap-3 text-sm"><span>{item.category}</span><span className="tabular-nums">{formatCashAmount(item.amount)}</span></div>) : <p className="text-sm text-muted-foreground">No expenses in this period.</p>}</div></details></aside>
      </div>
  </section>;
}
