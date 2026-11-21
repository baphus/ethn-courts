import { parsePesos } from '../booking/core';
import { scheduleWindows } from '../booking/schedule';

type Hours = { weekday: number; opens: string; closes: string; hourly_rate: string | null; court_id?: string };
type Court = { id: string; active: boolean; hours: readonly Hours[] };
type Allocation = { courtId: string; operatingDate: string; start: Date; end: Date; state: string; expiresAt: Date | null };

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
    for (const row of court.hours) {
      try { if (row.hourly_rate !== null) parsePesos(row.hourly_rate); } catch { return invalid; }
    }
    const hours = court.hours.map(row => ({ ...row, court_id: court.id }));
    for (let day = 1; day <= 7; day++) {
      if ('error' in scheduleWindows(`2026-11-0${day}`, anchorMinutes, court.id, hours)) return invalid;
    }
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
    const result = scheduleWindows(allocation.operatingDate, anchorMinutes, court.id, court.hours.map(row => ({ ...row, court_id: court.id })));
    if ('error' in result) return conflict;
    const start = allocation.start.getTime();
    const window = result.windows.find(w => start >= w.opens && end <= w.closes);
    if (!Number.isFinite(start) || !window || end <= start || (start - window.opens) % (interval * 60_000) || (end - window.opens) % (interval * 60_000) || end - start < minimum * 60_000) return conflict;
  }
  return { ok: true };
}
