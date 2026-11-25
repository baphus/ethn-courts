"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import NextTopLoader from "nextjs-toploader";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminSidebar from "./admin-sidebar";

interface Props {
  email: string;
  name: string | null;
  children: React.ReactNode;
}

type SidebarCounts = { pendingBookings: number; unreadNotifications: number };
const SidebarActivity = createContext<{
  counts: SidebarCounts | null;
  refreshCounts: () => Promise<void>;
  syncInbox: () => Promise<void>;
}>({ counts: null, refreshCounts: async () => {}, syncInbox: async () => {} });
export const useSidebarActivity = () => useContext(SidebarActivity);

export default function AdminShell({ email, name, children }: Props) {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const request = useRef<AbortController | null>(null);
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

  const reconciliation = useRef<{ controller: AbortController; done: Promise<void> } | null>(null);
  const syncInbox = useCallback(() => {
    if (reconciliation.current) return reconciliation.current.done;
    // Use existing reconciliation when the inbox cron isn't scheduled.
    const controller = new AbortController();
    const done = fetch("/api/ethn/admin/notifications/reconcile", { method: "POST", signal: controller.signal })
      .catch(() => null)
      .then(() => { if (!controller.signal.aborted) return refreshCounts(); })
      .finally(() => { if (reconciliation.current?.controller === controller) reconciliation.current = null; });
    reconciliation.current = { controller, done };
    return done;
  }, [refreshCounts]);

  useEffect(() => {
    const sync = () => { if (!document.hidden) void syncInbox(); };
    sync();
    const interval = window.setInterval(sync, 60_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      reconciliation.current?.controller.abort();
      reconciliation.current = null;
      request.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [syncInbox]);

  return <SidebarActivity.Provider value={{ counts, refreshCounts, syncInbox }}><TooltipProvider>
    <NextTopLoader color="var(--primary)" showSpinner={false} />
    <SidebarProvider className="admin-shell-canvas" style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
      <div data-admin-shell className="contents">
        <AdminSidebar email={email} name={name} counts={counts} />
        <SidebarInset className="admin-frame min-w-0 overflow-x-clip">
          <div className="admin-workspace flex min-w-0 flex-1 flex-col gap-4 overflow-x-clip p-4 md:p-6">
            <SidebarTrigger aria-label="Open sidebar" className="self-start md:hidden" />
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  </TooltipProvider></SidebarActivity.Provider>;
}
