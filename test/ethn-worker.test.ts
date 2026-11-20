import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { drainEthnOutbox } from "../src/lib/mail/ethn-worker";

const bookingId = "123e4567-e89b-42d3-a456-426614174001";
const pool = { connect: async () => { throw new Error("unexpected connection"); } } as unknown as Pick<Pool, "connect">;
const transport = { sendMail: async () => {} };

test("worker rejects unsafe configuration before connecting", async () => {
  for (const config of [
    { from: "bad", appUrl: "https://example.com", bookingId },
    { from: "mail@example.com", appUrl: "http://example.com", bookingId, allowLocalHttp: true },
    { from: "mail@example.com", appUrl: "https://example.com/path", bookingId },
    { from: "mail@example.com", appUrl: "https://user@example.com", bookingId },
    { from: "mail@example.com", appUrl: "https://example.com?x=1", bookingId },
    { from: "mail@example.com", appUrl: "https://example.com", bookingId: "" },
  ]) await assert.rejects(drainEthnOutbox(pool, transport, config), /INVALID_OUTBOX_CONFIG/);
});
