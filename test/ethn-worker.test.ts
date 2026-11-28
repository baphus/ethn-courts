import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { drainEthnOutbox } from "../src/lib/mail/ethn-worker";

const bookingId = "123e4567-e89b-42d3-a456-426614174001";
const pool = { connect: async () => { throw new Error("unexpected connection"); } } as unknown as Pick<Pool, "connect">;
const transport = { sendMail: async () => {} };

test("proof alerts email only still-enabled owners, without private booking details", async () => {
  const ownerId = "123e4567-e89b-42d3-a456-426614174002";
  for (const enabled of [true, false]) {
    let status: unknown, lookups = 0;
    const messages: Parameters<Parameters<typeof drainEthnOutbox>[1]["sendMail"]>[0][] = [];
    const query = async (sql: string, args?: unknown[]) => {
      if (sql.includes("SELECT id, kind")) return { rows: [{ id: bookingId, kind: "booking_owner_proof_submitted", payload: { ownerId, email: "customer@example.test", trackingToken: "private-link" }, attempts: 0 }] };
      if (sql.includes("FROM ethn.staff_access")) {
        assert.deepEqual(args, [ownerId]);
        return { rows: enabled ? [{ ok: true }] : [] };
      }
      if (sql.includes("SET status = $3")) status = args?.[2];
      return { rows: [] };
    };
    await drainEthnOutbox({ query, connect: async () => ({ query, release() {} }) } as never, { sendMail: async message => messages.push(message) }, {
      from: "mail@example.test", appUrl: "https://example.com", bookingId,
      ownerEmail: async id => { lookups++; assert.equal(id, ownerId); return "owner@example.test"; },
    });
    assert.equal(status, enabled ? "sent" : "dead");
    assert.equal(lookups, Number(enabled));
    assert.deepEqual(messages.map(message => message.to), enabled ? ["owner@example.test"] : []);
    if (enabled) {
      assert.ok(messages[0].text.includes(`https://example.com/admin/bookings/${bookingId}`));
      assert.doesNotMatch(messages[0].text + messages[0].html, /customer@example\.test|private-link/);
    }
  }
});

test("worker rejects unsafe configuration before connecting", async () => {
  for (const config of [
    { from: "bad", appUrl: "https://example.com", bookingId },
    { from: "mail@example.com", appUrl: "http://example.com", bookingId, allowLocalHttp: true },
    { from: "mail@example.com", appUrl: "https://example.com/path", bookingId },
    { from: "mail@example.com", appUrl: "https://user@example.com", bookingId },
    { from: "mail@example.com", appUrl: "https://example.com?x=1", bookingId },
    { from: "mail@example.com", appUrl: "https://example.com", bookingId: "" },
  ]) await assert.rejects(drainEthnOutbox({ ...pool, query: (() => { throw new Error("unexpected query"); }) as never }, transport, config), /INVALID_OUTBOX_CONFIG/);
});

test("worker identifies invoice failure without exposing database error details", async () => {
  const query = async (sql: string) => {
    if (sql.includes("SELECT id, kind")) return { rows: [{ id: bookingId, kind: "booking_submission", attempts: 0 }] };
    if (sql.includes("payment_methods_snapshot")) throw new Error("private database details");
    return { rows: [] };
  };
  const db = { query, connect: async () => ({ query, release() {} }) };
  await assert.rejects(drainEthnOutbox(db as never, transport, { from: "mail@example.com", appUrl: "https://example.com", bookingId }),
    { message: "OUTBOX_UNAVAILABLE: invoice lookup" });
});
