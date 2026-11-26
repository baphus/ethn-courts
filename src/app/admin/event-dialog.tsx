"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { eventRange } from "./event-range";

export type EventDraft = { eventType: "closure" | "open_play"; courtIds: string[]; kind: "maintenance" | "private"; reason: string; title: string; description: string; fee: string; eventUrl?: string; timing: "hours" | "days"; startDate: string; endDate: string; startTime: string; endTime: string };
type Props = { closureOnly?: boolean; initialDate?: string; courts: readonly { id: string; name: string; active: boolean }[]; disabled?: boolean; busy: boolean; blocked?: boolean; notice?: ReactNode; onOpenChange?: (open: boolean) => void; onSubmit: (draft: EventDraft) => Promise<boolean> };
const blank = (date = ""): EventDraft => ({ eventType: "closure", courtIds: [], kind: "maintenance", reason: "", title: "", description: "", fee: "0", timing: "hours", startDate: date, endDate: date, startTime: "", endTime: "" });

export function EventDialog({ closureOnly = false, initialDate = "", courts, disabled = false, busy, blocked = false, notice, onOpenChange, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(() => blank());
  const [confirmClose, setConfirmClose] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saving = useRef(false);
  const activeCourts = useMemo(() => courts.filter(court => court.active), [courts]);
  const range = eventRange(draft);
  const wholeDays = draft.eventType === "closure" && draft.timing === "days";
  const selectedCount = activeCourts.filter(court => draft.courtIds.includes(court.id)).length;
  const unavailable = disabled || blocked;

  function close() {
    setConfirmClose(false);
    setOpen(false);
    onOpenChange?.(false);
  }

  function requestClose() {
    if (busy || saving.current) return;
    if (dirty) setConfirmClose(true);
    else close();
  }

  function changeOpen(next: boolean) {
    if (!next) { requestClose(); return; }
    if (!dirty) setDraft(blank(initialDate));
    setOpen(true);
    onOpenChange?.(true);
  }

  useEffect(() => {
    if (!open || disabled) return;
    setDraft(current => {
      const courtIds = current.courtIds.filter(id => activeCourts.some(court => court.id === id));
      return courtIds.length === current.courtIds.length ? current : { ...current, courtIds };
    });
  }, [open, disabled, activeCourts]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saving.current || unavailable || confirmClose || !draft.courtIds.length || !range) return;
    saving.current = true;
    try {
      if (await onSubmit(draft)) {
        setDraft(blank());
        setDirty(false);
        close();
      }
    } finally { saving.current = false; }
  }

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setDirty(true);
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger render={<Button type="button" size="sm" disabled={disabled || busy} />}>{closureOnly ? "+ Add closure" : "+ Create event"}</DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogTitle>{closureOnly ? "New closure" : "Create event"}</DialogTitle>
      <DialogDescription>{closureOnly ? "Closures override operating hours. Choose courts and dates to block." : "Reserve courts for a closure or an Open Play."}</DialogDescription>
      {notice}
      {confirmClose && <div role="alert" className="space-y-2 rounded-md border p-3 text-sm"><p>Close form? Your entries will remain available while this page stays open.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button><Button type="button" disabled={busy} onClick={close}>Close form</Button></div></div>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={unavailable || busy || confirmClose} className="space-y-4">
          {!closureOnly && <label className="grid gap-1 text-sm font-semibold">Event type<select value={draft.eventType} onChange={e => set("eventType", e.target.value as EventDraft["eventType"])} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="closure">Closure</option><option value="open_play">Open Play</option></select></label>}
          {draft.eventType === "closure" && <label className="grid gap-1 text-sm font-semibold">Closure type<select value={draft.kind} onChange={e => set("kind", e.target.value as EventDraft["kind"])} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"><option value="maintenance">Maintenance</option><option value="private">Private</option></select></label>}
          {draft.eventType === "closure" && <div className="grid grid-cols-2 gap-2"><Button type="button" aria-pressed={wholeDays} variant={wholeDays ? "default" : "outline"} onClick={() => set("timing", "days")}>Whole day(s)</Button><Button type="button" aria-pressed={!wholeDays} variant={!wholeDays ? "default" : "outline"} onClick={() => set("timing", "hours")}>Specific hours</Button></div>}
          <fieldset className="space-y-2"><legend className="text-sm font-semibold">Courts</legend><p className="text-sm text-muted-foreground">Select one or more active courts.</p><Button type="button" variant="outline" size="sm" onClick={() => set("courtIds", activeCourts.map(c => c.id))}>Select all active courts</Button><div className="flex flex-wrap gap-x-5 gap-y-2">{activeCourts.map(court => <label key={court.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.courtIds.includes(court.id)} onChange={e => set("courtIds", e.target.checked ? [...draft.courtIds, court.id] : draft.courtIds.filter(id => id !== court.id))}/>{court.name}</label>)}</div><p aria-live="polite" className="text-xs text-muted-foreground">{selectedCount} of {activeCourts.length} active courts selected</p></fieldset>
          {draft.eventType === "closure" ? <label className="grid gap-1 text-sm font-semibold">Reason <span className="font-normal text-muted-foreground">Required, up to 500 characters</span><textarea required maxLength={500} value={draft.reason} onChange={e => set("reason", e.target.value)} className="min-h-20 rounded-md border border-input bg-transparent p-3 text-sm" /></label> : <><label className="grid gap-1 text-sm font-semibold">Title<Input required maxLength={100} value={draft.title} onChange={e => set("title", e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Description <span className="font-normal text-muted-foreground">Optional, up to 2,000 characters</span><textarea maxLength={2000} value={draft.description} onChange={e => set("description", e.target.value)} className="min-h-20 rounded-md border border-input bg-transparent p-3 text-sm" /></label><label className="grid gap-1 text-sm font-semibold">Fee (PHP) <span className="font-normal text-muted-foreground">Informational only. No registration or payment is collected.</span><Input required type="number" min="0" step="0.01" value={draft.fee} onChange={e => set("fee", e.target.value)} /></label><label className="grid gap-1 text-sm font-semibold">Reclub event link (optional)<Input type="url" maxLength={256} value={draft.eventUrl ?? ""} onChange={e => set("eventUrl", e.target.value)} /></label></>}
          <p className="text-sm text-muted-foreground">{wholeDays ? "Both dates are included. Whole days run from midnight to midnight in Manila. To close the rest of today, choose Specific hours." : "Times are in Manila. For an overnight event, choose the next day as the end date."}</p>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold">Start date<Input required type="date" value={draft.startDate} onChange={e => set("startDate", e.target.value)} /></label>{!wholeDays && <label className="grid gap-1 text-sm font-semibold">Start time<Input required type="time" value={draft.startTime} onChange={e => set("startTime", e.target.value)} /></label>}<label className="grid gap-1 text-sm font-semibold">End date<Input required type="date" value={draft.endDate} onChange={e => set("endDate", e.target.value)} /></label>{!wholeDays && <label className="grid gap-1 text-sm font-semibold">End time<Input required type="time" value={draft.endTime} onChange={e => set("endTime", e.target.value)} /></label>}</div>
          <p aria-live="polite" className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{range ? `${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(range.startsAt))} – ${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(range.endsAt))}` : "Choose valid dates and times to preview this event."}</p>
        </fieldset>
        <DialogFooter><Button type="button" variant="outline" disabled={busy || confirmClose} onClick={requestClose}>Cancel</Button><Button type="submit" disabled={busy || unavailable || confirmClose || !range || !selectedCount}>{busy ? "Saving…" : closureOnly ? "Add closure" : "Create event"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
