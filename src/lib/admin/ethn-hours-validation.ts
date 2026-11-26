import { parsePesos } from '../booking/core';
import { scheduleWindows, timeMinutes } from '../booking/schedule';

type Hours = { weekday: number; opens: string; closes: string; hourly_rate: string | null; court_id?: string };
type Court = { id: string; active: boolean; hours: readonly Hours[] };
type Allocation = { courtId: string; operatingDate: string; start: Date; end: Date; state: string; expiresAt: Date | null };

type HoursIssue = { kind: 'overlap' | 'boundary' | 'invalid_time' | 'invalid_rate'; rows: number[] };
const dayMinutes = 1440;
const weekMinutes = 7 * dayMinutes;

export function findEthnHoursIssues(hours: readonly Hours[], anchorMinutes: number): HoursIssue[] {
  const issues: HoursIssue[] = [];
  const windows: { index: number; start: number; end: number }[] = [];
  for (const [index, row] of hours.entries()) {
    const opens = timeMinutes(row.opens), closes = timeMinutes(row.closes);
    const validTime = Number.isInteger(row.weekday) && row.weekday >= 0 && row.weekday <= 6 && opens !== null && closes !== null;
    if (!validTime) issues.push({ kind: 'invalid_time', rows: [index] });
    try { if (row.hourly_rate !== null) parsePesos(row.hourly_rate); }
    catch { issues.push({ kind: 'invalid_rate', rows: [index] }); }
    if (!validTime) continue;

    const duration = closes - opens + (closes <= opens ? dayMinutes : 0);
    const offset = (opens - anchorMinutes + dayMinutes) % dayMinutes;
    if (offset + duration > dayMinutes) issues.push({ kind: 'boundary', rows: [index] });
    const start = row.weekday * dayMinutes + opens;
    windows.push({ index, start, end: start + duration });
  }
  for (const [i, a] of windows.entries()) {
    for (let j = i + 1; j < windows.length; j++) {
      const b = windows[j];
      // A Saturday overnight window can overlap Sunday on the following week.
      if ([-weekMinutes, 0, weekMinutes].some(shift => a.start < b.end + shift && b.start + shift < a.end)) {
        issues.push({ kind: 'overlap', rows: [a.index, b.index] });
      }
    }
  }
  return issues;
}

export function validateEthnHours(input: {
  settings: { anchorMinutes: number; interval: number; minimum: number };
  courts: readonly Court[];
  allocations: readonly Allocation[];
  oldHours?: readonly (Hours & { court_id: string })[];
  now: Date;
}): { ok: true } | { error: 'INVALID_SCHEDULE' | 'HOURS_CONFLICT' } {
  const { anchorMinutes, interval, minimum } = input.settings;
  const invalid = { error: 'INVALID_SCHEDULE' } as const;
  const conflict = { error: 'HOURS_CONFLICT' } as const;
  if (!Number.isFinite(input.now.getTime()) || !Number.isInteger(anchorMinutes) || anchorMinutes < 0 || anchorMinutes >= 1440 || ![30, 60].includes(interval) || !Number.isInteger(minimum) || minimum < interval || minimum % interval || input.courts.some(c => !c.id) || new Set(input.courts.map(c => c.id)).size !== input.courts.length) return invalid;
  for (const court of input.courts) {
    if (findEthnHoursIssues(court.hours, anchorMinutes).length) return invalid;
  }
  for (const allocation of input.allocations) {
    if (allocation.state === 'block') {
      if (allocation.end <= input.now) continue;
      const court = input.courts.find(c => c.id === allocation.courtId);
      if (!court?.active) return conflict;
      const start = allocation.start.getTime(), end = allocation.end.getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return conflict;
      const old = scheduleWindows(allocation.operatingDate, anchorMinutes, court.id, (input.oldHours ?? []).filter(h => h.court_id === court.id));
      const proposed = scheduleWindows(allocation.operatingDate, anchorMinutes, court.id, court.hours.map(row => ({ ...row, court_id: court.id })));
      if ('error' in old || 'error' in proposed) return conflict;
      for (const w of old.windows) {
        const overlapStart = Math.max(start, w.opens), overlapEnd = Math.min(end, w.closes);
        if (overlapStart < overlapEnd && !proposed.windows.some(n => overlapStart >= n.opens && overlapEnd <= n.closes)) return conflict;
      }
      continue;
    }
    if (!['held', 'pending', 'confirmed'].includes(allocation.state)) continue;
    const end = allocation.end.getTime();
    if (!Number.isFinite(end)) return conflict;
    if (end <= input.now.getTime()) continue;
    if (allocation.state === 'held') {
      const expiry = allocation.expiresAt?.getTime();
      if (expiry === undefined || !Number.isFinite(expiry)) return conflict;
      if (expiry <= input.now.getTime()) continue;
    }
    const court = input.courts.find(c => c.id === allocation.courtId);
    if (!court?.active) return conflict;
    // Bookings and live holds keep their original times and rates; only deactivation is blocked.
  }
  return { ok: true };
}
