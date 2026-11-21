import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const worker = readFileSync("public/ethn-push-sw.js", "utf8");
const controls = readFileSync("src/app/admin/notifications/push-controls.tsx", "utf8");

test("push worker uses generic text and validates notification links", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  let shown: any;
  let opened = "";
  const self = { location: { origin: "https://example.test" }, registration: { showNotification: async (title: string, options: any) => { shown = { title, ...options }; } }, addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; } };
  const clients = { matchAll: async () => [], openWindow: async (url: string) => { opened = url; } };
  runInNewContext(worker, { self, clients, URL });
  let pending: Promise<unknown> = Promise.resolve();
  handlers.push({ data: { json: () => ({ title: "private", body: "secret", link: "https://evil.test/" }) }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
  await pending;
  assert.equal(shown.title, "ETHN staff update");
  assert.equal(shown.body, "You have a new staff notification.");
  assert.equal(shown.data.link, "/admin/notifications");
  handlers.notificationclick({ notification: { data: { link: "//evil.test" }, close() {} }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
  await pending;
  assert.equal(opened, "https://example.test/admin/notifications");
  handlers.push({ data: { json: () => ({ link: "/admin/bookings/12345678-1234-1234-1234-123456789abc" }) }, waitUntil: (p: Promise<unknown>) => { pending = p; } });
  await pending;
  assert.equal(shown.data.link, "/admin/bookings/12345678-1234-1234-1234-123456789abc");
});

test("base64url public key decodes with padding", () => {
  const source = controls.match(/export function decodePublicKey[\s\S]*?\n}/)?.[0];
  assert.ok(source);
  const decode = runInNewContext(`(${source.replace("export function", "function").replace(": string", "").replace(": Uint8Array", "")})`, { atob, Uint8Array });
  assert.deepEqual(Array.from(decode("-_8")), [251, 255]);
});

test("permission and worker registration require explicit enable handler", () => {
  const effect = controls.slice(controls.indexOf("useEffect(() =>"), controls.indexOf("async function enable()"));
  assert.doesNotMatch(effect, /requestPermission|serviceWorker\.register/);
  assert.match(controls, /onClick=\{\(\) => void enable\(\)\}/);
  assert.match(controls, /permission === "denied"/);
});
