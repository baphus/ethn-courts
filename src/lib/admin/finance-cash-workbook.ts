import type { Cell, SheetData } from "write-excel-file/browser";
import { cashCents, type CashFinanceExport } from "./finance-cash";

const heading = (value: string): Cell => ({ value, fontWeight: "bold" });
const pesos = (amount: string | null): Cell => {
  if (amount === null) return null;
  const cents = cashCents(amount);
  // Excel preserves at most 15 significant digits. Don't silently round away cents.
  if (String(cents).replace("-", "").length > 15) return { value: amount, type: String };
  return { value: Number(cents) / 100, format: "#,##0.00" };
};

export function buildCashWorkbook({ from, to, generated, totals, entries }: CashFinanceExport) {
  const summary: SheetData = [
    [heading("Cash activity"), heading("Amount (PHP)")],
    ["Manila reporting period", `${from} to ${to}`],
    ["Generated (Manila date)", generated],
    [],
    ["Booking and extension receipts", pesos(totals.bookingPayments)],
    ["Other sales after corrections", pesos(totals.otherSales)],
    ["Expenses", pesos(totals.expenses)],
    ["Recorded refunds", pesos(totals.refunds)],
    [heading("Net recorded cash"), pesos(totals.net)],
    [],
    ["Net = receipts + other sales − expenses − refunds."],
    ["Receipts use recorded receipt date, or verification date if unavailable."],
    ["Expenses use paid date; corrections and refunds use their ledger date."],
    ["Expense and refund amounts are outflows. Correction amounts are signed deltas."],
    ["Cash and GCash deltas explain sale corrections; do not add them to Amount."],
  ];
  const ledger: SheetData = [
    ["Manila date", "Entry type", "Reference", "Entry ID", "Payment method ID", "Expense category", "Amount (PHP)", "Cash delta (PHP)", "GCash delta (PHP)"].map(heading),
    ...entries.map(entry => [entry.date, entry.kind, entry.reference, entry.id, entry.method, entry.category, pesos(entry.amount), pesos(entry.cashDelta), pesos(entry.gcashDelta)]),
  ];
  return [
    { sheet: "Summary", data: summary, columns: [{ width: 40 }, { width: 30 }] },
    { sheet: "Ledger", data: ledger, columns: [15, 23, 39, 39, 24, 23, 22, 22, 22].map(width => ({ width })), stickyRowsCount: 1 },
  ];
}
