import type { WindowData } from "@/app/admin/dashboard-analytics-types";

export const HOUR = 3_600_000;
const minutes = (ms: number) => Math.round(ms / 60_000);

export function bookingWindowCell(court: WindowData["courts"][number], start: number) {
  let open = 0;
  let occupied = 0;
  for (const window of court.windows) {
    const from = Math.max(start, Date.parse(window.opensAt));
    const to = Math.min(start + HOUR, Date.parse(window.closesAt));
    if (to <= from) continue;
    open += to - from;
    for (const allocation of court.occupied) {
      occupied += Math.max(0, Math.min(to, Date.parse(allocation.endsAt)) - Math.max(from, Date.parse(allocation.startsAt)));
    }
  }
  if (open === 0) return { status: "Closed", detail: "Outside opening hours" } as const;
  if (open === HOUR && occupied === 0) return { status: "Open", detail: "Full hour clear" } as const;
  const reasons = [];
  if (open < HOUR) reasons.push(`${minutes(HOUR - open)} min outside opening hours`);
  if (occupied > 0) reasons.push(`${minutes(occupied)} min booked, held, or blocked`);
  return { status: "Unavailable", detail: reasons.join("; ") } as const;
}
