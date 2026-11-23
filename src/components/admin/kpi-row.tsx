export type Kpi = { label: string; value: number; warn?: boolean };
export function KpiRow({ items }: { items: Kpi[] }) {
  return <div aria-label="Today booking metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">{items.map((item, i) => <div key={item.label} className="cv-rise rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md" style={{ animationDelay: `${i * 50}ms` }}><p className="text-sm text-muted-foreground">{item.label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${item.warn && item.value > 0 ? "text-orange-600 dark:text-orange-400" : ""}`}>{item.value}</p></div>)}</div>;
}
