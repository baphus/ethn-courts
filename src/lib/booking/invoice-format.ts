import { formatScheduleRange } from "./schedule-label";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function invoiceMoney(value: string) {
  return money.format(Number(value));
}

export function invoiceTimeRange(bookingDate: string, startsAt: string | Date, endsAt: string | Date) {
  return formatScheduleRange(startsAt, endsAt, bookingDate);
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
