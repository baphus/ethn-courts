import { AlertTriangle, CalendarCheck, Clock, Lock, Users, Wrench, type LucideIcon } from "lucide-react";

export function statusStyle(state: string, kind = "booking", overdue = false): { icon: LucideIcon; className: string } {
  if (state === "held") return { icon: Lock, className: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" };
  if (kind !== "booking") return { icon: kind === "maintenance" ? Wrench : kind === "open_play" ? Users : Lock, className: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100" };
  if (overdue) return { icon: AlertTriangle, className: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-100" };
  if (state === "pending") return { icon: Clock, className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" };
  if (state === "confirmed") return { icon: CalendarCheck, className: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100" };
  return { icon: CalendarCheck, className: state === "completed" ? "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" : "border-border bg-muted text-muted-foreground" };
}

export function StatusBadge({ state, kind, overdue }: { state: string; kind?: string; overdue?: boolean }) {
  const { icon: Icon, className } = statusStyle(state, kind, overdue);
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${className}`}><Icon className="size-3.5 shrink-0" aria-hidden="true"/>{overdue ? "Overdue" : state === "held" ? "Unavailable" : kind && kind !== "booking" ? kind.replaceAll("_", " ") : state}</span>;
}
