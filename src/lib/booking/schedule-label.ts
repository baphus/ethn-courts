import { manilaDateStr } from "./slots";
import { timeMinutes } from "./schedule";

type Instant = string | number | Date;
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" });

function clockParts(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return { time: `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}`, period: hour < 12 ? "AM" : "PM" };
}

function clockRange(from: number, to: number) {
  const start = clockParts(from), end = clockParts(to);
  return `${start.time}${start.period === end.period ? "" : start.period}–${end.time}${end.period}`;
}

export function formatClockMinutes(minutes: number) {
  const { time, period } = clockParts(minutes);
  return `${time}${period}`;
}

export function formatScheduleTime(value: Instant) {
  return formatClockMinutes(timeMinutes(clock.format(new Date(value)))!);
}

export function formatScheduleRange(from: Instant, to: Instant, contextDate?: string) {
  const start = new Date(from), end = new Date(to);
  const startDay = manilaDateStr(start), endDay = manilaDateStr(end);
  const base = contextDate ?? startDay;
  const day = (value: string) => new Date(`${value}T00:00:00Z`);
  const next = (value: string) => day(value).getTime() - day(base).getTime() === 86_400_000;
  const range = clockRange(timeMinutes(clock.format(start))!, timeMinutes(clock.format(end))!);
  if ((startDay === base || next(startDay)) && (endDay === base || next(endDay))) {
    return `${contextDate ? "" : `${dateLabel.format(day(startDay))} · `}${range}${next(endDay) ? " (+1 day)" : ""}`;
  }
  const first = `${contextDate === startDay ? "" : `${dateLabel.format(day(startDay))} · `}${formatScheduleTime(start)}`;
  return startDay === endDay ? `${dateLabel.format(day(startDay))} · ${range}` : `${first}–${dateLabel.format(day(endDay))} · ${formatScheduleTime(end)}`;
}

export function formatWeeklyHours(opens: string, closes: string) {
  const start = timeMinutes(opens), end = timeMinutes(closes);
  if (start === null || end === null) return "—";
  if (start === end) return "All day (24 hours)";
  return `${clockRange(start, end)}${end < start ? " (+1 day)" : ""}`;
}
