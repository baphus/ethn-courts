"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import NextTopLoader from "nextjs-toploader";
import { usePathname, useRouter } from "next/navigation";
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

type SidebarCounts = { pendingBookings: number; totalNotifications: number; unreadNotifications: number; unreadSummary: { label: string; count: number }[] };
const unreadToastId = "staff-unread-summary";
const countsInterval = 120_000;
const SidebarActivity = createContext<{
  counts: SidebarCounts | null;
  refreshCounts: () => Promise<void>;
}>({ counts: null, refreshCounts: async () => {} });
export const useSidebarActivity = () => useContext(SidebarActivity);

export default function AdminShell({ email, name, className, children }: Props) {
  const [counts, setCounts] = useState<SidebarCounts | null>(null);
  const request = useRef<{ controller: AbortController; done: Promise<void>; next?: Promise<void> } | null>(null);
  const latest = useRef<{ counts: SidebarCounts; at: number } | null>(null);
  const lastStart = useRef(-Infinity);
  const timer = useRef<number | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const summaryPending = useRef(false);
  const showSummary = useCallback((nextCounts: SidebarCounts) => {
    if (!summaryPending.current) return;
    summaryPending.current = false;
    try { sessionStorage.removeItem("ethn:show-unread-after-login"); } catch { /* Storage is optional. */ }
    const count = nextCounts.unreadNotifications;
    if (count > 0) toast(`${count} unread notification${count === 1 ? "" : "s"}`, {
      id: unreadToastId,
      description: nextCounts.unreadSummary.map(({ label, count }) => `${label}: ${count}`).join(" · "),
      duration: Infinity,
      dismissible: true,
      closeButton: true,
      action: { label: "Open unread inbox", onClick: () => router.push("/admin/notifications?unread=1") },
    });
  }, [router]);
  const fetchCounts = useCallback(() => {
    if (request.current) return request.current.done;
    const controller = new AbortController();
    lastStart.current = performance.now();
    const done = (async () => {
      try {
        const response = await fetch("/api/ethn/admin/sidebar-counts", { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const nextCounts: SidebarCounts = await response.json();
          if (controller.signal.aborted) return;
          latest.current = { counts: nextCounts, at: lastStart.current };
          setCounts(nextCounts);
          showSummary(nextCounts);
        } else if (!controller.signal.aborted && (response.status === 401 || response.status === 403)) {
          latest.current = null;
          setCounts(null);
        }
      } catch { /* Keep last successful counts on transient failure. */ }
      finally { if (request.current?.controller === controller) request.current = null; }
    })();
    request.current = { controller, done };
    return done;
  }, [showSummary]);

  // A read already running may predate the mutation. Share one follow-up read.
  const refreshCounts = useCallback(() => {
    const active = request.current;
    if (!active) return fetchCounts();
    return active.next ??= active.done.then(() => {
      if (!active.controller.signal.aborted) return fetchCounts();
    });
  }, [fetchCounts]);

  const syncCounts = useCallback(function sync() {
    window.clearTimeout(timer.current);
    if (document.hidden) return;
    const remaining = countsInterval - (performance.now() - lastStart.current);
    if (remaining <= 0) {
      void fetchCounts();
      timer.current = window.setTimeout(sync, countsInterval);
    } else {
      timer.current = window.setTimeout(sync, remaining);
    }
  }, [fetchCounts]);

  useEffect(() => {
    let signedIn = false;
    try {
      signedIn = sessionStorage.getItem("ethn:show-unread-after-login") === "1";
    } catch { /* Dashboard reminders do not need storage. */ }
    if (pathname === "/admin" || signedIn) {
      summaryPending.current = true;
      if (latest.current && performance.now() - latest.current.at < countsInterval) showSummary(latest.current.counts);
      else syncCounts();
    }
    return () => {
      summaryPending.current = false;
      toast.dismiss(unreadToastId);
    };
  }, [pathname, showSummary, syncCounts]);

  useEffect(() => {
    syncCounts();
    window.addEventListener("focus", syncCounts);
    document.addEventListener("visibilitychange", syncCounts);
    return () => {
      request.current?.controller.abort();
      request.current = null;
      lastStart.current = -Infinity;
      window.clearTimeout(timer.current);
      window.removeEventListener("focus", syncCounts);
      document.removeEventListener("visibilitychange", syncCounts);
    };
  }, [fetchCounts, syncCounts]);

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
