"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const storageKey = "ethn-push-subscription-id";
const pausedKey = "ethn-push-paused";
const workerPath = "/ethn-push-sw.js";

export function decodePublicKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), char => char.charCodeAt(0));
}

export async function getOrCreateSubscription(manager: PushManager, key: Uint8Array) {
  let current: PushSubscription | null;
  try { current = await manager.getSubscription(); }
  catch { throw new Error("Browser could not look up its push subscription. Reload and try again. Your inbox still works."); }
  const existingKey = current?.options.applicationServerKey;
  if (current && existingKey && !new Uint8Array(existingKey).every((byte, i, bytes) => bytes.length === key.length && byte === key[i])) {
    if (!(await current.unsubscribe())) throw new Error("Browser could not replace an outdated push subscription. Your inbox still works.");
    current = null;
  }
  if (current) return current;
  try { return await manager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }); }
  catch { throw new Error("Browser could not create a push subscription. Check site permissions and try again. Your inbox still works."); }
}

export default function PushControls() {
  const [config, setConfig] = useState<{ configured: boolean; publicKey: string | null } | null>(null);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [worker, setWorker] = useState<ServiceWorkerRegistration | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("");
  const autoAttempted = useRef(false);

  useEffect(() => {
    const available = window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    if (!available) return;
    setPermission(Notification.permission);
    setPaused(localStorage.getItem(pausedKey) === "1");
    const controller = new AbortController();
    fetch("/api/ethn/admin/push", { cache: "no-store", signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(setConfig).catch(() => { if (!controller.signal.aborted) setStatus("Push settings are unavailable. Your inbox still works."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!config?.configured || permission === "denied") return;
    let active = true;
    const timeout = window.setTimeout(() => { if (active) setStatus("Browser push worker is taking too long to start. Reload and try again."); }, 10_000);
    navigator.serviceWorker.register(workerPath).then(() => navigator.serviceWorker.ready).then(registration => {
      if (!active) return;
      if (registration.active?.scriptURL !== new URL(workerPath, location.origin).href) throw new Error();
      setStatus(""); setWorker(registration);
    }).catch(() => { if (active) setStatus("Browser push worker could not start. Reload and try again. Your inbox still works."); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); };
  }, [config, permission === "denied"]);

  const publicKey = config?.publicKey;
  useEffect(() => {
    if (!worker || !publicKey || permission !== "granted" || paused || autoAttempted.current) return;
    autoAttempted.current = true;
    void connect(worker, publicKey, false);
  }, [worker, publicKey, permission, paused]);

  async function connect(registration: ServiceWorkerRegistration, key: string, manual: boolean) {
    setBusy(true); setStatus("");
    try {
      const result = manual && Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setPermission(result);
      if (result !== "granted") return;
      const json = (await getOrCreateSubscription(registration.pushManager, decodePublicKey(key))).toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Browser returned an incomplete push subscription. Your inbox still works.");
      const response = await fetch("/api/ethn/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }) });
      if (response.status === 409) throw new Error("This browser is linked to another account. Sign in to that account and turn off browser alerts first.");
      if (!response.ok) throw new Error("ETHN could not save this browser subscription. Try again. Your inbox still works.");
      const data: { subscriptionId: string } = await response.json();
      localStorage.setItem(storageKey, data.subscriptionId);
      localStorage.removeItem(pausedKey);
      setPaused(false); setConnected(true);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Browser push could not connect. Your inbox still works."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setStatus("");
    try {
      localStorage.setItem(pausedKey, "1");
      setPaused(true);
      const id = localStorage.getItem(storageKey);
      if (id) {
        const response = await fetch("/api/ethn/admin/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId: id }) });
        if (!response.ok) throw new Error();
        localStorage.removeItem(storageKey);
      }
      setConnected(false);
    } catch { setStatus("Could not turn off server delivery. Try turning it off again, or block notifications in browser settings."); }
    finally { setBusy(false); }
  }

  const label = !supported ? "Unavailable in this browser" : permission === "denied" ? "Blocked by browser" : connected ? "On for this browser" : paused ? "Off for this browser" : config?.configured === false ? "Not configured" : permission === "default" ? "Permission needed" : "Not connected";
  return <Dialog>
    <DialogTrigger render={<Button variant="outline" size="sm" />}>Browser alerts</DialogTrigger>
    <DialogContent>
      <DialogTitle className="font-sans">Browser alerts</DialogTitle>
      <DialogDescription>Get alerts when a booking needs review. Your inbox works even without browser alerts.</DialogDescription>
      <p className="text-sm font-medium">{label}</p>
      {permission === "denied" && <p className="text-sm text-muted-foreground">To allow alerts, change permissions in your browser’s site settings and reload this page.</p>}
      {status && <p role="status" className="text-sm">{status}</p>}
      {worker && publicKey && !connected && permission !== "denied" && <Button type="button" disabled={busy} onClick={() => { autoAttempted.current = true; void connect(worker, publicKey, true); }}>{permission === "default" ? "Allow browser alerts" : paused ? "Resume browser alerts" : "Retry browser alerts"}</Button>}
      {connected && <Button type="button" variant="outline" disabled={busy} onClick={() => void disable()}>Turn off browser alerts</Button>}
    </DialogContent>
  </Dialog>;
}
