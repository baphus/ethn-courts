import { Archive, CalendarCheck, CheckCircle2, CircleX, Clock3, Lock, TimerOff, Undo2, type LucideIcon } from "lucide-react";

const gray = "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const styles: Record<string, { icon: LucideIcon; className: string; accent: string }> = {
  pending: { icon: Clock3, className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100", accent: "text-amber-700 dark:text-amber-300" },
  confirmed: { icon: CalendarCheck, className: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100", accent: "text-blue-700 dark:text-blue-300" },
  completed: { icon: CheckCircle2, className: "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100", accent: "text-green-700 dark:text-green-300" },
  rejected: { icon: CircleX, className: "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100", accent: "text-red-700 dark:text-red-300" },
  refunded: { icon: Undo2, className: "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100", accent: "text-violet-700 dark:text-violet-300" },
  held: { icon: Lock, className: gray, accent: "text-slate-700 dark:text-slate-300" },
  expired: { icon: TimerOff, className: gray, accent: "text-slate-700 dark:text-slate-300" },
  cancelled: { icon: CircleX, className: gray, accent: "text-slate-700 dark:text-slate-300" },
  archived: { icon: Archive, className: gray, accent: "text-slate-700 dark:text-slate-300" },
};

export function bookingStatusStyle(state: string) {
  const key = state.toLowerCase();
  return Object.hasOwn(styles, key) ? styles[key] : styles.held;
}

export function BookingStatusBadge({ state }: { state: string }) {
  const { icon: Icon, className } = bookingStatusStyle(state);
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${className}`}><Icon className="size-3.5 shrink-0" aria-hidden="true" />{state.replaceAll("_", " ")}</span>;
}
