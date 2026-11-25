import { Lock, Users, Wrench, type LucideIcon } from "lucide-react";
import { bookingStatusStyle } from "@/components/booking/booking-status";

export function statusStyle(state: string, kind = "booking", overdue = false): { icon: LucideIcon; className: string } {
  if (state !== "held" && kind !== "booking") return { icon: kind === "maintenance" ? Wrench : kind === "open_play" ? Users : Lock, className: "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100" };
  return bookingStatusStyle(state);
}

export function StatusBadge({ state, kind, overdue }: { state: string; kind?: string; overdue?: boolean }) {
  const { icon: Icon, className } = statusStyle(state, kind, overdue);
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${className}`}><Icon className="size-3.5 shrink-0" aria-hidden="true"/>{overdue ? "Overdue" : state === "held" ? "Unavailable" : kind && kind !== "booking" ? kind.replaceAll("_", " ") : state}</span>;
}
