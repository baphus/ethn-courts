type Hours = { id: string; weekday: number; opens: string; closes: string; hourlyRate: string | null };
export type Snapshot = { version: string; merchant: string | null; intervalMinutes: number; minimumMinutes: number; anchorMinutes: number; horizonDays: number; holdMinutes: number; courts: { id: string; name: string; active: boolean; hours: Hours[] }[] };

export const updateMerchant = (value: string) => (data: Snapshot | null): Snapshot | null => data && { ...data, merchant: value };

export function settingsPayload(data: { version: string; merchant: string | null; courts: { id: string; name: string; hours: { id: string; hourlyRate: string | null }[] }[] }) {
  return { version: data.version, merchant: data.merchant?.trim() || null, courts: data.courts.map(c => ({ id: c.id, name: c.name.trim(), rates: c.hours.map(h => ({ hoursId: h.id, hourlyRate: h.hourlyRate?.trim() || null })) })) };
}
