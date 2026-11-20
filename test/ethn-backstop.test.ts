import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ethnBackstopConfig } from "../src/lib/mail/ethn-backstop";

test("backstop requires opt-in and valid sender and HTTPS origin", () => {
  assert.equal(ethnBackstopConfig({}), null);
  assert.equal(ethnBackstopConfig({ ETHN_MAIL_ENABLED: "1", ETHN_MAIL_FROM: "bad", ETHN_APP_URL: "https://example.com" }), null);
  assert.equal(ethnBackstopConfig({ ETHN_MAIL_ENABLED: "1", ETHN_MAIL_FROM: "a@example.com", ETHN_APP_URL: "http://example.com" }), null);
  assert.deepEqual(ethnBackstopConfig({ ETHN_MAIL_ENABLED: "1", ETHN_MAIL_FROM: "a@example.com", ETHN_APP_URL: "https://example.com" }), { from: "a@example.com", appUrl: "https://example.com" });
});
