import { test } from "node:test";
import assert from "node:assert/strict";
import { runEthnMailBestEffort } from "../src/lib/mail/ethn-hook";

const bookingId = "12345678-1234-4234-8234-123456789abc";
const env = { ETHN_MAIL_ENABLED: "1", ETHN_MAIL_FROM: "mail@example.com", ETHN_APP_URL: "https://ethn.example" };

test("mail hook is opt-in, validates before dependencies, scopes and swallows failures", async () => {
  const calls: string[] = [];
  const deps = {
    pool: () => { calls.push("pool"); return {} as never; },
    transport: () => { calls.push("transport"); return {} as never; },
    drain: async (_pool: never, _transport: never, config: { bookingId: string }) => { calls.push(config.bookingId); throw new Error("private details"); },
  } as unknown as Parameters<typeof runEthnMailBestEffort>[2];
  const oldError = console.error;
  const errors: unknown[] = [];
  console.error = (...args) => { errors.push(args); };
  try {
    await runEthnMailBestEffort(bookingId, {}, deps);
    await runEthnMailBestEffort(bookingId, { ...env, NODE_ENV: "development", ETHN_APP_URL: "http://bad.example" }, deps);
    await runEthnMailBestEffort(bookingId, { ...env, NODE_ENV: "production", ETHN_APP_URL: "http://localhost:3000" }, deps);
    assert.deepEqual(calls, []);
    await runEthnMailBestEffort(bookingId, env, deps);
    await runEthnMailBestEffort(bookingId, { ...env, NODE_ENV: "development", ETHN_APP_URL: "http://localhost:3000" }, deps);
    assert.deepEqual(calls, ["pool", "transport", bookingId, "pool", "transport", bookingId]);
    const failSetup = () => { throw new Error("private configuration details"); };
    await runEthnMailBestEffort(bookingId, env, { ...deps, pool: failSetup });
    await runEthnMailBestEffort(bookingId, env, { ...deps, transport: failSetup });
    assert.deepEqual(errors, [
      ["ETHN mail delivery unavailable", "config"],
      ["ETHN mail delivery unavailable", "config"],
      ["ETHN mail delivery unavailable", "worker"],
      ["ETHN mail delivery unavailable", "worker"],
      ["ETHN mail delivery unavailable", "database setup"],
      ["ETHN mail delivery unavailable", "transport setup"],
    ]);
  } finally { console.error = oldError; }
});
