import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { submitBooking } from "../src/lib/booking/submission";

const input = { ownerToken: "123e4567-e89b-42d3-a456-426614174000", checkoutId: "123e4567-e89b-42d3-a456-426614174001", reservationId: "123e4567-e89b-42d3-a456-426614174002", idempotencyKey: "key", customer: { name: "Guest", email: "guest@example.com", phone: "123" }, reference: " reference ", claimedAmount: "100.00" };

test("submission rejects malformed input before acquiring connection", async () => {
  const pool = { connect: async () => { throw new Error("unexpected connection"); } } as unknown as Pick<Pool, "connect">;
  await assert.rejects(submitBooking(pool, { inspect: async () => ({ bytes: 1, mimeType: "image/png" }) }, { ...input, customer: { ...input.customer, phone: " " } }), /INVALID_INPUT/);
  await assert.rejects(submitBooking(pool, { inspect: async () => ({ bytes: 1, mimeType: "image/png" }) }, { ...input, claimedAmount: "0.00" }), /INVALID_INPUT/);
  for (const value of [{ ...input, customer: { ...input.customer, email: "invalid" } }, { ...input, customer: { ...input.customer, name: "x".repeat(201) } }, { ...input, reference: "x".repeat(201) }]) await assert.rejects(submitBooking(pool, { inspect: async () => ({ bytes: 1, mimeType: "image/png" }) }, value), /INVALID_INPUT/);
});

test("metadata mismatch never opens transaction", async () => {
  const calls: string[] = [];
  const pool = { connect: async () => ({ release() {}, async query(sql: string) { calls.push(sql); return { rows: sql.includes("proof_reservations") ? [{ state: "reserved", object_path: `incoming/${"a".repeat(64)}.png`, mime_type: "image/png", byte_size: "123" }] : [] }; } }) } as unknown as Pick<Pool, "connect">;
  await assert.rejects(submitBooking(pool, { inspect: async () => ({ bytes: 124, mimeType: "image/png" }) }, input), /PROOF_METADATA_MISMATCH/);
  assert(!calls.includes("BEGIN"));
});
