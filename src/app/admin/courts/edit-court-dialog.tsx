"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Snapshot } from "../settings/pricing-payload";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Hours = Snapshot["courts"][number]["hours"];

type Props = {
  name: string;
  description: string;
  photoVersion: string;
  hours: Hours;
  busy: boolean;
  blocked: boolean;
  error: string;
  notice: string;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onPhoto: (file: File | null) => void;
  onHours: (hours: Hours) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export default function EditCourtDialog({ name, description, photoVersion, hours, busy, blocked, error, notice, onName, onDescription, onPhoto, onHours, onSave, onClose }: Props) {
  function updateWindow(index: number, patch: Partial<Hours[number]>) {
    onHours(hours.map((hour, i) => i === index ? { ...hour, ...patch } : hour));
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogTitle>Edit court</DialogTitle>
      <DialogDescription>Name, description and photo appear on public pages. Weekly windows and rates apply to new checkouts; existing bookings keep their price.</DialogDescription>
      <form onSubmit={onSave} className="space-y-6">
        <fieldset disabled={busy} className="space-y-4">
          <legend className="sr-only">Court details</legend>
          <label className="grid gap-1 text-sm font-medium">Court name<Input required maxLength={100} value={name} onChange={e => onName(e.target.value)} /></label>
          <label className="grid gap-1 text-sm font-medium">Description <span className="font-normal text-muted-foreground">Optional, shown on public pages</span><textarea rows={3} maxLength={1000} className="w-full rounded-md border border-input bg-transparent p-3 text-sm font-normal" value={description} onChange={e => onDescription(e.target.value)} /></label>
          <label className="grid gap-1 text-sm font-medium">{photoVersion !== "0" ? "Replace photo" : "Upload photo"}<Input key={photoVersion} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onPhoto(e.target.files?.[0] ?? null)} /><span className="font-normal text-muted-foreground">JPEG, PNG or WebP, up to 5 MiB. Leave empty to keep the current photo.</span></label>
        </fieldset>

        <fieldset disabled={busy} className="space-y-3">
          <legend className="text-sm font-semibold">Weekly windows</legend>
          <p className="text-sm text-muted-foreground">A blank rate disables checkout for that window. Times are in Manila.</p>
          {hours.length === 0 && <p className="text-sm text-muted-foreground">No windows yet.</p>}
          {hours.map((hour, index) => {
            const opens = hour.opens.slice(0, 5);
            const closes = hour.closes.slice(0, 5);
            return <div key={index} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-1 text-sm">Day<select className="h-9 rounded-md border border-input bg-transparent px-3" value={hour.weekday} onChange={e => updateWindow(index, { weekday: Number(e.target.value) })}>{days.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>
                <label className="grid gap-1 text-sm">Opens<Input type="time" required value={opens} onChange={e => updateWindow(index, { opens: e.target.value })} /></label>
                <label className="grid gap-1 text-sm">Closes<Input type="time" required value={closes} onChange={e => updateWindow(index, { closes: e.target.value })} /></label>
                <label className="grid gap-1 text-sm">₱ per hour<Input inputMode="decimal" placeholder="Checkout disabled" value={hour.hourlyRate ?? ""} onChange={e => updateWindow(index, { hourlyRate: e.target.value })} /></label>
              </div>
              {opens && closes && closes <= opens && <p className="text-sm text-muted-foreground">Closes next day{closes === opens ? " · 24-hour window" : ""}.</p>}
              <Button type="button" variant="ghost" size="sm" onClick={() => onHours(hours.filter((_, i) => i !== index))}>Remove window {index + 1}</Button>
            </div>;
          })}
          <Button type="button" variant="outline" onClick={() => onHours([...hours, { id: "", weekday: 1, opens: "07:00", closes: "20:00", hourlyRate: null }])}>Add window</Button>
        </fieldset>

        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="rounded-lg border bg-muted p-3 text-sm">{notice}</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || blocked || !name.trim()}>{busy ? "Saving…" : "Save"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
