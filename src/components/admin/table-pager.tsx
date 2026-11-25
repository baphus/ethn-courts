"use client";

import { Button } from "@/components/ui/button";

export function TablePager({ page, pageSize, total, onPageChange, busy = false }: {
  page: number; pageSize: number; total: number; onPageChange: (page: number) => void; busy?: boolean;
}) {
  const last = Math.min(1000, Math.max(1, Math.ceil(total / pageSize)));
  const pages = Array.from(new Set([1, page - 1, page, page + 1, last].filter(n => n >= 1 && n <= last))).sort((a, b) => a - b);
  const firstRow = (page - 1) * pageSize + 1;
  const range = firstRow <= total ? `${firstRow}–${Math.min(page * pageSize, total)}` : "0";

  return <nav aria-label="Results pages" className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm">
    <span className="text-muted-foreground" role="status">{busy ? "Loading results…" : `${range} of ${total}`}</span>
    {last > 1 && <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="outline" disabled={page <= 1} aria-disabled={busy || undefined} onClick={() => { if (!busy) onPageChange(page - 1); }}>Previous</Button>
      {pages.map((n, i) => <span key={n} className="flex items-center gap-1">
        {i > 0 && n > pages[i - 1] + 1 && <span aria-hidden="true">…</span>}
        <Button size="sm" className="min-w-7" variant={n === page ? "secondary" : "ghost"} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} aria-disabled={busy || undefined} onClick={() => { if (!busy && n !== page) onPageChange(n); }}>{n}</Button>
      </span>)}
      <Button size="sm" variant="outline" disabled={page >= last} aria-disabled={busy || undefined} onClick={() => { if (!busy) onPageChange(page + 1); }}>Next</Button>
    </div>}
  </nav>;
}
