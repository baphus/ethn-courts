import { test } from "node:test";
import assert from "node:assert/strict";
import { drainEthnOutbox } from "../src/lib/mail/ethn-worker";
import { trackBooking } from "../src/lib/booking/ethn-tracking";

const bookingId = "123e4567-e89b-42d3-a456-426614174001";
test("decision mail validates kinds and optional token without breaking submission", async () => {
  const base = { email: "guest@example.com", name: "Guest", code: "ABCDE", total: "100.00" };
  const rows = [
    { id: "1", kind: "booking_submission", payload: { ...base, trackingToken: "a".repeat(64) }, attempts: 0 },
    { id: "2", kind: "booking_approved", payload: base, attempts: 0 },
    { id: "3", kind: "booking_rejected", payload: { ...base, reason: "Please resubmit" }, attempts: 0 },
    { id: "4", kind: "booking_rejected", payload: { ...base, reason: "", trackingToken: "bad" }, attempts: 0 },
  ];
  const statuses: unknown[] = [], messages: { subject: string; text: string }[] = [];
  const pool = { connect: async () => ({ query: async (sql: string, args?: unknown[]) => {
    if (sql.includes("SELECT id, kind")) return { rows };
    if (sql.includes("SET status = $3")) statuses.push(args?.[2]);
    return { rows: [] };
  }, release() {} }) };
  await drainEthnOutbox(pool as never, { sendMail: async m => { messages.push(m); } }, { bookingId, from: "mail@example.com", appUrl: "https://example.com" });
  assert.deepEqual(statuses, ["sent", "sent", "sent", "dead"]);
  assert.match(messages[0].text, /pending review/);
  assert.match(messages[1].text, /confirmed and fully paid/);
  assert.match(messages[1].text, /code and email/);
  assert.doesNotMatch(messages[1].text, /\/track\//);
  assert.match(messages[2].text, /not booked[\s\S]*Please resubmit/);
});

test("tracking exposes rejection reason only for rejected payment and booking", async () => {
  for (const [bookingStatus, paymentStatus, visible] of [["rejected", "rejected", true], ["pending", "rejected", false], ["rejected", "unverified", false]] as const) {
    const pool = { connect: async () => ({ query: async (sql: string) => ({ rows: sql.includes("FROM ethn.bookings") ? [{ id: "id", operating_date: "2026-01-01", status: bookingStatus, total: "100.00" }] : sql.includes("booking_items") ? [] : [{ method: "gcash", status: paymentStatus, claimed_amount: "100.00", review_reason: "Resubmit", private_detail: "secret" }] }), release() {} }) };
    const result = await trackBooking(pool as never, { token: "a".repeat(64) });
    assert.equal("reviewReason" in result!.payments[0], visible);
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});
