import { formatScheduleRange } from "@/lib/booking/schedule-label";

export function formatPlayTime(startsAt: string, endsAt: string, operatingDate: string): string {
  return formatScheduleRange(startsAt, endsAt, operatingDate);
}
