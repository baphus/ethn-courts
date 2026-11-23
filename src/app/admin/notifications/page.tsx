"use client";

import { EmptyIcon } from "@/components/ui/empty-icon";

import { LoadingAnimation } from "@/components/ui/loading-animation";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import PushControls from "./push-controls";

type Notification = { id: string; title: string; body: string; link: string; createdAt: string; readAt: string | null };
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const safeLink = (link: string) => /^\/admin\/bookings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(link);
const message = (status: number) => status === 401 ? "Your session has expired. Sign in again." : status === 403 ? "Staff access is unavailable or has been revoked." : status === 404 ? "This notification is no longer available." : "Service unavailable. Please try again.";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);

  const load = useCallback(async (unread: boolean) => {
    const current = ++sequence.current;
    setItems(null); setError("");
    try {
      const response = await fetch(`/api/ethn/admin/notifications?unreadOnly=${unread}`, { cache: "no-store" });
      if (!response.ok) throw new Error(message(response.status));
      const data: Notification[] = await response.json();
      if (sequence.current === current) setItems(data);
      return true;
    } catch (e) { if (sequence.current === current) setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); return false; }
  }, []);
  useEffect(() => { void load(unreadOnly); return () => { sequence.current++; }; }, [load, unreadOnly]);

  async function refresh() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ethn/admin/notifications/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error(message(response.status));
      if (await load(unreadOnly)) setNotice("Inbox refreshed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }
    finally { setBusy(false); }
  }
  async function markRead(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/ethn/admin/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      if (!response.ok) throw new Error(message(response.status));
      const result: { id: string; readAt: string } = await response.json();
      setItems(current => current && (unreadOnly ? current.filter(item => item.id !== result.id) : current.map(item => item.id === result.id ? { ...item, readAt: result.readAt } : item)));
    } catch (e) { setError(e instanceof Error ? e.message : "Service unavailable. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto w-full max-w-5xl space-y-6 pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2"><p className="text-sm font-medium text-muted-foreground">STAFF INBOX</p><h1 className="text-3xl font-semibold tracking-tight">Notifications</h1><p className="max-w-2xl text-muted-foreground">Review updates for your staff account. Refresh to check for new activity. This inbox works without browser push.</p></div>
      <Button type="button" onClick={() => void refresh()} disabled={busy}>{busy ? "Working…" : "Refresh inbox"}</Button>
    </header>
    <PushControls />
    <section aria-label="Notifications" className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="text-lg font-semibold">Your inbox</h2><p className="text-sm text-muted-foreground">Most recent 50 notifications</p></div><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} disabled={busy} onChange={event => setUnreadOnly(event.target.checked)} className="h-4 w-4 accent-primary" /> Unread only</label></div>
      {error && <p role="alert" className="m-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</p>}
      {notice && !error && <p role="status" className="mx-5 mt-5 text-sm text-muted-foreground">{notice}</p>}
      {!items && !error && <LoadingAnimation label="Loading notifications" className="p-5" />}
      {items?.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground"><EmptyIcon /> {unreadOnly ? "No unread notifications." : "No notifications yet. Refresh to check for activity."}</p>}
      {items && items.length > 0 && <ul className="divide-y">{items.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 p-5"><div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3>{!item.readAt && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Unread</span>}</div><p className="text-sm text-muted-foreground">{item.body}</p><p className="text-xs text-muted-foreground"><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time> · {item.readAt ? "Read" : "Unread"}</p>{safeLink(item.link) && <Link href={item.link} className="inline-block pt-1 text-sm font-medium underline underline-offset-4">View details<span className="sr-only"> for {item.title}</span></Link>}</div>{!item.readAt && <Button type="button" variant="outline" disabled={busy} onClick={() => void markRead(item.id)}>Mark as read<span className="sr-only">: {item.title}</span></Button>}</li>)}</ul>}
    </section>
  </div>;
}
