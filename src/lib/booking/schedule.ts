import { parsePesos, validateRanges, type CoreRange } from "./core";
import { manilaDateStr, manilaWallClock } from "./slots";

const DAY = 86_400_000;
const MINUTE = 60_000;

type Court = { id: string; active: boolean };
type Hours = { court_id: string; weekday: number; opens: string; closes: string; hourly_rate: string | null };
type Request = { courtId: string; start: Date; end: Date };
export type ScheduleResult =
  | { ranges: (CoreRange & { rate: string; minutes: number })[] }
  | { error: "INVALID_INPUT" | "COURT_UNAVAILABLE" | "INVALID_SCHEDULE" | "CLOSED" | "INVALID_RATE" };

function timeMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::00)?$/.exec(value);
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
}

export function scheduleWindows(date: string, anchorMinutes: number, courtId: string, hours: readonly Hours[]): { error: "INVALID_INPUT" | "INVALID_SCHEDULE" } | { windows: { opens: number; closes: number; rate: string | null }[] } {
  const day = manilaWallClock(date).getTime();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day) || manilaDateStr(new Date(day)) !== date || !Number.isFinite(new Date(day + 2 * DAY).getTime()) || !Number.isInteger(anchorMinutes) || anchorMinutes < 0 || anchorMinutes >= 1440) return { error: "INVALID_INPUT" as const };
  const anchor = day + anchorMinutes * MINUTE, boundary = anchor + DAY;
  const windows: { opens: number; closes: number; rate: string | null }[] = [];
  for (const row of hours.filter(h => h.court_id === courtId)) {
    const open = timeMinutes(row.opens), close = timeMinutes(row.closes);
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6 || open === null || close === null) return { error: "INVALID_SCHEDULE" as const };
    for (const offset of [-1, 0, 1]) {
      const openingDay = day + offset * DAY;
      if (new Date(openingDay + 8 * 60 * MINUTE).getUTCDay() !== row.weekday) continue;
      const opens = openingDay + open * MINUTE;
      const closes = openingDay + close * MINUTE + (close <= open ? DAY : 0);
      if (opens >= boundary || closes <= anchor) continue;
      if (opens < anchor || closes > boundary) return { error: "INVALID_SCHEDULE" as const };
      windows.push({ opens, closes, rate: row.hourly_rate });
    }
  }
  windows.sort((a, b) => a.opens - b.opens);
  if (windows.some((w, i) => i > 0 && w.opens < windows[i - 1].closes)) return { error: "INVALID_SCHEDULE" as const };
  return { windows };
}

export function resolveSchedule(input: {
  date: string; now: Date; anchorMinutes: number; interval: number; minimum: number; horizonDays: number;
  courts: readonly Court[]; hours: readonly Hours[]; requests: readonly Request[];
}): ScheduleResult {
  const { date, now, anchorMinutes, interval, minimum, horizonDays, courts, hours, requests } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(anchorMinutes) || anchorMinutes < 0 || anchorMinutes >= 1440 || !Number.isFinite(now.getTime()) || ![30, 60].includes(interval) || !Number.isInteger(minimum) || minimum < interval || minimum % interval || !Number.isSafeInteger(horizonDays) || horizonDays <= 0 || !requests.length || requests.length > 100 || new Set(requests.map(r => r.courtId)).size !== requests.length || requests.some(r => !r.courtId)) return { error: "INVALID_INPUT" };
  const day = manilaWallClock(date).getTime();
  if (!Number.isFinite(day) || manilaDateStr(new Date(day)) !== date || !Number.isFinite(new Date(day + 2 * DAY).getTime())) return { error: "INVALID_INPUT" };
  const ranges: (CoreRange & { rate: string; minutes: number })[] = [];
  for (const request of requests) {
    if (!courts.some(c => c.id === request.courtId && c.active)) return { error: "COURT_UNAVAILABLE" };
    const resolved = scheduleWindows(date, anchorMinutes, request.courtId, hours);
    if ("error" in resolved) return { error: resolved.error };
    const { windows } = resolved;
    const window = windows.find(w => request.start.getTime() >= w.opens && request.end.getTime() <= w.closes);
    if (!window) return { error: "CLOSED" };
    if (window.rate === null) return { error: "INVALID_RATE" };
    try { parsePesos(window.rate); } catch { return { error: "INVALID_RATE" }; }
    ranges.push({ ...request, opens: new Date(window.opens), closes: new Date(window.closes), rate: window.rate, minutes: (request.end.getTime() - request.start.getTime()) / MINUTE });
  }
  if (!validateRanges(date, now, anchorMinutes, interval, minimum, horizonDays, ranges)) return { error: "INVALID_INPUT" };
  return { ranges };
}
