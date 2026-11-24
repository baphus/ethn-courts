const ttl = 30_000;
const maxEntries = 64;

export function createDashboardCache() {
  const entries = new Map<string, { data: unknown; expires: number }>();
  let denial = 0;
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    denial: () => denial,
    revision: () => revision,
    invalidate() {
      entries.clear();
      revision++;
      listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    deny(status: number) {
      if (denial || (status !== 401 && status !== 403)) return;
      denial = status;
      entries.clear();
      listeners.forEach(listener => listener());
    },
    read<T>(url: string, now = Date.now()): T | undefined {
      const entry = entries.get(url);
      if (entry && entry.expires > now) return entry.data as T;
    },
    write<T>(url: string, data: T, now = Date.now()) {
      if (denial) return;
      entries.delete(url);
      entries.set(url, { data, expires: now + ttl });
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    },
    delete(url: string) {
      entries.delete(url);
    },
  };
}
