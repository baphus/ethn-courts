import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type Kpi = { label: string; value: ReactNode; Icon: LucideIcon; href?: string; warn?: boolean; children?: ReactNode };

export function KpiCard({ label, value, Icon, href, warn, children, index }: Kpi & { index: number }) {
  const className = "cv-rise rounded-xl border bg-card p-4 shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md";
  const style = { animationDelay: `${index * 50}ms` };
  const content = <>
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{label}</p><Icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" /></div>
    <p className={`mt-2 text-xl font-semibold tabular-nums tracking-tight ${warn ? "text-orange-600 dark:text-orange-400" : ""}`}>{value}</p>
    {children && <div className="mt-1">{children}</div>}
  </>;
  return href ? <Link href={href} className={`${className} focus-visible:outline-2 focus-visible:outline-ring`} style={style}>{content}</Link> : <div className={className} style={style}>{content}</div>;
}

export function KpiRow({ items }: { items: Kpi[] }) {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{items.map((item, index) => <KpiCard key={item.label} {...item} index={index} />)}</div>;
}
