type Month<T, Shared> = Shared & { days: T[] };

export function availabilityCache<T extends { date: string }, Shared extends { serverNow: string }>(now = () => performance.now()) {
  const months = new Map<string, { data: Month<T, Shared>; monotonic: number }>();
  const cache = {
    clear: () => months.clear(),
    put(month: string, data: Month<T, Shared>) {
      months.set(month, { data, monotonic: now() });
      for (const [key, entry] of months) {
        if (now() - entry.monotonic >= 30_000) months.delete(key);
      }
    },
    get(date: string) {
      const month = date.slice(0, 7);
      const entry = months.get(month);
      // shortcut: browsing snapshots can lag by 30 seconds; checkout always rechecks.
      if (!entry || now() - entry.monotonic >= 30_000) {
        months.delete(month);
        return;
      }
      const day = entry.data.days.find(day => day.date === date);
      if (!day) return;
      const { days: _days, ...shared } = entry.data;
      return { data: { ...shared, ...day }, monotonic: entry.monotonic };
    },
  };

  return {
    ...cache,
    async load(date: string, signal?: AbortSignal, request = fetch) {
      const cached = cache.get(date);
      if (cached) return cached;
      const month = date.slice(0, 7);
      const response = await request(`/api/ethn/availability?month=${month}`, { cache: "no-store", signal }).catch(() => null);
      if (!response?.ok) return;
      const snapshot: Month<T, Shared> = await response.json();
      if (signal?.aborted) return;
      cache.put(month, snapshot);
      return cache.get(date);
    },
  };
}
