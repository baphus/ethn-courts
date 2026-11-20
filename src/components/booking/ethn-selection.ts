export type Window = { opensAt: string; closesAt: string; hourlyRate: string | null };
export type Occupied = { startsAt: string; endsAt: string; state: string };
export type Range = { courtId: string; start: string; end: string; rate: string; window: number };

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function slots(window: Window, occupied: Occupied[], intervalMinutes: number, now: number) {
  const step = intervalMinutes * 60_000, end = Date.parse(window.closesAt);
  const result: { start: number; end: number; available: boolean }[] = [];
  if (step <= 0 || !Number.isFinite(step)) return result;
  for (let start = Date.parse(window.opensAt); start + step <= end; start += step) {
    const finish = start + step;
    result.push({ start, end: finish, available: start >= now && !occupied.some(o => start < Date.parse(o.endsAt) && finish > Date.parse(o.startsAt)) });
  }
  return result;
}

export function selectRange(courtId: string, windowIndex: number, window: Window, grid: ReturnType<typeof slots>, index: number, current?: Range): Range | undefined {
  const clicked = grid[index];
  if (!clicked?.available || window.hourlyRate === null) return current;
  let start = clicked.start, end = clicked.end;
  if (current && current.window === windowIndex) {
    start = Math.min(Date.parse(current.start), clicked.start);
    end = Math.max(Date.parse(current.start) + (clicked.end - clicked.start), clicked.end);
    if (grid.some(s => s.start >= start && s.end <= end && !s.available)) { start = clicked.start; end = clicked.end; }
  }
  return { courtId, start: new Date(start).toISOString(), end: new Date(end).toISOString(), rate: window.hourlyRate, window: windowIndex };
}
