import { CalendarDays, DollarSign, ReceiptText, TrendingUp } from "lucide-react";
import { StatCard, STAT_CARD_GRID } from "@/components/admin/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { FinanceReport } from "@/lib/admin/finance";

const formatCents = (value: number) => {
  const cents = BigInt(Math.abs(value));
  return `₱${value < 0 ? "-" : ""}${(cents / BigInt(100)).toLocaleString("en-PH")}.${String(cents % BigInt(100)).padStart(2, "0")}`;
};

export function ReportStats({ report }: { report?: FinanceReport | null }) {
  const placeholder = <Skeleton className="h-8 w-28 motion-reduce:animate-none" />;
  return <div className={STAT_CARD_GRID} aria-busy={!report}>
    <StatCard label="Booking Revenue" value={report ? formatCents(report.revenueCents) : placeholder} icon={DollarSign} subtitle="Counted on approval date" />
    <StatCard label="Expenses" value={report ? formatCents(report.expenseCents) : placeholder} icon={ReceiptText} subtitle="Effective amounts by paid date" />
    <StatCard label="Net Profit" value={report ? formatCents(report.profitCents) : placeholder} icon={TrendingUp} subtitle="Booking revenue less expenses" />
    <StatCard label="Booking Count" value={report ? String(report.bookings) : placeholder} icon={CalendarDays} subtitle="Eligible bookings approved in range" />
  </div>;
}
