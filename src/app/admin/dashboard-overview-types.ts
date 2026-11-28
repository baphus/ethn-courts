import type { BookingSummary } from "./bookings/booking-list";

export type DashboardOverview = {
  operatingDate: string;
  calendarDate: string;
  counts: { confirmed: number; completed: number };
  recentBookings: (BookingSummary & { slotCount: number; approvedAt: string })[];
};

export function cents(amount: string): bigint {
  const negative = amount.startsWith("-");
  const [whole, fraction = ""] = (negative ? amount.slice(1) : amount).split(".");
  const value = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return negative ? -value : value;
}
export function pesos(amount: string): string {
  const value = cents(amount), abs = value < BigInt(0) ? -value : value;
  return `${value < BigInt(0) ? "−" : ""}₱${(abs / BigInt(100)).toLocaleString("en-PH")}.${String(abs % BigInt(100)).padStart(2, "0")}`;
}
export function comparison(current: bigint, prior: bigint): string {
  if (prior <= BigInt(0)) return "No comparable baseline";
  const difference = current - prior;
  const tenths = (difference < BigInt(0) ? -difference : difference) * BigInt(1000) / prior;
  return `${difference > BigInt(0) ? "+" : difference < BigInt(0) ? "−" : ""}${tenths / BigInt(10)}.${tenths % BigInt(10)}% vs prior 15 days`;
}
