import { CalendarDays, DollarSign, ReceiptText, TrendingUp } from "lucide-react";
import { KpiRow } from "@/components/admin/kpi-row";
import { Skeleton } from "@/components/ui/skeleton";
import type { FinanceReport } from "@/lib/admin/finance";

const formatCents = (value: number) => {
  const cents = BigInt(Math.abs(value));
  return `₱${value < 0 ? "-" : ""}${(cents / BigInt(100)).toLocaleString("en-PH")}.${String(cents % BigInt(100)).padStart(2, "0")}`;
};

export function ReportStats({ report }: { report?: FinanceReport | null }) {
  const placeholder = <Skeleton className="h-7 w-16 motion-reduce:animate-none" />;
  return <div aria-busy={!report}><KpiRow items={[
    { label: "Booking Revenue", value: report ? formatCents(report.revenueCents) : placeholder, Icon: DollarSign, children: <p className="text-xs text-muted-foreground">Counted on approval date</p> },
    { label: "Expenses", value: report ? formatCents(report.expenseCents) : placeholder, Icon: ReceiptText, children: <p className="text-xs text-muted-foreground">Effective amounts by paid date</p> },
    { label: "Net Profit", value: report ? formatCents(report.profitCents) : placeholder, Icon: TrendingUp, children: <p className="text-xs text-muted-foreground">Booking revenue less expenses</p> },
    { label: "Booking Count", value: report ? String(report.bookings) : placeholder, Icon: CalendarDays, children: <p className="text-xs text-muted-foreground">Eligible bookings approved in range</p> },
  ]} /></div>;
}
