import { formatClockMinutes } from "@/lib/booking/schedule-label";
import { timeMinutes } from "@/lib/booking/schedule";

const DAY = 1440;
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const hours = Array.from({ length: 24 }, (_, hour) => hour * 60);

export function openingOptions(saved = "") {
  const minute = timeMinutes(saved);
  const choices = minute === null || hours.includes(minute) ? hours : [...hours, minute].sort((a, b) => a - b);
  return choices.map(value => ({ value: clock(value), label: formatClockMinutes(value) }));
}

export function keepClosingTime(opens: string, closes: string, anchor: number, saved = "") {
  return opens !== closes && closingOptions(opens, anchor, saved).some(option => option.value === closes) ? closes : "";
}

export function closingOptions(opens: string, anchor: number, saved = "") {
  const start = timeMinutes(opens);
  if (start === null) return [];
  const savedMinute = timeMinutes(saved);
  const choices = savedMinute === null || hours.includes(savedMinute) ? hours : [...hours, savedMinute];
  const limit = anchor + (start >= anchor ? DAY : 0);
  return choices.map(value => ({ value, end: value + (value <= start ? DAY : 0) }))
    .filter(({ end }) => end <= limit)
    .sort((a, b) => a.end - b.end)
    .map(({ value, end }) => ({ value: clock(value), label: value === start ? "Open 24 hours" : `${formatClockMinutes(value)}${end >= DAY ? " (+1 day)" : ""}` }));
}
