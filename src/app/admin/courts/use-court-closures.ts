import { useCallback, useEffect, useState } from "react";
import { toIso } from "../calendar/date-utils";

const endpoint = "/api/ethn/admin/blocks";
type Kind = "maintenance" | "private";
export type ClosureBlock = { id: string; courtName: string; startsAt: string; endsAt: string; kind: Kind; reason: string };
type Court = { id: string; name: string; active: boolean };
type ClosureInput = { courtIds: string[]; kind: Kind; reason: string; startDate: string; startTime: string; endDate: string; endTime: string };

export function closurePayload(input: ClosureInput, courts: Court[]) {
  const { courtIds, kind } = input;
  const reason = input.reason.trim();
  const startsAt = toIso(input.startDate, input.startTime);
  const endsAt = toIso(input.endDate, input.endTime);
  if (!courtIds.length || courtIds.some(id => !courts.some(court => court.id === id && court.active))) throw new Error("Select at least one active court.");
  if (!startsAt || !endsAt || endsAt <= startsAt || !reason || reason.length > 500) throw new Error("Enter a reason and valid times. End must be after start.");
  return { courtIds, kind, reason, startsAt, endsAt };
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
  const [notice, setNotice] = useState("");
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
    setError(""); setNotice("");
    let payload;
    try { payload = closurePayload(input, courts); }
    catch (err) { setError((err as Error).message); return false; }
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.status >= 500) throw new Error();
      if (!response.ok) { setError(closureError(response.status)); return false; }
      setNotice("Closure created.");
      await refresh();
      return true;
    } catch {
      setUncertain(true);
      setError("Could not confirm whether the closure was created. Check the refreshed list or Calendar before retrying.");
      await refresh();
      return false;
    } finally { setBusy(false); }
  }

  async function release(id: string) {
    if (busy || !blocks?.some(block => block.id === id)) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (response.status >= 500) throw new Error();
      if (!response.ok) { await refresh(); setError(closureError(response.status)); return false; }
      await refresh();
      setNotice("Closure released.");
      return true;
    } catch {
      await refresh();
      setError("Could not confirm whether the closure was released. Check the refreshed list or Calendar.");
      return false;
    } finally { setBusy(false); }
  }

  return { blocks, loadError, refresh, busy, error, notice, uncertain, acknowledge: () => { setUncertain(false); setError(""); }, courts, create, release };
}
