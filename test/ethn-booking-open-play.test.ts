import { test } from "node:test";
import assert from "node:assert/strict";
import { trackBooking } from "../src/lib/booking/ethn-tracking";

const credential = { code: "ABCDE", email: "guest@example.com" };
const listing = { title: "Evening Open Play", description: "Bring a paddle", eventUrl: "https://reclub.co/m/ABC123" };

test("customer Open Play writes require code and email and reject links outside Reclub", async () => {
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
    if (/^(BEGIN|ROLLBACK|SELECT 1|SELECT user_id)/.test(sql)) return { rows: [] };
    assert.fail(`Unexpected query: ${sql}`);
  } }) };
  await assert.rejects(trackBooking(pool as never, { ...credential, listing }, true), /OPEN_PLAY_NOT_EDITABLE/);
});

test("a first listing can omit Reclub and notifies both sides only once", async () => {
  let exists = false;
  const kinds: unknown[] = [];
  const pool = { connect: async () => ({ release() {}, query: async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM ethn.staff_access")) return { rows: [{ user_id: "owner" }] };
    if (sql.includes("FROM ethn.bookings")) return { rows: [{ id: "booking", status: "confirmed", guest_email: credential.email, tracking_code: credential.code, total: "100.00" }] };
    if (sql.startsWith("SELECT 1")) return { rows: [{}] };
    if (sql.startsWith("INSERT INTO ethn.booking_open_plays")) {
      assert.equal(values?.[3], "");
      if (!exists) { exists = true; return { rows: [{}] }; }
    }
    if (sql.includes("INSERT INTO ethn.notifications")) kinds.push(values?.[4]);
    if (sql.startsWith("INSERT INTO ethn.email_outbox")) {
      assert.match(sql, /'open_play_added'/);
      assert.equal(JSON.parse(String(values?.[1])).email, credential.email);
      kinds.push("customer");
    }
    return { rows: [] };
  } }) };
  const input = { ...credential, listing: { title: listing.title, description: listing.description } };
  await trackBooking(pool as never, input, true);
  await trackBooking(pool as never, input, true);
  await trackBooking(pool as never, { ...credential, listing: null }, true);
  await trackBooking(pool as never, input, true);
  assert.deepEqual(kinds, ["open_play_added", "customer"]);
});
