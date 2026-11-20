import type { Snapshot } from "../settings/pricing-payload";

export function hoursPayload(data: Snapshot) {
  return { version: data.version, courts: data.courts.map(c => ({ id: c.id, active: c.active, hours: c.hours.map(h => ({ weekday: h.weekday, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5), hourly_rate: h.hourlyRate?.trim() || null })) })) };
}
