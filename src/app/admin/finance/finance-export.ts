import { formatDisplayDate } from "@/lib/display-date";

export type Amounts = { cash: string; gcash: string; collected: string; expenses: string; net: string };
export type Report = { from: string; to: string; scope: string; components?:{bookingAndExtensionCollections:string;manualSalesAfterCorrections:string}; totals: Amounts; daily: (Amounts & { date: string })[] };

export function financeExportRows(report: Report): string[][] {
  const values = (row: Amounts) => [row.cash, row.gcash, row.collected, row.expenses, row.net];
  return [
    ["Finance report"],
    ["Scope", report.scope],
    ["From", formatDisplayDate(report.from)],
    ["To", formatDisplayDate(report.to)],
    ["Date", "Cash (PHP)", "GCash (PHP)", "Recorded collections after corrections (PHP)", "Recorded expenses (PHP)", "Net after recorded expenses (PHP)"],
    ...report.daily.map(row => [formatDisplayDate(row.date), ...values(row)]),
    ["Total", ...values(report.totals)],
    ...(report.components ? [["Verified booking/extension collections",report.components.bookingAndExtensionCollections],["Manual sales after dated corrections",report.components.manualSalesAfterCorrections]] : []),
  ];
}
