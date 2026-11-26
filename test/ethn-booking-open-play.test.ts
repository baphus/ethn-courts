import { test } from "node:test";
import assert from "node:assert/strict";
import { trackBooking } from "../src/lib/booking/ethn-tracking";

const credential = { code: "ABCDE", email: "guest@example.com" };
const listing = { title: "Evening Open Play", description: "Bring a paddle", eventUrl: "https://reclub.co/m/ABC123" };

test("customer Open Play writes require code, email and a direct Reclub meet link", async () => {
  const pool = { connect: () => assert.fail("Invalid input must not reach the DB") };
  for (const input of [
    { token: "a".repeat(64), listing }, { code: credential.code, listing },
    ...["https://reclub.co.evil/m/ABC123", "https://reclub.co@evil.example/m/ABC123", "https://reclub.co/", "http://reclub.co/m/ABC123"].map(eventUrl => ({ ...credential, listing: { ...listing, eventUrl } })),
  ]) await assert.rejects(trackBooking(pool as never, input, true), /INVALID_INPUT/);
});

test("customer Open Play is blocked for an ineligible booking", async () => {
  const pool = { connect: async () => ({ release() {}, query: async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM ethn.bookings")) {
      assert.deepEqual(values, [credential.code, credential.email]);
      return { rows: [{ id: "booking", status: "confirmed" }] };
    }
    if (/^(BEGIN|ROLLBACK|SELECT 1)/.test(sql)) return { rows: [] };
    assert.fail(`Unexpected query: ${sql}`);
  } }) };
  await assert.rejects(trackBooking(pool as never, { ...credential, listing }, true), /OPEN_PLAY_NOT_EDITABLE/);
});
