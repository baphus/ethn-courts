"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { Button } from "@/components/ui/button";

const series = [
  ["bookingPayments", "Booking and extension payments"],
  ["otherSales", "Other sales"],
  ["expenses", "Expenses"],
  ["refunds", "External refunds"],
] as const;
type Day = { date: string } & Record<(typeof series)[number][0], string>;
const pesos = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function CashActivity({ from, to, refresh }: { from: string; to: string; refresh: number }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDays(null); setError(false);
    fetch(`/api/ethn/admin/finance?${new URLSearchParams({ from, to })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setDays(data.daily); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [from, to, refresh, retry]);
  return <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="cash-activity-heading" aria-busy={!days && !error}>
    <h2 id="cash-activity-heading" className="text-xl font-bold">Cash activity</h2>
    <p className="mb-5 mt-1 text-sm text-muted-foreground">Manila receipt dates for verified payments. When receipt time is missing, the verification date is used instead. Corrections and recorded external refunds use their own ledger dates.</p>
    {error ? <p role="alert">Cash activity unavailable. <Button variant="link" onClick={() => setRetry(n => n + 1)}>Retry</Button></p> : !days ? <LoadingAnimation label="Loading cash activity" /> : <>
      <div className="h-72 w-full"><ResponsiveContainer><LineChart data={days.map(day => ({ date: day.date, ...Object.fromEntries(series.map(([key]) => [key, Number(day[key])])) }))}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={value => pesos.format(Number(value))} /><Legend />
        {series.map(([key, label], i) => <Line key={key} dataKey={key} name={label} stroke={`var(--chart-${i + 1})`} strokeWidth={2} strokeDasharray={i ? `${i + 2} ${i + 1}` : undefined} dot={false} />)}
      </LineChart></ResponsiveContainer></div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer">View daily cash activity data</summary><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th scope="col">Date</th>{series.map(([key, label]) => <th key={key} scope="col" className="px-2">{label}</th>)}</tr></thead><tbody>
        {days.map(day => <tr key={day.date} className="border-t"><th scope="row">{day.date}</th>{series.map(([key]) => <td key={key} className="px-2 tabular-nums">₱{day[key]}</td>)}</tr>)}
      </tbody></table></div></details>
    </>}
  </section>;
}
