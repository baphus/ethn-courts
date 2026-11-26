import type { listPublicOpenPlays } from "@/lib/admin/ethn-open-plays";

export type OpenPlay = Awaited<ReturnType<typeof listPublicOpenPlays>>[number];

export function getSchedule(events: OpenPlay[], now: number) {
  const upcoming: OpenPlay[] = [];
  const live: OpenPlay[] = [];
  const past: OpenPlay[] = [];
  let nextChange = Infinity;
  for (const event of events) {
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    if (end <= now) {
      if (event.fee !== null) past.push(event);
    } else if (start <= now) {
      live.push(event);
      nextChange = Math.min(nextChange, end);
    } else {
      upcoming.push(event);
      nextChange = Math.min(nextChange, start);
    }
  }
  return { upcoming, live, past: past.sort((a, b) => b.endsAt.localeCompare(a.endsAt)).slice(0, 5), nextChange };
}

export function formatCountdown(remaining: number) {
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 1) return "Starts in less than a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const parts = [[days, "day"], [hours, "hour"], [minutes % 60, "minute"]] as const;
  return `Starts in ${parts.filter(([count]) => count).map(([count, unit]) => `${count} ${unit}${count === 1 ? "" : "s"}`).join(" ")}`;
}
