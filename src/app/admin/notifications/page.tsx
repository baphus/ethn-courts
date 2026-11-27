"use client";

import { formatScheduleRange } from "@/lib/booking/schedule-label";
import { toast } from "sonner";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingRows } from "@/components/admin/loading-slots";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/admin/dashboard/section-card";
import { useSidebarActivity } from "@/components/admin/admin-shell";
import PushControls from "./push-controls";

type Notification = { id: string; title: string; body: string; link: string; createdAt: string; readAt: string | null; kind?: "proof_submitted" | "booking_confirmed" | "booking_cancelled" | "refund_recorded" | null; booking?: { customerName: string; reference: string; slots: { courtName: string; startsAt: string; endsAt: string }[]; amount: string; amountKind: "booking_total" | "refund_amount" } | null };
const eventLabels: Record<NonNullable<Notification["kind"]>, string> = { proof_submitted: "Review requested", booking_confirmed: "Booking confirmed · FYI", booking_cancelled: "Booking cancelled · FYI", refund_recorded: "Refund recorded · FYI" };
const money = (amount: string) => { const value = Number(amount); return Number.isFinite(value) ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value) : amount; };
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const safeLink = (link: string) => /^\/admin\/bookings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link);
const message = (status: number) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Owner access is unavailable or has been revoked." : status === 404 ? "This notification is no longer available." : "Service unavailable. Please try again.";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const { counts, refreshCounts } = useSidebarActivity();
  const unreadCount = counts?.unreadNotifications ?? items?.filter(item => !item.readAt).length ?? 0;

  const load = useCallback(async (unread: boolean, background = false) => {
    const current = ++sequence.current;
    if (!background) { setItems(null); setError(""); }
    try {
      const response = await fetch(`/api/ethn/admin/notifications?unreadOnly=${unread}`, { cache: "no-store" });
      if (!response.ok) throw new Error(message(response.status));
      const data: Notification[] = await response.json();
      if (sequence.current === current) { setItems(data); setError(""); }
    } catch (e) { if (sequence.current === current) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }
  }, []);
  useEffect(() => { void load(unreadOnly); return () => { sequence.current++; }; }, [load, unreadOnly]);

  useEffect(() => {
    if (busy) return;
    const refresh = () => { if (!document.hidden) void load(unreadOnly, true); };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [busy, load, unreadOnly]);

  function markReadOnOpen(id: string) {
    void fetch(`/api/ethn/admin/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH", keepalive: true }).then(response => {
      if (!response.ok) return;
      return response.json().then((result: { readAt: string }) => {
        setItems(current => current && (unreadOnly ? current.filter(item => item.id !== id) : current.map(item => item.id === id ? { ...item, readAt: result.readAt } : item)));
        return refreshCounts();
      });
    }).catch(() => {});
  }

  async function markRead(id: string) {
    sequence.current++;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/ethn/admin/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      if (response.status >= 500) throw new Error();
      if (!response.ok) { toast.error("Notification was not marked as read."); setError(message(response.status)); return; }
      const result: { id: string; readAt: string } = await response.json();
      setItems(current => current && (unreadOnly ? current.filter(item => item.id !== result.id) : current.map(item => item.id === result.id ? { ...item, readAt: result.readAt } : item)));
      toast.success("Notification marked as read.");
      void refreshCounts().catch(() => setError("Notification marked as read, but counts could not refresh."));
    } catch { toast.warning("Read status could not be confirmed."); setError("Reload the inbox to check the current read status."); }
    finally { setBusy(false); }
  }

  async function markAllRead() {
    sequence.current++;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ethn/admin/notifications/read-all", { method: "PATCH" });
      if (response.status >= 500) throw new Error();
      if (!response.ok) { toast.error("Notifications were not marked as read."); setError(message(response.status)); return; }
      toast.success("All notifications marked as read.");
      void Promise.all([refreshCounts(), load(unreadOnly, true)]).catch(() => setError("Notifications were marked as read, but the inbox could not refresh."));
    } catch { toast.warning("Read status could not be confirmed."); setError("Reload the inbox to check the current read status."); }
    finally { setBusy(false); }
  }

  return <div className="w-full space-y-6 pb-24">
    <header className="flex flex-wrap items-end justify-between gap-4"><div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Staff updates</p><h1 className="text-3xl font-semibold tracking-tight">Notifications</h1><p className="max-w-2xl text-muted-foreground">Review payment proofs and keep up with booking changes.</p></div><div className="rounded-xl border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Your unread</p><p className="text-2xl font-semibold tabular-nums" aria-live="polite">{unreadCount}</p></div></header>
    <PushControls />
    <section aria-label="Notifications" className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5"><div><h2 className="text-lg font-semibold">Inbox</h2><p className="text-sm text-muted-foreground">Latest 50 · newest first</p></div><div className="flex flex-wrap items-center gap-3"><Segmented label="Filter notifications" disabled={busy} value={unreadOnly ? "unread" : "all"} onChange={value => setUnreadOnly(value === "unread")} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} /><Button type="button" variant="outline" disabled={busy || !unreadCount} onClick={() => void markAllRead()}>Mark all read</Button></div></div>
      {error && <p role="alert" className="m-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</p>}
      {!items && !error && <LoadingRows label="Loading notifications" />}
      {items?.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground"><EmptyIcon /> {unreadOnly ? "You’re all caught up." : "No notifications yet."}</p>}
      {items && items.length > 0 && <ul className="divide-y">{items.map(item => <li key={item.id} className={`flex flex-wrap items-start justify-between gap-4 p-5 transition-colors hover:bg-muted/30 ${!item.readAt ? "border-l-2 border-l-primary bg-primary/[0.025]" : ""}`}><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3>{item.kind && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.kind === "proof_submitted" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{eventLabels[item.kind]}</span>}{!item.readAt && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Unread</span>}</div><p className="text-sm text-muted-foreground">{item.body}</p>{item.booking && <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><span><span className="font-medium text-foreground">{item.booking.customerName}</span> · {item.booking.reference}</span><span>{item.booking.slots.map(slot => `${slot.courtName}, ${formatScheduleRange(slot.startsAt, slot.endsAt)}`).join(" · ")}</span><span className="font-medium text-foreground">{item.booking.amountKind === "refund_amount" ? "Refund" : "Booking total"}: {money(item.booking.amount)}</span></div>}<p className="text-xs text-muted-foreground"><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time> · {item.readAt ? "Read" : "Unread"}</p>{safeLink(item.link) && <Link href={item.link} onClick={() => { if (!item.readAt) markReadOnOpen(item.id); }} className="inline-block text-sm font-medium text-primary underline underline-offset-4">Open booking<span className="sr-only"> for {item.title}</span></Link>}</div>{!item.readAt && <Button type="button" variant="outline" disabled={busy} onClick={() => void markRead(item.id)}>Mark read<span className="sr-only">: {item.title}</span></Button>}</li>)}</ul>}
    </section>
  </div>;
}
