import { test } from "node:test";
import assert from "node:assert/strict";
import { hasValidOrigin } from "../src/lib/request-origin";

test("origin guard preserves same-origin and missing-origin policy", () => {
  const check = (origin: string | undefined, host: string, extra: Record<string, string> = {}) => hasValidOrigin(new Request("http://localhost:41983/api", { headers: { host, ...extra, ...(origin ? { origin } : {}) } }));
  assert.equal(check("http://127.0.0.1:41983", "127.0.0.1:41983"), true);
  assert.equal(check("http://localhost:41983", "localhost:41983"), true);
  assert.equal(check("http://localhost:41983", "127.0.0.1:41983"), false);
  assert.equal(check("http://evil.test", "127.0.0.1:41983", { "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" }), false);
  assert.equal(check(undefined, "127.0.0.1:41983"), true);
  assert.equal(hasValidOrigin(new Request("https://app.example/api", { headers: { host: "app.example", origin: "https://evil.test", "x-forwarded-host": "evil.test" } })), false);
  assert.equal(hasValidOrigin(new Request("https://app.example/api", { headers: { host: "app.example", origin: "https://app.example" } })), true);
  assert.equal(hasValidOrigin(new Request("http://localhost:41983/api", { headers: { origin: "http://localhost:41983" } })), true);
});
