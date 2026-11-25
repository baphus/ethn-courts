import type { Calendar, Interval } from "@/app/admin/calendar/calendar-range";

type Court = Calendar["courts"][number];

export const HOUR_PX = 64;
const HOUR_MS = 3_600_000;


export const timelineTime = (value: string | number) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export function durationLabel(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`;
}

export function position(window: Calendar["window"], startsAt: string, endsAt: string) {
  const start = Date.parse(window.startsAt), end = Date.parse(window.endsAt);
  const from = Math.max(start, Date.parse(startsAt)), to = Math.min(end, Date.parse(endsAt));
  return end > start && to > from ? { top: (from - start) / HOUR_MS * HOUR_PX, height: (to - from) / HOUR_MS * HOUR_PX } : null;
}
export function currentPosition(window: Calendar["window"], now: number) {
  const start = Date.parse(window.startsAt), end = Date.parse(window.endsAt);
  return now >= start && now < end ? (now - start) / HOUR_MS * HOUR_PX : null;
}
export function bookingTarget(item: Interval) {
  return item.state !== "held" && item.kind === "booking" ? item.bookingId : null;
}
export function intervalLabel(item: Interval) {
  return item.state === "held" ? "Unavailable" : item.kind === "booking" ? `${item.guestName || "Guest"} · ${item.state}` : `${item.kind.replaceAll("_", " ")}${item.reason ? ` · ${item.reason}` : ""}`;
}
export function attention(day: Calendar, now: number) {
  const seen = new Set<string>();
  return day.courts.flatMap(court => court.intervals.flatMap(item => {
    if (item.kind !== "booking" || item.state !== "pending" || !item.bookingId || Date.parse(item.startsAt) >= now || seen.has(item.bookingId)) return [];
    seen.add(item.bookingId); return [{ item, court }];
  }));
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const out: Interval[] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    const sameId = item.kind === "booking" ? !!item.bookingId && item.bookingId === last?.bookingId : !!item.blockId && item.blockId === last?.blockId;
    if (last && sameId && last.kind === item.kind && last.state === item.state && Date.parse(item.startsAt) <= Date.parse(last.endsAt)) {
      if (Date.parse(item.endsAt) > Date.parse(last.endsAt)) out[out.length - 1] = { ...last, endsAt: item.endsAt };
    } else out.push({ ...item });
  }
  return out;
}
export const mergeDay = (day: Calendar): Calendar => ({ ...day, courts: day.courts.map(c => ({ ...c, intervals: mergeIntervals(c.intervals) })) });
export function dashboardCourtSchedule(day: Calendar, now: number): Calendar {
  return { ...day, courts: day.courts.map(court => ({ ...court, intervals: court.intervals.filter(item =>
    Date.parse(item.endsAt) > now && (item.kind !== "booking" || item.state === "confirmed"),
  ) })) };
}
export function bookingCount(court: Court) {
  return new Set(court.intervals.filter(i => i.kind === "booking" && i.state !== "held" && i.bookingId).map(i => i.bookingId)).size;
}

export type CourtTone = "live" | "pending" | "held" | "block" | "free" | "closed";
export type CourtStatus = { tone: CourtTone; title: string; current: Interval | null; next: Interval | null; freeAt: number | null; progress: number };

export function courtStatus(court: Court, live: boolean, now: number): CourtStatus {
  const sorted = [...court.intervals].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  if (!court.active) return { tone: "closed", title: "Inactive", current: null, next: null, freeAt: null, progress: 0 };
  if (!live) return { tone: "closed", title: "Not live", current: null, next: sorted[0] ?? null, freeAt: null, progress: 0 };
  const current = sorted.find(i => Date.parse(i.startsAt) <= now && Date.parse(i.endsAt) > now) ?? null;
  const next = sorted.find(i => Date.parse(i.startsAt) > now) ?? null;
  if (!current) return { tone: "free", title: "No scheduled allocation", current, next, freeAt: null, progress: 0 };
  let freeAt = Date.parse(current.endsAt);
  for (const i of sorted) if (Date.parse(i.startsAt) <= freeAt && Date.parse(i.endsAt) > freeAt) freeAt = Date.parse(i.endsAt);
  const span = Date.parse(current.endsAt) - Date.parse(current.startsAt);
  const progress = span > 0 ? Math.min(1, Math.max(0, (now - Date.parse(current.startsAt)) / span)) : 0;
  if (current.state === "held") return { tone: "held", title: "Unavailable", current, next, freeAt, progress };
  if (current.kind !== "booking") return { tone: "block", title: current.kind.replaceAll("_", " ").replace(/^./, c => c.toUpperCase()), current, next, freeAt, progress };
  return { tone: current.state === "pending" ? "pending" : "live", title: "Reserved now", current, next, freeAt, progress };
}
