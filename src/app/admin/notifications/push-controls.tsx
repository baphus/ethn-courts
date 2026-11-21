"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const storageKey = "ethn-push-subscription-id";

export function decodePublicKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), char => char.charCodeAt(0));
}

export default function PushControls() {
  const [config, setConfig] = useState<{ configured: boolean; publicKey: string | null } | null>(null);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const available = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    if (available) setPermission(Notification.permission);
    fetch("/api/ethn/admin/push", { cache: "no-store" }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(setConfig).catch(() => setStatus("Push settings are unavailable. Your inbox still works."));
  }, []);

  async function enable() {
    if (!supported || !config?.configured || !config.publicKey || permission === "denied") return;
    setBusy(true); setStatus("");
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") { setStatus("Browser notifications were not enabled. Your inbox still works."); return; }
      await navigator.serviceWorker.register("/ethn-push-sw.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodePublicKey(config.publicKey) as BufferSource });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Browser subscription is incomplete. Please try again.");
      const response = await fetch("/api/ethn/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }) });
      if (response.status === 409) throw new Error("This browser is linked to another account. Sign in to that account and disable push there first.");
      if (!response.ok) throw new Error("Could not enable push. Please try again.");
      const data: { subscriptionId: string } = await response.json();
      localStorage.setItem(storageKey, data.subscriptionId);
      setStatus("Push enabled for this browser. If notifications stop, enable push again.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not enable push. Please try again."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setStatus("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/ethn-push-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription && !(await subscription.unsubscribe())) throw new Error("Could not disable browser push. Please try again.");
      const subscriptionId = localStorage.getItem(storageKey);
      if (subscriptionId) {
        try {
          const response = await fetch("/api/ethn/admin/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId }) });
          if (!response.ok) throw new Error();
          localStorage.removeItem(storageKey);
        } catch { setStatus("Browser push is disabled, but its server binding could not be removed. Sign in to the account that enabled it and try again."); return; }
      }
      setStatus("Push disabled for this browser. Your inbox still works.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not disable push. Please try again."); }
    finally { setBusy(false); }
  }

  return <section aria-label="Browser push notifications" className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
    <div><h2 className="text-sm font-semibold">Browser push</h2><p className="text-sm text-muted-foreground">Optional alerts · Your inbox works without push.</p></div>
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Push settings</DialogTrigger>
      <DialogContent>
        <DialogTitle className="font-sans">Browser push</DialogTitle>
        <DialogDescription>Optional alerts on this browser. Your staff inbox works whether push is on or off.</DialogDescription>
      <div className="space-y-2">
        {!supported && <p className="text-sm text-muted-foreground">Push requires a supported browser and a secure connection.</p>}
        {supported && permission === "denied" && <p className="text-sm text-muted-foreground">Notifications are blocked in your browser settings. Your inbox still works.</p>}
        {supported && config && !config.configured && <p className="text-sm text-muted-foreground">Push is not configured yet.</p>}
      </div>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void enable()} disabled={busy || !supported || !config?.configured || !config.publicKey || permission === "denied"}>Enable push</Button><Button type="button" variant="outline" onClick={() => void disable()} disabled={busy || !supported}>Disable push</Button></div>
    {status && <p role="status" className="text-sm">{status}</p>}
      </DialogContent>
    </Dialog>
  </section>;
}
