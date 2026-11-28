"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDisplayDate } from "@/lib/display-date";
import { validOccupancyPeriod } from "@/lib/admin/dashboard-analytics-helpers";

export type Period = { from: string; to: string };

export function OccupancyFilters({ period, onApply, onReset }: { period: Period | null; onApply: (period: Period) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Period>(period ?? { from: "", to: "" });
  const [error, setError] = useState("");
  const from = period?.from ?? "", to = period?.to ?? "";
  useEffect(() => { if (open) { setDraft({ from, to }); setError(""); } }, [open, from, to]);
  function apply() {
    if (!validOccupancyPeriod(draft.from, draft.to)) { setError("Choose a valid range of up to 31 days."); return; }
    onApply(draft); setOpen(false);
  }
  return <div className="flex flex-wrap items-center gap-2">
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}><SlidersHorizontal aria-hidden="true" /> Filters</SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b"><SheetTitle>Occupancy filters</SheetTitle><SheetDescription>Choose any 31-day period, including future dates.</SheetDescription></SheetHeader>
        <form onSubmit={event => { event.preventDefault(); apply(); }} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <label className="grid gap-1 text-sm font-medium">From<DateField required value={draft.from} onValueChange={from => setDraft(value => ({ ...value, from }))} /></label>
            <label className="grid gap-1 text-sm font-medium">To<DateField required value={draft.to} onValueChange={to => setDraft(value => ({ ...value, to }))} /></label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <SheetFooter className="flex-row justify-between border-t"><Button type="button" variant="ghost" onClick={() => { onReset(); setOpen(false); }}>Reset</Button><Button type="submit">Apply</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
    {period && <p className="text-sm text-muted-foreground">{formatDisplayDate(period.from)} – {formatDisplayDate(period.to)}</p>}
  </div>;
}
