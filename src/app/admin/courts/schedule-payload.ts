import type { Snapshot } from "../settings/pricing-payload";

/**
 * PUT /api/ethn/admin/hours body: every court (inactive included), only the
 * fields that endpoint writes. Rates belong to the window they price.
 */
export function schedulePayload(data: Snapshot) {
  return { version: data.version, courts: data.courts.map(c => ({ id: c.id, active: c.active, hours: c.hours.map(h => ({ weekday: h.weekday, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5), hourly_rate: h.hourlyRate?.trim() || null })) })) };
}
