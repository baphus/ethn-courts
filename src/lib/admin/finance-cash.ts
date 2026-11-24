export type CashTotals = Record<"bookingPayments" | "otherSales" | "expenses" | "refunds" | "net", string>;
export type CashReport = {
  from: string;
  to: string;
  current: CashTotals;
  previous: CashTotals & { from: string; to: string };
  paymentMethods: { id: string; name: string; amount: string }[];
  expenseCategories: { category: string; amount: string }[];
  daily: ({ date: string } & Omit<CashTotals, "net">)[];
};

export const cashCents = (value: string) => BigInt(value.replace(".", ""));

export function formatCashAmount(value: string): string {
  const [whole, fraction] = value.replace(/^-/, "").split(".");
  return `${value.startsWith("-") ? "−" : ""}₱${BigInt(whole).toLocaleString("en-PH")}.${fraction}`;
}

export function cashChange(current: string, previous: string): string | null {
  const now = cashCents(current), before = cashCents(previous), delta = now - before;
  if (delta === BigInt(0)) return null;
  const sign = delta < BigInt(0) ? "−" : "+";
  const magnitude = delta < BigInt(0) ? -delta : delta;
  if (before > BigInt(0) && now >= BigInt(0)) {
    const tenths = (magnitude * BigInt(1000) + before / BigInt(2)) / before;
    if (!tenths) return `${sign}<0.1%`;
    return `${sign}${(tenths / BigInt(10)).toLocaleString("en-PH")}.${tenths % BigInt(10)}%`;
  }
  return `${sign}${formatCashAmount(`${magnitude / BigInt(100)}.${String(magnitude % BigInt(100)).padStart(2, "0")}`)}`;
}
