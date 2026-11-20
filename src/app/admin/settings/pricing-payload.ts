export function settingsPayload(data: { version: string; merchant: string | null; courts: { id: string; name: string; hours: { id: string; hourlyRate: string | null }[] }[] }) {
  return { version: data.version, merchant: data.merchant?.trim() || null, courts: data.courts.map(c => ({ id: c.id, name: c.name.trim(), rates: c.hours.map(h => ({ hoursId: h.id, hourlyRate: h.hourlyRate?.trim() || null })) })) };
}
