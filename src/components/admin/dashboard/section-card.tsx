"use client";
import "../court-view.css";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useDashboardResource } from "./dashboard-resource";
import { Button } from "@/components/ui/button";

export function useAnalytics<T>(query: string | null) {
  const reporting = query !== null && !/^section=(schedule|window)(?:&|$)/.test(query);
  return useDashboardResource<T>(query === null ? null : `/api/ethn/admin/dashboard/analytics?${query}`, reporting ? 300_000 : undefined);
}
export type AnalyticsState<T> = ReturnType<typeof useAnalytics<T>>;

/** Stable skeleton while loading, retryable error, and dimmed content while a new range loads. */
export function Body<T>({ state, skeleton = "h-48", children }: { state: { data: T | null; error: string; loading: boolean; retry: () => void }; skeleton?: string; children: (data: T) => ReactNode }) {
  if (state.error) return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 p-3 text-sm">{state.error}<Button type="button" size="sm" variant="outline" onClick={state.retry}>Retry</Button></div>;
  if (!state.data) return <div role="status" aria-busy="true" className={`motion-safe:animate-pulse rounded-lg bg-muted/50 ${skeleton}`}><span className="sr-only">Loading</span></div>;
  return <div aria-busy={state.loading} className={`transition-opacity duration-200 ${state.loading ? "opacity-60" : ""}`}>{children(state.data)}</div>;
}

export function Card({ title, subtitle, action, children, className = "" }: { title: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section aria-label={title} className={`rounded-xl border bg-card p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-sm font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

export function Segmented<T extends string>({ value, onChange, options, label, disabled }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string; disabled?: boolean }) {
  return <div role="group" aria-label={label} className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
    {options.map(o => <button key={o.value} type="button" aria-pressed={value === o.value} disabled={disabled} onClick={() => onChange(o.value)} className={`rounded-md px-2.5 py-1 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{o.label}</button>)}
  </div>;
}

/** Percentage chip. Returns nothing when there is no comparable baseline. */
export function deltaChip(current: bigint, prior: bigint) {
  if (prior <= BigInt(0)) return null;
  const diff = current - prior, abs = diff < BigInt(0) ? -diff : diff, tenths = abs * BigInt(1000) / prior;
  return { text: `${diff === BigInt(0) ? "" : diff > BigInt(0) ? "+" : "−"}${tenths / BigInt(10)}.${tenths % BigInt(10)}%`, direction: diff > BigInt(0) ? "up" : diff < BigInt(0) ? "down" : "flat" } as const;
}
export function Chip({ chip, title }: { chip: ReturnType<typeof deltaChip>; title: string }) {
  if (!chip) return null;
  const Icon = chip.direction === "up" ? ArrowUpRight : chip.direction === "down" ? ArrowDownRight : Minus;
  const tone = chip.direction === "up" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : chip.direction === "down" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" : "bg-muted text-muted-foreground";
  return <span title={title} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${tone}`}><Icon className="size-3" aria-hidden="true" />{chip.text}<span className="sr-only"> {title}</span></span>;
}

export function hourLabel(offset: number, long = false) {
  const h = offset % 24, h12 = h % 12 || 12;
  return long ? `${h12} ${h < 12 ? "AM" : "PM"}` : `${h12}${h < 12 ? "a" : "p"}`;
}
export function minutesLabel(minutes: number) {
  const m = Math.round(minutes), h = Math.floor(m / 60);
  return h ? (m % 60 ? `${h} h ${m % 60} min` : `${h} h`) : `${m} min`;
}
export function usePrefersReducedMotion() {
 const [reduce, setReduce] = useState(true);
 useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduce(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
 return reduce;
}
