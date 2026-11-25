import { manilaDateStr, manilaWallClock } from "./slots";

const DAY = 86_400_000;
const MINUTE = 60_000;
const MAX_CENTAVOS = BigInt(999999999999);

/** Parse numeric(12,2) pesos without floating-point conversion. */
export function parsePesos(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid peso amount");
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (cents > MAX_CENTAVOS) throw new Error("Amount overflow");
  return cents;
}

export function priceItems(items: readonly { rate: string; minutes: number }[]): bigint {
  if (!items.length || items.length > 100) throw new Error("Invalid items");
  let total = BigInt(0);
  for (const item of items) {
    if (!Number.isSafeInteger(item.minutes) || item.minutes <= 0 || item.minutes > 1440) throw new Error("Invalid duration");
    total += (parsePesos(item.rate) * BigInt(item.minutes) + BigInt(30)) / BigInt(60);
    if (total > MAX_CENTAVOS) throw new Error("Amount overflow");
  }
  return total;
}

export function operatingDate(now: Date, anchorMinutes: number): string {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(anchorMinutes) || anchorMinutes < 0 || anchorMinutes >= 1440) throw new Error("Invalid time");
  const date = manilaDateStr(now);
  const anchor = manilaWallClock(date, 0, anchorMinutes).getTime();
  return now.getTime() < anchor ? manilaDateStr(new Date(anchor - DAY)) : date;
}

export type CoreRange = { courtId: string; start: Date; end: Date; opens: Date; closes: Date };

export function validateRanges(date: string, now: Date, anchorMinutes: number, interval: number, minimum: number, horizonDays: number, ranges: readonly CoreRange[]): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(now.getTime()) || ![30, 60].includes(interval) || !Number.isInteger(minimum) || minimum < interval || minimum % interval || !Number.isSafeInteger(horizonDays) || horizonDays <= 0 || !ranges.length || ranges.length > 100) return false;
  const day = manilaWallClock(date).getTime();
  if (!Number.isFinite(day) || manilaDateStr(new Date(day)) !== date) return false;
  let today: number;
  try { today = manilaWallClock(operatingDate(now, anchorMinutes)).getTime(); } catch { return false; }
  if (day < today || (day - today) / DAY >= horizonDays) return false;
  const anchor = manilaWallClock(date, 0, anchorMinutes).getTime();
  const boundary = anchor + DAY;
  if (!Number.isFinite(anchor) || !Number.isFinite(new Date(boundary).getTime())) return false;
  const lastEnd = new Map<string, number>();
  for (const range of [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const { courtId, start, end, opens, closes } = range;
    if (!courtId || start.getTime() < (lastEnd.get(courtId) ?? -Infinity)) return false;
    lastEnd.set(courtId, end.getTime());
    const [s, e, o, c] = [start, end, opens, closes].map(v => v.getTime());
    if (![s, e, o, c].every(Number.isFinite) || o < anchor || o >= boundary || c <= o || c > boundary || s < now.getTime() || s < o || e > c || e <= s || (s - o) % (interval * MINUTE) || (e - o) % (interval * MINUTE) || e - s < minimum * MINUTE) return false;
  }
  return true;
}

export function validateGuest(input: { kind: "online" | "walkin"; name: string; email?: string; phone?: string; notify?: boolean }): boolean {
  const name = input.name.trim();
  const email = input.email?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  return !!name && name.length <= 200 && email.length <= 254 && phone.length <= 50 && (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) && (input.kind !== "online" || !!email && !!phone) && (!input.notify || !!email);
}

export function gcashReference(value: string): string {
  const ref = value.trim();
  if (!ref || ref.length > 200) throw new Error("Invalid GCash reference");
  return ref;
}
