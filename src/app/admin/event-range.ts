import { shiftDate, toIso } from "./calendar/date-utils";

type EventTiming = {
  eventType: "closure" | "open_play";
  timing: "hours" | "days";
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

export function eventRange(draft: EventTiming) {
  const { startDate, endDate, startTime, endTime } = draft;
  const wholeDays = draft.eventType === "closure" && draft.timing === "days";
  if (!startDate || !endDate || (wholeDays && endDate < startDate)) return null;
  const start = toIso(startDate, wholeDays ? "00:00" : startTime);
  const end = toIso(endDate, wholeDays ? "00:00" : endTime);
  if (!start || !end) return null;
  const endsAt = wholeDays ? toIso(shiftDate(endDate, 1), "00:00") : end;
  return endsAt && endsAt > start ? { startsAt: start, endsAt } : null;
}
