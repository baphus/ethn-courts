"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import NextTopLoader from "nextjs-toploader";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminSidebar from "./admin-sidebar";
import ThemeToggle from "./theme-toggle";

interface Props {
  email: string;
  name: string | null;
  className?: string;
  children: React.ReactNode;
}

type SidebarCounts = { pendingBookings: number; unreadNotifications: number };
const SidebarActivity = createContext<{
  counts: SidebarCounts | null;
  refreshCounts: () => Promise<void>;
}>({ counts: null, refreshCounts: async () => {} });
export const useSidebarActivity = () => useContext(SidebarActivity);

export default function AdminShell({ email, name, className, children }: Props) {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const request = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!counts) return;
    try {
      if (!sessionStorage.getItem("ethn:show-unread-after-login")) return;
      sessionStorage.removeItem("ethn:show-unread-after-login");
    } catch { return; }
    const count = counts.unreadNotifications;
    if (count > 0) toast(`${count} unread notification${count === 1 ? "" : "s"}`, {
      action: { label: "Open unread inbox", onClick: () => router.push("/admin/notifications?unread=1") },
    });
  }, [counts, router]);
  const refreshCounts = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/ethn/admin/sidebar-counts", { cache: "no-store", signal: controller.signal });
      if (response.ok) {
        const nextCounts: SidebarCounts = await response.json();
        if (!controller.signal.aborted) setCounts(nextCounts);
      } else if (!controller.signal.aborted && (response.status === 401 || response.status === 403)) {
        setCounts(null);
      }
    } catch { /* Keep last successful counts on transient failure. */ }
    finally { if (request.current === controller) request.current = null; }
  }, []);

  useEffect(() => {
    let lastSync = -Infinity;
    const sync = () => {
      const now = performance.now();
      if (document.hidden || now - lastSync < 1_000) return;
      lastSync = now;
      void refreshCounts();
    };
    sync();
    const interval = window.setInterval(sync, 60_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      request.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refreshCounts]);

  return <SidebarActivity.Provider value={{ counts, refreshCounts }}><TooltipProvider>
    <NextTopLoader color="var(--primary)" showSpinner={false} />
    <SidebarProvider className={`daylight admin-shell-canvas ${className ?? ""}`} style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
      <div data-admin-shell className="contents">
        <AdminSidebar email={email} name={name} counts={counts} />
        <SidebarInset className="admin-frame min-w-0 overflow-x-clip">
          <div className="admin-workspace flex min-w-0 flex-1 flex-col gap-4 overflow-x-clip p-4 md:p-6">
            <div className="flex items-center gap-1 self-start md:hidden">
              <SidebarTrigger aria-label="Open sidebar" />
              <ThemeToggle />
            </div>
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  </TooltipProvider></SidebarActivity.Provider>;
}
