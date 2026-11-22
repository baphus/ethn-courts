import { Inbox } from "lucide-react";

export function EmptyIcon({ className = "" }: { className?: string }) {
  return <Inbox aria-hidden="true" className={`mx-auto mb-2 block size-5 text-primary ${className}`} strokeWidth={1.8} />;
}
