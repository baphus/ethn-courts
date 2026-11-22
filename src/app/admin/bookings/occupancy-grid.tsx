"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBookingDate } from "@/lib/admin/bookings";
import { formatSlotRangesWithDates } from "@/lib/courts";
import { manilaDateStr } from "@/lib/booking/slots";
import type { getDailyOccupancy, OccupancyBooking, OccupancyCell } from "@/lib/admin/occupancy";

const colors: Record<OccupancyCell["state"], string> = {
  Approved: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  Pending: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  Hold: "border-sky-200 bg-sky-50 text-sky-900",
  Free: "border-border bg-background text-muted-foreground",
  Closed: "border-border bg-muted/70 text-muted-foreground",
};

export default function OccupancyGrid({ date, data }: { date: string; data: Awaited<ReturnType<typeof getDailyOccupancy>> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<OccupancyBooking | null>(null);
  function changeDate(value: string) {
    if (!value) return;
    const next = new URLSearchParams(params.toString());
    next.set("occupancyDate", value);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }
  return (
    <section aria-labelledby="occupancy-title" className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h2 id="occupancy-title" className="text-lg font-semibold">Today&apos;s Bookings</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">Schedule date
            <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" />
          </label>
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw className={pending ? "animate-spin" : ""} /> Refresh</Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Occupancy legend">
        {(["Approved", "Pending", "Hold", "Free", "Closed"] as const).map((state) => <span key={state} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm border ${colors[state]}`} />{state}</span>)}
      </div>
      {data.courts.length === 0 ? <p className="py-6 text-sm text-muted-foreground text-center"><EmptyIcon /> No courts to show for this date.</p> : (
        <div className="max-h-[560px] overflow-auto rounded-lg border" aria-busy={pending} tabIndex={0} role="region" aria-label="Daily court occupancy, scroll to view">
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <thead><tr><th scope="col" className="sticky top-0 left-0 z-30 min-w-32 border-r border-b bg-muted px-3 py-3 text-xs font-semibold">Time</th>{data.courts.map((court) => <th key={court.id} scope="col" className="sticky top-0 z-20 min-w-40 border-r border-b bg-muted px-3 py-3 text-xs font-semibold last:border-r-0">{court.name}{court.status !== "active" && <span className="block font-normal text-muted-foreground">Inactive</span>}</th>)}</tr></thead>
            <tbody>{data.starts.map((start, i) => {
              const d = new Date(start);
              const day = manilaDateStr(d);
              const time = d.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
              return <tr key={start}><th scope="row" className="sticky left-0 z-10 border-r border-b bg-background px-3 py-2 align-top text-xs font-medium"><span className="block">{time}</span><span className="mt-0.5 block whitespace-nowrap font-normal text-muted-foreground">{day === date ? "" : `${formatBookingDate(day)} · next day`}</span></th>{data.courts.map((court) => {
                const cell = court.cells[i]!;
                return <td key={court.id} className="border-r border-b p-1 last:border-r-0">{cell.booking ? <button type="button" onClick={() => setSelected(cell.booking!)} className={`min-h-12 w-full rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${colors[cell.state]}`}><span className="block text-xs font-semibold">{cell.state}</span><span className="block break-words text-xs">{cell.booking.name}</span></button> : <div className={`flex min-h-12 items-center rounded-md border px-2.5 text-xs font-medium ${colors[cell.state]}`}>{cell.state}</div>}</td>;
              })}</tr>;
            })}</tbody>
          </table>
        </div>
      )}
      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Booking details</DialogTitle><DialogDescription>Read-only booking information.</DialogDescription></DialogHeader>{selected && <dl className="grid gap-3 text-sm">{[["Booking code", selected.code], ["Customer", selected.name], ["Status", selected.status], ["Full time range", `${formatBookingDate(manilaDateStr(new Date(selected.starts.slice().sort()[0]!)))} · ${formatSlotRangesWithDates(selected.starts)}`]].map(([label, value]) => <div key={label} className="grid gap-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>}</DialogContent></Dialog>
    </section>
  );
}
