import { Skeleton } from "@/components/ui/skeleton";
import { ReportStats } from "./report-stats";

export default function FinanceLoading() {
  return <div className="space-y-6" role="status">
    <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
    <span className="sr-only">Loading finance</span>
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">Approval-based reporting</h2>
      <ReportStats />
    </section>
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="mb-5 text-xl font-bold">Revenue and profit trend</h2>
      <Skeleton className="h-64 w-full motion-reduce:animate-none" />
    </section>
  </div>;
}
