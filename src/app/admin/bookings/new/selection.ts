import { priceItems, validateRanges } from "@/lib/booking/core";
import { manilaDateStr } from "@/lib/booking/slots";

export type Availability = { date: string; operatingDate: string; settings: { version: string; intervalMinutes: number; minimumMinutes: number; anchorMinutes: number; horizonDays: number }; serverNow: string; courts: Court[] };
export type Court = { id: string; name: string; windows: { opensAt: string; closesAt: string; hourlyRate: string | null }[]; occupied: { startsAt: string; endsAt: string; state: string }[] };
export type Selection = Record<string, number[]>;
const HOUR = 3_600_000;

export function rows(data: Availability, selection: Selection = {}): number[] {
  const times = new Set(Object.values(selection).flat());
  for (const court of data.courts) for (const window of court.windows) {
    for (let t = Math.ceil(Date.parse(window.opensAt) / HOUR) * HOUR; t + HOUR <= Date.parse(window.closesAt); t += HOUR) times.add(t);
  }
  return [...times].sort((a, b) => a - b);
}
export function cellWindow(court: Court, start: number, now: number, interval: number) {
  return court.windows.find(w => w.hourlyRate !== null && start >= Date.parse(w.opensAt) && start + HOUR <= Date.parse(w.closesAt) && (start - Date.parse(w.opensAt)) % (interval * 60_000) === 0 && (start + HOUR - Date.parse(w.opensAt)) % (interval * 60_000) === 0 && start >= now && !court.occupied.some(o => start < Date.parse(o.endsAt) && start + HOUR > Date.parse(o.startsAt)));
}
export function toggleHour(selection: Selection, courtId: string, hour: number): { selection: Selection; error: string } {
  const selected = selection[courtId] || [];
  const index = selected.indexOf(hour);
  if (index >= 0 && index !== 0 && index !== selected.length - 1) return { selection, error: "Remove an end hour first; a court cannot have a gap." };
  if (index < 0 && selected.length && hour !== selected[0] - HOUR && hour !== selected[selected.length - 1] + HOUR) return { selection, error: "Select an adjacent hour; a court cannot have a gap." };
  const next = index >= 0 ? selected.filter(t => t !== hour) : [...selected, hour].sort((a, b) => a - b);
  const result = { ...selection }; if (next.length) result[courtId] = next; else delete result[courtId];
  return { selection: result, error: "" };
}
export function summarize(data: Availability, date: string, selection: Selection, now: number) {
  return Object.entries(selection).map(([courtId, hours]) => {
    const court = data.courts.find(c => c.id === courtId);
    const start = hours[0], end = hours[hours.length - 1] + HOUR;
    const window = court?.windows.find(w => w.hourlyRate !== null && start >= Date.parse(w.opensAt) && end <= Date.parse(w.closesAt));
    const available = !!court && hours.every(h => !!cellWindow(court, h, now, data.settings.intervalMinutes));
    const eligible = !!window && validateRanges(date, new Date(now), data.settings.anchorMinutes, data.settings.intervalMinutes, data.settings.minimumMinutes, data.settings.horizonDays, [{ courtId, start: new Date(start), end: new Date(end), opens: new Date(window.opensAt), closes: new Date(window.closesAt) }]);
    let cents: bigint | null = null; try { if (window?.hourlyRate) cents = priceItems([{ rate: window.hourlyRate, minutes: hours.length * 60 }]); } catch { /* invalid rate */ }
    return { courtId, name: court?.name || courtId, start, end, hours, available, eligible, cents, hourlyRate: window?.hourlyRate ?? undefined };
  }).sort((a, b) => a.courtId.localeCompare(b.courtId));
}
export function money(cents: bigint) { return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`; }
export function hourLabel(time: number, date: string) {
  const d = new Date(time); const day = manilaDateStr(d);
  const label = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(d);
  return day === date ? label : `${label} (${day})`;
}
