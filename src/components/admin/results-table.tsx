import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const resultsCell = "px-3 py-2.5 align-top";

export function ResultsTable({ label, loadingLabel, headers, numeric, minWidth, loading, children }: {
  label: string;
  loadingLabel: string;
  headers: readonly string[];
  numeric: readonly string[];
  minWidth: string;
  loading: boolean;
  children: ReactNode;
}) {
  return <div className="overflow-hidden rounded-md border bg-card">
    <span role="status" className="sr-only">{loading ? loadingLabel : ""}</span>
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      <table className={`w-full ${minWidth} text-left text-sm`}>
        <thead className="border-b bg-muted/50 text-muted-foreground"><tr>{headers.map(header => <th key={header} scope="col" className={`${resultsCell} whitespace-nowrap font-medium ${numeric.includes(header) ? "text-right" : ""}`}>{header}</th>)}</tr></thead>
        <tbody className="divide-y [&>tr:not([aria-hidden]):hover]:bg-muted/30" aria-busy={loading}>
          {loading ? [0, 1, 2].map(index => <tr key={index} aria-hidden="true">{headers.map(header => <td key={header} className={resultsCell}><Skeleton className="h-4 w-full max-w-24 motion-reduce:animate-none" /></td>)}</tr>) : children}
        </tbody>
      </table>
    </div>
  </div>;
}
