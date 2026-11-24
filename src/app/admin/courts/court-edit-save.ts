import type { Snapshot } from "../settings/pricing-payload";

export function withCourtSchedule(data: Snapshot, id: string, patch: Partial<Pick<Snapshot["courts"][number], "hours" | "active">>): Snapshot {
  return { ...data, courts: data.courts.map(court => court.id === id ? { ...court, ...patch } : court) };
}

export function courtDetailsVersion(data: Snapshot, updated: { previousSettingsVersion?: string; settingsVersion?: string }) {
  return updated.previousSettingsVersion === data.version ? updated.settingsVersion ?? data.version : null;
}
