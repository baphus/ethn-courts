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

test("push distinguishes lookup errors from subscription errors and reuses a current subscription", async () => {
  const source = controls.match(/export async function getOrCreateSubscription[\s\S]*?\n}/)?.[0];
  assert.ok(source);
  const subscribe = runInNewContext(`(${source.replace("export async function", "async function").replace(": PushManager", "").replace(": Uint8Array", "").replace(": PushSubscription | null", "").replace(" as BufferSource", "")})`, { Uint8Array });
  const key = Uint8Array.of(1, 2);
  const error = new Error("Error retrieving push subscription");
  await assert.rejects(subscribe({ getSubscription: async () => { throw error; }, subscribe: () => assert.fail("must not overwrite an unknown subscription") }, key), /could not look up/);
  await assert.rejects(subscribe({ getSubscription: async () => null, subscribe: async () => { throw error; } }, key), /could not create/);
  const current = { options: { applicationServerKey: key.buffer } };
  assert.equal(await subscribe({ getSubscription: async () => current }, key), current);
  const outdated = { options: { applicationServerKey: Uint8Array.of(3).buffer }, unsubscribe: async () => true };
  assert.equal(await subscribe({ getSubscription: async () => outdated, subscribe: async () => current }, key), current);
});

test("push auto-connects only with permission and respects device pause", () => {
  assert.match(controls, /permission !== "granted" \|\| paused/);
  assert.match(controls, /connect\(worker, publicKey, false\)/);
  assert.match(controls, /manual && Notification.permission === "default" \? await Notification.requestPermission\(\)/);
});
