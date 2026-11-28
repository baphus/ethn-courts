export const statuses = ["pending", "confirmed", "rejected", "refunded"] as const;
export type Filters = { q: string; status: string[]; from: string; to: string; page: number };
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === `${value}T00:00:00.000Z`;
export function parseFilters(params: URLSearchParams): Filters {
  const from = params.get("from") || "", to = params.get("to") || "";
  const validRange = (!from || validDate(from)) && (!to || validDate(to)) && (!from || !to || from <= to);
  const rawPage = params.get("page") || "1";
  const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  return { q: "", status: [...new Set(params.getAll("status").filter(value => statuses.some(s => s === value)))], from: validRange ? from : "", to: validRange ? to : "", page: Number.isSafeInteger(page) && page >= 1 && page <= 1000 ? page : 1 };
}
export function serializeFilters(filters: Filters): string {
  const params = new URLSearchParams();
  for (const status of filters.status) params.append("status", status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}
