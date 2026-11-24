import { manilaDateStr } from "@/lib/booking/slots";
import { shiftDate } from "./date-utils";

export type View = "monthly" | "weekly" | "daily" | "schedule";
export type Interval = { id: string; startsAt: string; endsAt: string; state: string; kind: "booking" | "maintenance" | "private" | "open_play"; bookingId: string | null; guestName: string | null; blockId: string | null; reason: string | null };
export type Calendar = { date: string; serverNow: string; window: { startsAt: string; endsAt: string }; courts: { id: string; name: string; active: boolean; intervals: Interval[] }[] };

export function rangeDates(date: string, view: View): string[] {
  if (view === "daily") return [date];
  const first = view === "monthly" ? `${date.slice(0, 7)}-01` : date;
  const firstDate = new Date(`${first}T12:00:00Z`);
  if (view === "monthly") {
    const lastDate = new Date(firstDate);
    lastDate.setUTCMonth(lastDate.getUTCMonth() + 1, 0);
    return Array.from({ length: lastDate.getUTCDate() }, (_, index) => shiftDate(first, index));
  }
  const start = shiftDate(first, -((firstDate.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
}

export function stepPeriod(date: string, view: View, direction: number): string {
  if (view !== "monthly") return shiftDate(date, direction * (view === "daily" ? 1 : 7));
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + direction);
  return manilaDateStr(d);
}

export function uniqueScheduleDays(dates: string[], days: Record<string, Calendar | null>): Record<string, Calendar | null> {
  const seen = new Set<string>();
  return Object.fromEntries(dates.map(date => {
    const day = days[date];
    if (!day) return [date, null];
    return [date, { ...day, courts: day.courts.map(court => ({ ...court, intervals: court.intervals.filter(item => {
      const key = `${court.id}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }) })) }];
  }));
}

export async function loadDates(dates: string[], signal: AbortSignal, load: (date: string, signal: AbortSignal) => Promise<Calendar>): Promise<Record<string, Calendar | null>> {
  const result: Record<string, Calendar | null> = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, dates.length) }, async () => {
    while (!signal.aborted && next < dates.length) {
      const date = dates[next++];
      try { result[date] = await load(date, signal); } catch { if (!signal.aborted) result[date] = null; }
    }
  }));
  return result;
}
