import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function FinanceInfo({ label, children }: { label: string; children: string }) {
  return <Popover>
    <PopoverTrigger openOnHover render={<Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" aria-label={label} />}>
      <Info aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent aria-label={label} className="w-80 max-w-[calc(100vw-2rem)] p-4 text-sm leading-relaxed">{children}</PopoverContent>
  </Popover>;
}
