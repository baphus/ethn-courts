import { addDaysManilaStr } from "../courts";

export const newExpenseCategories = ["Rent", "Payroll/Contractors", "Utilities", "Maintenance & Repairs", "Supplies & Equipment", "Marketing", "Software/Subscriptions", "Taxes & Fees", "Other"] as const;
export const expenseCategories = [...newExpenseCategories, "Maintenance", "Supplies", "Staff"] as const;

export function validFinancePeriod(from: string, to: string, today: string) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && addDaysManilaStr(date, 0) === date;
  return valid(from) && valid(to) && from <= to && to <= today && to <= addDaysManilaStr(from, 365);
}

export function financeFilters(params: Pick<URLSearchParams, "get">, today: string) {
  const from = params.get("from") ?? "", to = params.get("to") ?? "";
  const category = params.get("category") ?? "";
  return {
    ...(validFinancePeriod(from, to, today) ? { from, to } : { from: addDaysManilaStr(today, -29), to: today }),
    category: expenseCategories.some(value => value === category) ? category : "",
    q: (params.get("q") ?? "").trim().slice(0, 100),
  };
}
