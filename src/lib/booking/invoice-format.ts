import { formatDisplayDate } from "../display-date";
import { manilaDateStr } from "./slots";

const time = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function invoiceMoney(value: string) {
  return money.format(Number(value));
}

export function invoiceTimeRange(bookingDate: string, startsAt: string | Date, endsAt: string | Date) {
  const start = new Date(startsAt), end = new Date(endsAt);
  const startDate = manilaDateStr(start), endDate = manilaDateStr(end);
  return `${startDate !== bookingDate ? `${formatDisplayDate(startDate)} · ` : ""}${time.format(start)} – ${endDate !== startDate ? `${formatDisplayDate(endDate)} · ` : ""}${time.format(end)}`;
}

export function gridSlotCount(minutes: number, intervalMinutes?: number): number | undefined {
  if (!intervalMinutes || minutes < 0) return;
  const count = minutes / intervalMinutes;
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

export function invoiceSlotRate(durationMinutes: number, intervalMinutes?: number, hourlyRate?: string) {
  const slots = gridSlotCount(durationMinutes, intervalMinutes);
  const quantity = slots === undefined ? "Slots unavailable" : `${slots} × ${intervalMinutes}-min ${slots === 1 ? "slot" : "slots"}`;
  return hourlyRate === undefined ? quantity : `${quantity} · ${invoiceMoney(hourlyRate)}/hr`;
}
