"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Plus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ThemeToggle from "./theme-toggle";

const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila", timeZoneName: "short" });

export default function AdminTopbar() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(stamp.format(new Date()));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  return <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
    <SidebarTrigger aria-label="Toggle sidebar" />
    <div className="ml-auto flex items-center gap-2">
      {now && <span className="hidden rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground tabular-nums md:inline-block">{now}</span>}
      <ThemeToggle />
      <Link href="/admin/notifications" aria-label="Notifications" className="relative inline-flex size-9 items-center justify-center rounded-lg border bg-card hover:bg-muted"><Bell className="size-4" /></Link>
      <Link href="/admin/walk-in" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="size-4" /> Prepaid walk-in</Link>
    </div>
  </header>;
}
