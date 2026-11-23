import type { Interval } from "@/app/admin/calendar/calendar-range";
import { statusStyle } from "./dashboard-status";

const palette = [
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
];
const sizes = { sm: "size-5 text-[9px]", md: "size-9 text-xs" };
type Size = keyof typeof sizes;

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = "md" }: { name: string; size?: Size }) {
  const tone = palette[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % palette.length];
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-semibold ${sizes[size]} ${tone}`}>{initials(name)}</span>;
}

/** Avatar for bookings, status icon bubble for holds and blocks. */
export function IntervalLead({ item, size = "md" }: { item: Interval; size?: Size }) {
  if (item.kind === "booking" && item.state !== "held") return <Avatar name={item.guestName || "Guest"} size={size} />;
  const { icon: Icon, className } = statusStyle(item.state, item.kind);
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full border ${sizes[size]} ${className}`}><Icon className="size-1/2" /></span>;
}
