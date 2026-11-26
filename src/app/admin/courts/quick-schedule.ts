import { findEthnHoursIssues } from "@/lib/admin/ethn-hours-validation";
import type { Snapshot } from "../settings/pricing-payload";

type HourWindow = Snapshot["courts"][number]["hours"][number];
const asValidationRows = (hours: readonly HourWindow[]) => hours.map(hour => ({
  weekday: hour.weekday, opens: hour.opens, closes: hour.closes, hourly_rate: hour.hourlyRate?.trim() || null,
}));

export function planQuickSchedule(existing: readonly HourWindow[], proposed: readonly HourWindow[], anchorMinutes: number) {
  const selected = new Set(proposed.map(hour => hour.weekday));
  const proposedIssues = findEthnHoursIssues(asValidationRows(proposed), anchorMinutes);
  const overlaps = new Set<number>();
  if (!proposedIssues.length) {
    for (const issue of findEthnHoursIssues(asValidationRows([...existing, ...proposed]), anchorMinutes)) {
      if (issue.kind === "overlap" && issue.rows[0] < existing.length && issue.rows[1] >= existing.length) overlaps.add(issue.rows[0]);
    }
  }
  const replaced = existing.filter((hour, index) => overlaps.has(index) && selected.has(hour.weekday));
  const unselectedSpill = existing.filter((hour, index) => overlaps.has(index) && !selected.has(hour.weekday));
  const hours = [...existing.filter(hour => !replaced.includes(hour)), ...proposed]
    .sort((a, b) => a.weekday - b.weekday || a.opens.localeCompare(b.opens));
  return { hours, issues: findEthnHoursIssues(asValidationRows(hours), anchorMinutes), proposedIssues, replaced, unselectedSpill };
}
