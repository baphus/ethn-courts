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
    { id: "5", kind: "booking_cancelled", payload: { email: base.email, staff: true, total: base.total, reason: "private note" }, attempts: 0 },
    { id: "6", kind: "booking_refunded", payload: { ...base, trackingToken: "a".repeat(64), reference: "private reference" }, attempts: 0 },
    { id: "7", kind: "booking_approved", payload: { email: base.email, staff: true, total: base.total }, attempts: 0 },
    { id: "8", kind: "booking_approved", payload: { ...base, email: "one,two@example.com" }, attempts: 0 },
  ];
  const statuses: unknown[] = [], messages: { subject: string; text: string; html?: string }[] = [];
  const pool = { connect: async () => ({ query: async (sql: string, args?: unknown[]) => {
    if (sql.includes("SELECT id, kind")) return { rows };
    if (sql.includes("AS booking_date")) return { rows: [{ court: "Court <1>", starts_at: new Date("2026-01-01T12:00:00Z"), ends_at: new Date("2026-01-01T17:00:00Z"), booking_date: "2026-01-01", duration_minutes: 300, interval_minutes: 30, hourly_rate: "20.00", amount: "100.00", method_name: "GCash" }] };
    if (sql.includes("FROM ethn.booking_items")) return { rows: [{ court: "Court 1", starts_at: new Date("2026-01-01T12:00:00Z"), ends_at: new Date("2026-01-01T17:00:00Z") }] };
    if (sql.includes("SET status = $3")) statuses.push(args?.[2]);
    return { rows: [] };
  }, release() {} }) };
  await drainEthnOutbox(pool as never, { sendMail: async m => { messages.push(m); } }, { bookingId, from: "mail@example.com", appUrl: "https://example.com" });
  assert.deepEqual(statuses, ["sent", "sent", "sent", "dead", "sent", "sent", "sent", "dead"]);
  assert.deepEqual(messages.map(m => m.subject), ["Payment proof received", "Booking confirmed", "Booking not confirmed", "Booking cancelled", "Booking refund recorded", "Booking confirmed"].map(title => `${title} | ETHN Courts`));
  for (const [index, message] of messages.entries()) {
    if (index === 1 || index === 5) {
      assert.match(message.text, /Booking invoice\nBooking date: January 1, 2026/);
      assert.match(message.text, /8:00\s*PM.*January 2, 2026.*1:00\s*AM.*10 \u00d7 30-min slots.*\u20b120\.00\/hr.*\u20b1100\.00/i);
      assert.match(message.text, /Payment method: GCash/);
      assert.match(message.html!, /Court &lt;1&gt;/);
      assert.doesNotMatch(message.text, /Manila|Operating date/);
    } else {
      assert.match(message.text, /Court schedule:\nCourt 1:.*8:00 PM.*Jan 2, 2026, 1:00 AM/);
      assert.equal(message.html, undefined);
    }
    assert.match(message.text, /ETHN Courts\n.*Balamban, Cebu.*\n[\s\S]*Contact ETHN Courts: https:\/\/example\.com\/contact/);
    assert.equal(message.text.includes("Directions:"), index === 1 || index === 5);
  }
  assert.match(messages[0].text, /^.*pending review.*not confirmed yet/);
  assert.match(messages[1].text, /Total paid: \u20b1100\.00/);
  assert.match(messages[1].text, /code and email: https:\/\/example\.com\/track\n/);
  assert.match(messages[2].text, /not booked[\s\S]*Please resubmit/);
  assert.match(messages[3].text, /No refund was recorded/);
  assert.match(messages[4].text, /outside the booking website[\s\S]*Refund recorded: PHP 100.00[\s\S]*\/checkout\/track\/a{64}/);
  assert.doesNotMatch(messages.map(m => m.text).join("\n"), /private note|private reference/);
  for (const index of [3, 5]) assert.doesNotMatch(messages[index].text, /Track|Booking code/);
});

test("tracking exposes rejection reason only for rejected payment and booking", async () => {
  for (const [bookingStatus, paymentStatus, visible] of [["rejected", "rejected", true], ["pending", "rejected", false], ["rejected", "unverified", false]] as const) {
    const pool = { connect: async () => ({ query: async (sql: string) => ({ rows: sql.includes("FROM ethn.bookings") ? [{ id: "id", operating_date: "2026-01-01", status: bookingStatus, total: "100.00" }] : sql.includes("booking_items") ? [] : [{ method: "gcash", status: paymentStatus, claimed_amount: "100.00", review_reason: "Resubmit", private_detail: "secret" }] }), release() {} }) };
    const result = await trackBooking(pool as never, { token: "a".repeat(64) });
    assert.equal("reviewReason" in result!.payments[0], visible);
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});
