type Item = { courtName: string; startsAt: string; endsAt: string; durationMinutes: number; intervalMinutes: number };

export function summarizeBookingSchedule(items: Item[]) {
  const byCourt = new Map<string, { startsAt: string; endsAt: string }[]>();
  let slotCount = 0;
  for (const item of items) {
    slotCount += item.durationMinutes / item.intervalMinutes;
    const ranges = byCourt.get(item.courtName) ?? [];
    ranges.push({ startsAt: item.startsAt, endsAt: item.endsAt });
    byCourt.set(item.courtName, ranges);
  }

  const grouped = new Map<string, { startsAt: string; endsAt: string; courts: string[] }>();
  for (const court of [...byCourt.keys()].sort()) {
    const merged: { startsAt: string; endsAt: string }[] = [];
    for (const range of byCourt.get(court)!.sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const last = merged.at(-1);
      if (!last || range.startsAt > last.endsAt) merged.push(range);
      else if (range.endsAt > last.endsAt) last.endsAt = range.endsAt;
    }
    for (const range of merged) {
      const key = `${range.startsAt}/${range.endsAt}`;
      const group = grouped.get(key) ?? { ...range, courts: [] };
      group.courts.push(court);
      grouped.set(key, group);
    }
  }
  return {
    slotCount,
    courtNames: [...byCourt.keys()].sort(),
    playTimes: [...grouped.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt)),
  };
}
