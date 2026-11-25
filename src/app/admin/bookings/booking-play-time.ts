import { manilaDateStr } from "@/lib/booking/slots";

const clock = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true });

export function formatPlayTime(startsAt: string, endsAt: string, operatingDate: string): string {
  const start = new Date(startsAt), end = new Date(endsAt);
  const startDay = manilaDateStr(start), endDay = manilaDateStr(end);
  const startLabel = clock.format(start), endLabel = clock.format(end);
  if (startDay === endDay && startDay !== operatingDate) return `${startLabel}–${endLabel} (+1 day)`;
  return `${startLabel}–${endLabel}${startDay !== endDay ? " (+1 day)" : ""}`;
}
