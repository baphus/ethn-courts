import { Skeleton } from "@/components/ui/skeleton";

export function LoadingRows({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div role="status" className="space-y-3 p-5"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, i) => <div key={i} className="flex items-center gap-4 border-b pb-3 last:border-0"><Skeleton className="h-4 w-1/3 motion-reduce:animate-none" /><Skeleton className="h-4 w-1/4 motion-reduce:animate-none" /><Skeleton className="ml-auto h-4 w-16 motion-reduce:animate-none" /></div>)}</div>;
}
