import { manilaDateStr } from "@/lib/booking/slots";
import { openingOptions } from "../courts/hour-options";

const manilaClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fullTime = (time: string) => time.length === 5 ? `${time}:00.000` : time;

export function savedManilaTime(value: string) {
  const instant = new Date(value);
  const clock = manilaClock.format(instant);
  const seconds = instant.toISOString().slice(17, 23);
  return [manilaDateStr(instant), seconds === "00.000" ? clock : `${clock}:${seconds}`] as const;
}

export function timeOptions(saved: string, start = "") {
  const options = openingOptions(saved.slice(0, 5));
  if (saved.length > 5) options.push({ value: saved, label: `${saved} (saved)` });
  return options.sort((a, b) => fullTime(a.value).localeCompare(fullTime(b.value)))
    .filter(option => !start || fullTime(option.value) !== fullTime(start))
    .map(option => start && fullTime(option.value) < fullTime(start) ? { ...option, label: `${option.label} (next day)` } : option);
}

export function openPlayTimes(date: string, start: string, end: string) {
  if (!date || !start || !end || fullTime(end) === fullTime(start)) return null;
  const startsAt = new Date(`${date}T${fullTime(start)}+08:00`);
  const endsAt = new Date(`${date}T${fullTime(end)}+08:00`);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  if (endsAt < startsAt) endsAt.setTime(endsAt.getTime() + 86_400_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}
