export type Window = { opensAt: string; closesAt: string; hourlyRate: string | null };
export type Occupied = { startsAt: string; endsAt: string; state: string };
export type Range = { courtId: string; start: string; end: string; rate: string; window: number };

export function validDate(date: string | null): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

export function acceptedDate(requested: string | undefined, returned: string, fellBack: boolean) {
  return requested && validDate(requested) && !fellBack && requested === returned ? requested : "";
}

export function bookingDate(date: string, full = true) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", ...(full ? { year: "numeric" } : {}) }).format(new Date(`${date}T00:00:00Z`));
}

export function slotDate(time: number) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" }).format(new Date(time));
}

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

export function gridTimes(windows: Window[], intervalMinutes: number, now: number): number[] {
  const step = intervalMinutes * 60_000;
  if (!windows.length || !Number.isFinite(step) || step <= 0) return [];
  const starts = windows.map(w => Date.parse(w.opensAt));
  const ends = windows.map(w => Date.parse(w.closesAt));
  if (![...starts, ...ends].every(Number.isFinite)) return [];
  const times = new Set(windows.flatMap(w => slots(w, [], intervalMinutes, 0).map(s => s.start)));
  for (let time = Math.min(...starts); time + step <= Math.max(...ends); time += step) times.add(time);
  return [...times].filter(time => time >= now).sort((a, b) => a - b);
}

export function handoffRanges(raw: string, date: string | null, availability: { date: string; settings: { intervalMinutes: number; minimumMinutes: number }; courts: { id: string; windows: Window[]; occupied: Occupied[] }[] }, now: number): Range[] | null {
  if (raw.length > 1000 || !validDate(date) || date !== availability.date || !Number.isFinite(now)) return null;
  try {
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items) || items.length < 1 || items.length > 2) return null;
    const result: Range[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "courtId,end,start" || typeof item.courtId !== "string" || typeof item.start !== "string" || typeof item.end !== "string" || result.some(r => r.courtId === item.courtId)) return null;
      const court = availability.courts.find(c => c.id === item.courtId);
      const start = Date.parse(item.start), end = Date.parse(item.end);
      if (!court || !Number.isFinite(start) || !Number.isFinite(end) || end - start < availability.settings.minimumMinutes * 60000 || start < now) return null;
      const wi = court.windows.findIndex(w => {
        const grid = slots(w, court.occupied, availability.settings.intervalMinutes, now);
        const selected = grid.filter(s => s.start >= start && s.end <= end);
        return w.hourlyRate !== null && selected.length > 0 && selected[0].start === start && selected[selected.length - 1].end === end && selected.every(s => s.available);
      });
      if (wi < 0) return null;
      result.push({ courtId: court.id, start: new Date(start).toISOString(), end: new Date(end).toISOString(), rate: court.windows[wi].hourlyRate!, window: wi });
    }
    return result;
  } catch { return null; }
}

export function selectRange(courtId: string, windowIndex: number, window: Window, grid: ReturnType<typeof slots>, index: number, current?: Range): Range | undefined {
  const clicked = grid[index];
  if (!clicked?.available || window.hourlyRate === null) return current;
  let start = clicked.start, end = clicked.end;
  if (current && current.window === windowIndex) {
    if (clicked.start >= Date.parse(current.start) && clicked.end <= Date.parse(current.end)) {
      return clicked.start === Date.parse(current.start) ? undefined : { ...current, end: new Date(clicked.start).toISOString() };
    }
    start = Math.min(Date.parse(current.start), clicked.start);
    end = Math.max(Date.parse(current.start) + (clicked.end - clicked.start), clicked.end);
    if (grid.some(s => s.start >= start && s.end <= end && !s.available)) { start = clicked.start; end = clicked.end; }
  }
  return { courtId, start: new Date(start).toISOString(), end: new Date(end).toISOString(), rate: window.hourlyRate, window: windowIndex };
}
