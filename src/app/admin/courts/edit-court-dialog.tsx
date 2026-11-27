"use client";

import { formatWeeklyHours } from "@/lib/booking/schedule-label";
import { useId, useState, type FormEvent } from "react";
import { Pencil, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/form-select";
import { closingOptions, keepClosingTime, openingOptions } from "./hour-options";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { findEthnHoursIssues } from "@/lib/admin/ethn-hours-validation";
import type { Snapshot } from "../settings/pricing-payload";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Hours = Snapshot["courts"][number]["hours"];

type Props = {
  name: string; description: string; photoVersion: string; hours: Hours; busy: boolean; blocked: boolean;
  error: string; notice: string; anchorMinutes: number;
  onName: (value: string) => void; onDescription: (value: string) => void; onPhoto: (file: File | null) => void;
  onHours: (hours: Hours) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void;
};

export default function EditCourtDialog({ name, description, photoVersion, hours, busy, blocked, error, notice, anchorMinutes, onName, onDescription, onPhoto, onHours, onSave, onClose }: Props) {
  const [rowModal, setRowModal] = useState<{ weekday: number; index?: number; opens: string; closes: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [rowError, setRowError] = useState("");
  const savedRow = rowModal?.index === undefined ? undefined : hours[rowModal.index];
  const savedClose = savedRow?.closes.slice(0, 5);
  const rowCloses = rowModal ? closingOptions(rowModal.opens, anchorMinutes, savedClose) : [];
  const errorId = useId();
  const issues = findEthnHoursIssues(hours.map(hour => ({ ...hour, hourly_rate: hour.hourlyRate?.trim() || null })), anchorMinutes);
  const rowIssues = hours.map((_, index) => issues.filter(issue => issue.rows.includes(index)));
  const anchor = `${String(Math.floor(anchorMinutes / 60)).padStart(2, "0")}:${String(anchorMinutes % 60).padStart(2, "0")}`;
  function issueCopy(issue: (typeof issues)[number], index: number, rows = hours) {
    if (issue.kind === "overlap") {
      const other = rows[issue.rows[0] === index ? issue.rows[1] : issue.rows[0]];
      return `Overlaps ${days[other.weekday]} ${formatWeeklyHours(other.opens, other.closes)}.`;
    }
    if (issue.kind === "boundary") return `Crosses the ${anchor} operating-day boundary. Adjust the opening or closing time.`;
    if (issue.kind === "invalid_rate") return "Enter a valid peso amount or leave blank to disable checkout.";
    return "Enter a valid opening and closing time.";
  }
  function saveRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rowModal) return;
    const form = new FormData(event.currentTarget);
    const next = { id: "", weekday: rowModal.weekday, opens: rowModal.opens, closes: rowModal.closes, hourlyRate: String(form.get("rate") ?? "").trim() || null };
    const candidate = [...hours];
    if (rowModal.index === undefined) candidate.push(next);
    else candidate[rowModal.index] = { ...candidate[rowModal.index], ...next };
    const candidateIssues = findEthnHoursIssues(candidate.map(hour => ({ ...hour, hourly_rate: hour.hourlyRate })), anchorMinutes);
    const rowIndex = rowModal.index ?? candidate.length - 1;
    const issue = candidateIssues.find(issue => issue.rows.includes(rowIndex));
    if (issue) { setRowError(issueCopy(issue, rowIndex, candidate)); return; }
    onHours(candidate);
    setRowError("");
    setRowModal(null);
  }

  return <Dialog open onOpenChange={(open, details) => { if (!open) { details.cancel(); onClose(); } }}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
      <DialogTitle className="border-b pb-3">Edit — {name}</DialogTitle>
      <DialogDescription className="sr-only">Edit weekly hours, rates, or court details.</DialogDescription>
      <p className="text-xs text-muted-foreground">Each row sets one day’s hours and rate. Changes apply to new bookings only; existing reservations and holds stay as booked.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((day, weekday) => {
          const rows = hours.map((hour, index) => ({ hour, index })).filter(({ hour }) => hour.weekday === weekday).sort((a, b) => a.hour.opens.localeCompare(b.hour.opens));
          const today = new Date().getDay() === weekday;
          return <section key={day} className={`flex flex-col gap-2 rounded-lg border p-3 ${today ? "border-ring/50 bg-accent/30" : ""}`} aria-label={`${day} hours`}>
            <div className="flex items-center justify-between"><h3 className="text-xs font-medium text-muted-foreground">{day.slice(0, 3)}</h3>{today && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">Today</span>}</div>
            {rows.length === 0 ? <p className="text-[11px] italic text-muted-foreground">Closed</p> : rows.map(({ hour, index }) => <div key={hour.id || `${hour.opens}-${index}`} className={`rounded-md bg-muted px-2 py-1.5 ${rowIssues[index].length ? "ring-1 ring-destructive/50" : ""}`}>
              <div className="flex items-center justify-between gap-1"><p className="min-w-0 truncate text-[11px] tabular-nums">{formatWeeklyHours(hour.opens, hour.closes)}{" · "}{hour.hourlyRate ? <strong>₱{hour.hourlyRate}</strong> : <span className="italic text-muted-foreground">no rate</span>}</p><div className="flex shrink-0"><Button type="button" variant="ghost" size="icon-sm" disabled={busy} aria-label={`Edit ${day} ${hour.opens.slice(0, 5)} window`} onClick={() => { setRowError(""); setRowModal({ weekday, index, opens: hour.opens.slice(0, 5), closes: hour.closes.slice(0, 5) }); }}><Pencil className="size-3.5" /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={busy} aria-label={`Remove ${day} ${hour.opens.slice(0, 5)} window`} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmRemove(index)}><Trash2 className="size-3.5" /></Button></div></div>
              {rowIssues[index].length > 0 && <ul className="list-disc pl-5 text-[11px] text-destructive">{rowIssues[index].map(issue => <li key={`${issue.kind}-${issue.rows.join("-")}`}>{issueCopy(issue, index)}</li>)}</ul>}
            </div>)}
            <Button type="button" variant="ghost" size="sm" disabled={busy} className="mt-auto w-full justify-center text-muted-foreground" onClick={() => { setRowError(""); setRowModal({ weekday, opens: "07:00", closes: keepClosingTime("07:00", "20:00", anchorMinutes) }); }}><PlusCircle className="size-4" /> Add hours &amp; rate</Button>
          </section>;
        })}
      </div>
      <details className="rounded-lg border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Court details and photo</summary><fieldset disabled={busy} className="mt-4 space-y-4"><label className="grid gap-1 text-sm font-medium">Court name<Input required maxLength={100} value={name} onChange={e => onName(e.target.value)} /></label><label className="grid gap-1 text-sm font-medium">Description <span className="font-normal text-muted-foreground">Optional, shown on public pages</span><Textarea rows={3} maxLength={1000} value={description} onChange={e => onDescription(e.target.value)} /></label><label className="grid gap-1 text-sm font-medium">{photoVersion !== "0" ? "Replace photo" : "Upload photo"}<Input key={photoVersion} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onPhoto(e.target.files?.[0] ?? null)} /><span className="font-normal text-muted-foreground">JPEG, PNG or WebP, up to 5 MiB. Leave empty to keep current photo.</span></label></fieldset></details>
      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border bg-muted p-3 text-sm">{notice}</p>}
      <form id="save-court-form" onSubmit={onSave} />
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" form="save-court-form" disabled={busy || blocked || !name.trim() || issues.length > 0}>{busy ? "Saving…" : "Save court changes"}</Button></div>
    </DialogContent>
    {rowModal && <Dialog open onOpenChange={(open, details) => { if (!open) { details.cancel(); setRowModal(null); } }}><DialogContent forceBackdrop overlayClassName="z-[60] bg-black/50" className="z-[61] sm:max-w-md"><DialogTitle>{rowModal.index === undefined ? "Add hours & rate" : "Edit hours & rate"} — {days[rowModal.weekday]}</DialogTitle><DialogDescription>Changes apply to new bookings; existing bookings and allocations remain unchanged.</DialogDescription><form onSubmit={saveRow} className="space-y-4"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div className="grid gap-1 text-sm"><label htmlFor={`${errorId}-opens`}>Opens</label><FormSelect positionerClassName="z-[62]" id={`${errorId}-opens`} value={rowModal.opens} options={openingOptions(savedRow?.opens)} onValueChange={opens => { if (opens) { setRowError(""); setRowModal({ ...rowModal, opens, closes: keepClosingTime(opens, rowModal.closes, anchorMinutes, savedClose) }); } }} /></div><span className="text-xs text-muted-foreground">to</span><div className="grid gap-1 text-sm"><label htmlFor={`${errorId}-closes`}>Closes</label><FormSelect positionerClassName="z-[62]" id={`${errorId}-closes`} placeholder="Choose closing time" value={rowCloses.some(option => option.value === rowModal.closes) ? rowModal.closes : null} options={rowCloses} onValueChange={closes => { if (closes) { setRowError(""); setRowModal({ ...rowModal, closes }); } }} /></div></div><label className="flex items-center gap-2 text-sm">Rate (₱)<Input name="rate" inputMode="decimal" defaultValue={rowModal.index === undefined ? "" : hours[rowModal.index].hourlyRate ?? ""} /></label>{rowError && <p role="alert" className="text-sm text-destructive">{rowError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRowModal(null)}>Cancel</Button><Button type="submit">{rowModal.index === undefined ? "Add hours & rate" : "Save changes"}</Button></div></form></DialogContent></Dialog>}
    {confirmRemove !== null && <Dialog open onOpenChange={(open, details) => { if (!open) { details.cancel(); setConfirmRemove(null); } }}><DialogContent forceBackdrop overlayClassName="z-[60] bg-black/50" className="z-[61] sm:max-w-md"><DialogTitle>Remove hours?</DialogTitle><DialogDescription>This removes this weekly window from the proposed schedule. Existing bookings and allocations stay in place.</DialogDescription><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setConfirmRemove(null)}>Keep window</Button><Button type="button" variant="destructive" onClick={() => { onHours(hours.filter((_, index) => index !== confirmRemove)); setConfirmRemove(null); }}>Remove window</Button></div></DialogContent></Dialog>}
  </Dialog>;
}
