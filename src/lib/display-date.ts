const longDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "October 19, 2026" for a YYYY-MM-DD Manila calendar date.
 * Any other string (ISO timestamp, already-formatted label) is returned unchanged,
 * so machine values such as date-input values keep their own format.
 */
export function formatDisplayDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return longDate.format(new Date(`${dateStr}T00:00:00Z`));
}
