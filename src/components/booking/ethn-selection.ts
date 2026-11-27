export type Window = { opensAt: string; closesAt: string; hourlyRate: string | null };
export type Occupied = { startsAt: string; endsAt: string; state: string };
export type Range = { courtId: string; start: string; end: string; rate: string; window: number };

export { gridSlotCount } from "@/lib/booking/invoice-format";

export function validDate(date: string | null): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === `${date}T00:00:00.000Z`;
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
  if (raw.length > 11000 || !validDate(date) || date !== availability.date || !Number.isFinite(now)) return null;
  try {
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items) || items.length < 1 || items.length > 100) return null;
    const result: Range[] = [];
    for (const item of items) {
      if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "courtId,end,start" || typeof item.courtId !== "string" || typeof item.start !== "string" || typeof item.end !== "string") return null;
      const court = availability.courts.find(c => c.id === item.courtId);
      const start = Date.parse(item.start), end = Date.parse(item.end);
      if (!court || !Number.isFinite(start) || !Number.isFinite(end) || end - start < availability.settings.minimumMinutes * 60000 || start < now || result.some(r => r.courtId === item.courtId && start < Date.parse(r.end) && end > Date.parse(r.start))) return null;
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

export function toggleSlot(ranges: Range[], courtId: string, window: number, rate: string, start: string, end: string): Range[] {
  const selected = ranges.find(r => r.courtId === courtId && r.window === window && r.start <= start && r.end >= end);
  if (selected) return ranges.flatMap(r => r !== selected ? [r] : [
    ...(r.start < start ? [{ ...r, end: start }] : []),
    ...(end < r.end ? [{ ...r, start: end }] : []),
  ]);
  const before = ranges.find(r => r.courtId === courtId && r.window === window && r.end === start);
  const after = ranges.find(r => r.courtId === courtId && r.window === window && r.start === end);
  return [...ranges.filter(r => r !== before && r !== after), { courtId, window, rate, start: before?.start ?? start, end: after?.end ?? end }]
    .sort((a, b) => a.start.localeCompare(b.start) || a.courtId.localeCompare(b.courtId));
}
