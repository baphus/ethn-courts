import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { eventRange } from "../event-range";

const endpoint = "/api/ethn/admin/blocks";
type Kind = "maintenance" | "private";
export type ClosureBlock = { id: string; courtName: string; startsAt: string; endsAt: string; kind: Kind; reason: string };
type Court = { id: string; name: string; active: boolean };
type ClosureInput = { courtIds: string[]; kind: Kind; reason: string; startDate: string; startTime: string; endDate: string; endTime: string; timing: "hours" | "days" };

export function closurePayload(input: ClosureInput, courts: Court[]) {
  const { courtIds, kind } = input;
  const reason = input.reason.trim();
  const range = eventRange({ ...input, eventType: "closure" });
  if (!courtIds.length || courtIds.some(id => !courts.some(court => court.id === id && court.active))) throw new Error("Select at least one active court.");
  if (!range || !reason || reason.length > 500) throw new Error("Enter a reason and valid times. End must be after start.");
  return { courtIds, kind, reason, ...range };
}

function closureError(status: number) {
  switch (status) {
    case 400: return "Check the reason and times. A closure must start in the future and fit within the booking horizon.";
    case 401: return "Your session ended. Sign in again.";
    case 403: return "Owner access is required to manage closures.";
    case 404: return "A court or closure is no longer available. Refresh and try again.";
    case 409: return "This time overlaps another allocation. No closure was created.";
    default: return "Could not update closures. Try again later.";
  }
}

export function useCourtClosures(courts: Court[]) {
  const [blocks, setBlocks] = useState<ClosureBlock[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const rows = await response.json() as (Omit<ClosureBlock, "kind"> & { kind: string })[];
      setBlocks(rows.filter((row): row is ClosureBlock => row.kind === "maintenance" || row.kind === "private"));
      setLoadError("");
    } catch {
      setBlocks([]);
      setLoadError("Closures could not be loaded.");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function create(input: ClosureInput) {
    if (busy || uncertain) return false;
    setError("");
    let payload;
    try { payload = closurePayload(input, courts); }
    catch (err) { setError((err as Error).message); return false; }
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) { if (response.status !== 400) toast.error("Closure was not created."); setError(closureError(response.status)); return false; }
      toast.success("Closure created.");
      await refresh();
      return true;
    } catch {
      toast.warning("Closure creation could not be confirmed.");
      setUncertain(true);
      setError("Could not confirm whether the closure was created. Check the refreshed list or Calendar before retrying.");
      await refresh();
      return false;
    } finally { setBusy(false); }
  }

  async function release(id: string) {
    if (busy || !blocks?.some(block => block.id === id)) return false;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (response.status >= 500) throw new Error();
      if (!response.ok) { toast.error("Closure was not released."); await refresh(); setError(closureError(response.status)); return false; }
      toast.success("Closure released.");
      await refresh();
      return true;
    } catch {
      toast.warning("Closure release could not be confirmed.");
      await refresh();
      setError("Could not confirm whether the closure was released. Check the refreshed list or Calendar.");
      return false;
    } finally { setBusy(false); }
  }

  return { blocks, loadError, refresh, busy, error, uncertain, acknowledge: () => { setUncertain(false); setError(""); }, courts, create, release };
}
