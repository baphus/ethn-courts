import Link from "next/link";
import { CheckCircle2, Hourglass } from "lucide-react";
import type { attention } from "./court-timeline-utils";
import { durationLabel, timelineTime } from "./court-timeline-utils";

type Item = ReturnType<typeof attention>[number];

export function AttentionPanel({ items, now, onOpen }: { items: Item[]; now: number; onOpen: (id: string) => void }) {
  return <aside className="self-start rounded-2xl border bg-card p-4 shadow-sm xl:sticky xl:top-4">
    <div className="flex items-center gap-2">
      <h2 className="font-semibold">Needs payment review</h2>
      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 tabular-nums dark:bg-orange-950 dark:text-orange-300">{items.length}</span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">Pending past scheduled start</p>
    {items.length ? <ul className="mt-3 max-h-[520px] divide-y overflow-y-auto">
      {items.map(({ item, court }, i) => <li key={item.id} className="cv-rise flex items-start gap-3 py-3" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" aria-hidden="true"><Hourglass className="size-4" /></span>
        <div className="min-w-0 flex-1 text-sm">
          <p><strong className="font-semibold">{item.guestName || "Guest"}</strong> pending review</p>
          <p className="text-xs text-muted-foreground">{court.name} started {timelineTime(item.startsAt)} · {durationLabel(now - Date.parse(item.startsAt))} ago</p>
        </div>
        <button type="button" onClick={() => onOpen(item.bookingId!)} className="shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary">Open</button>
      </li>)}
    </ul> : <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />All caught up. None past start.</div>}
    <Link href="/admin/bookings?status=pending" className="mt-4 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline">Review payments</Link>
  </aside>;
}
