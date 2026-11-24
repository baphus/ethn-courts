"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AdminRequestError, errorMessage, ErrorNotice, request } from "@/app/admin/bookings/booking-list";
import { createDashboardCache } from "./dashboard-cache";

const DashboardCache = createContext<ReturnType<typeof createDashboardCache> | null>(null);

export function DashboardCacheProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(createDashboardCache);
  const denial = useSyncExternalStore(cache.subscribe, cache.denial, () => 0);
  return <DashboardCache.Provider value={cache}>{denial ? <div className="p-5"><ErrorNotice message={errorMessage(denial)} /><button type="button" className="mt-3 underline" onClick={() => window.location.reload()}>Reload to verify access</button></div> : children}</DashboardCache.Provider>;
}

export function useDashboardAccessDenial() {
  return useContext(DashboardCache)?.deny;
}

export function useDashboardOwner() {
  return useContext(DashboardCache) !== null;
}

const zero = () => 0;
const noopSubscribe = () => () => {};

export function useInvalidateOwnerResources() {
  return useContext(DashboardCache)?.invalidate;
}

export function useDashboardResource<T>(url: string) {
  const cache = useContext(DashboardCache);
  const revision = useSyncExternalStore(cache?.subscribe ?? noopSubscribe, cache?.revision ?? zero, zero);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ url: string; cache: typeof cache; revision: number; data: T | null; error: string; loading: boolean }>();

  useEffect(() => {
    const cached = cache?.read<T>(url);
    if (cached !== undefined) {
      setState({ url, cache, revision, data: cached, error: "", loading: false });
      return;
    }
    const controller = new AbortController();
    setState(previous => ({ url, cache, revision, data: previous?.url === url && previous.cache === cache && previous.revision === revision ? previous.data : null, error: "", loading: true }));
    void request<T>(url, controller.signal).then(data => {
      if (controller.signal.aborted || (cache && cache.revision() !== revision)) return;
      cache?.write(url, data);
      setState({ url, cache, revision, data, error: "", loading: false });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof AdminRequestError) cache?.deny(error.status);
      setState(previous => ({ url, cache, revision, data: !cache && previous?.url === url ? previous.data : null, error: error instanceof Error ? error.message : "Service unavailable. Please try again.", loading: false }));
    });
    return () => controller.abort();
  }, [cache, url, version, revision]);

  const retry = useCallback(() => {
    cache?.delete(url);
    setVersion(value => value + 1);
  }, [cache, url]);
  if (state?.url === url && state.cache === cache && state.revision === revision) {
    return { data: state.data, error: state.error, loading: state.loading, retry };
  }
  const cached = cache?.read<T>(url);
  return { data: cached ?? null, error: "", loading: cached === undefined, retry };
}
