import { test } from "node:test";
import assert from "node:assert/strict";
import { drainEthnOutbox } from "../src/lib/mail/ethn-worker";
import { trackBooking } from "../src/lib/booking/ethn-tracking";
import { VENUE_MAP_LINK } from "../src/lib/venue";

const bookingId = "123e4567-e89b-42d3-a456-426614174001";
test("decision mail validates kinds and optional token without breaking submission", async () => {
  const base = { email: "guest@example.com", name: "Guest", code: "ABCDE", total: "100.02" };
  const token = "a".repeat(64);
  const items = [
    { court: "Court <1>", starts_at: new Date("2026-01-01T12:00:00Z"), ends_at: new Date("2026-01-01T17:00:00Z"), duration_minutes: 300, interval_minutes: 30, hourly_rate: "20.00", amount: "100.00" },
    { court: "Court 2", starts_at: new Date("2026-01-01T18:00:00Z"), ends_at: new Date("2026-01-01T19:30:00Z"), duration_minutes: 90, interval_minutes: 30, hourly_rate: "0.01", amount: "0.02" },
  ];
  const rows = [
    { id: "1", kind: "open_play_submitted", payload: { ...base, trackingToken: "a".repeat(64) }, attempts: 0 },
    { id: "2", kind: "booking_approved", payload: base, attempts: 0 },
    { id: "3", kind: "booking_rejected", payload: { ...base, reason: "Receipt <unclear> & cropped.\nPlease resubmit." }, attempts: 0 },
    { id: "4", kind: "booking_rejected", payload: { ...base, reason: "", trackingToken: "bad" }, attempts: 0 },
    { id: "5", kind: "booking_cancelled", payload: { email: base.email, staff: true, total: base.total, reason: "private note" }, attempts: 0 },
    { id: "6", kind: "booking_refunded", payload: { ...base, trackingToken: "a".repeat(64), reference: "private reference" }, attempts: 0 },
    { id: "7", kind: "booking_approved", payload: { email: base.email, staff: true, total: base.total, trackingToken: token }, attempts: 0 },
    { id: "8", kind: "booking_approved", payload: { ...base, email: "one,two@example.com" }, attempts: 0 },
    { id: "9", kind: "booking_approved", payload: { ...base, trackingToken: token, openPlayPublished: true }, attempts: 0 },
    { id: "10", kind: "booking_submission", payload: { ...base, trackingToken: token }, attempts: 0 },
  ];
  const statuses: unknown[] = [], messages: Parameters<Parameters<typeof drainEthnOutbox>[1]["sendMail"]>[0][] = [];
  let released = false;
  const query = async (sql: string, args?: unknown[]) => {
    if (sql.includes("SELECT id, kind")) return { rows };
    if (sql.includes("AS booking_date")) return { rows: items.map(item => ({ ...item, booking_date: "2026-01-01", method_name: "GCash" })) };
    if (sql.includes("FROM ethn.booking_items")) return { rows: items };
    if (sql.includes("SET status = $3")) statuses.push(args?.[2]);
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release() { released = true; } }) };
  await drainEthnOutbox(pool as never, { sendMail: async m => { assert.equal(released, true); messages.push(m); } }, { bookingId, from: "mail@example.com", appUrl: "https://example.com" });
  assert.match(messages[6].text, /View public Open Plays: https:\/\/example\.com\/open-plays/);
  assert.doesNotMatch(messages[1].text, /View public Open Plays/);
  assert.deepEqual(statuses, ["sent", "sent", "sent", "dead", "sent", "sent", "sent", "dead", "sent", "sent"]);
  assert.deepEqual(messages.map(m => m.subject), ["Booking submitted!", "You’re booked at ETHN Courts", "Your booking wasn’t confirmed — ETHN Courts", "Booking cancelled — ETHN Courts", "Refund recorded — ETHN Courts", "You’re booked at ETHN Courts", "You’re booked at ETHN Courts", "Booking submitted!"]);
  const actions = [
    `/checkout/track/${token}`, "/track", "/contact", "/contact", `/checkout/track/${token}`,
  ].map(path => `https://example.com${path}`).concat(`https://example.com/checkout/track/${token}`, `https://example.com/checkout/track/${token}`, `https://example.com/checkout/track/${token}`);
  const actionLabels = ["Track booking", "Track with your code and email", "Contact ETHN Courts", "Contact ETHN Courts", "View booking", "View booking", "View booking", "Track booking"];
  for (const [index, message] of messages.entries()) {
    assert.match(message.html!, /<!doctype html>[\s\S]*mso-hide:all/);
    assert.equal(message.html!.match(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/)?.slice(1).join(" "), `${actions[index].replaceAll("&", "&amp;")} ${actionLabels[index]}`);
    assert.ok(message.text.includes(`${actionLabels[index]}: ${actions[index]}`));
    assert.ok(message.html!.includes('href="https://example.com/contact"'));
    const approved = [1, 5, 6].includes(index);
    const submitted = [0, 7].includes(index);
    const qr = submitted || index === 5 || index === 6;
    if (submitted) {
      assert.match(message.html, /<h1[^>]*>Booking submitted!<\/h1>/);
      assert.match(message.text, /We’ll review your payment before confirming your booking\./);
      assert.match(message.text, /Booking total: ₱100\.02/);
      assert.doesNotMatch(message.text, /Total paid/);
    }
    assert.deepEqual(message.attachments.map(a => a.cid), qr ? ["ethn-logo@ethn-courts", "booking-tracking@ethn-courts"] : ["ethn-logo@ethn-courts"]);
    for (const image of message.attachments) {
      assert.ok(message.html.includes(`src="cid:${image.cid}"`));
      assert.equal(image.content.subarray(1, 4).toString(), "PNG");
    }
    if (qr) assert.match(message.html, /not for check-in/);
    if (approved || submitted) {
      assert.ok(message.text.includes(`${approved ? "Booking invoice" : "Booking breakdown"}\nBooking date: January 1, 2026`));
      assert.match(message.text, /8PM–1AM \(\+1 day\)\n10 × 30-min slots · ₱10\.00\/slot · Subtotal: ₱100\.00/i);
      assert.match(message.text, /3 × 30-min slots · approx\. ₱0\.01\/slot · Subtotal: ₱0\.02/);
      assert.match(message.text, /Total slots: 13\n\nPayment\nPayment method: GCash/);
      assert.match(message.html, /Court &lt;1&gt;/);
    } else {
      assert.match(message.text, /Court schedule\nCourt <1>: Jan 1, 2026 · 8PM–1AM \(\+1 day\)/);
    }
    const calendar = message.text.match(/Add to Google Calendar: (\S+)/);
    assert.equal(!!calendar, approved);
    if (calendar) {
      const url = new URL(calendar[1]);
      assert.equal(url.origin, "https://calendar.google.com");
      assert.equal(url.searchParams.get("dates"), "20260101T120000Z/20260101T193000Z");
      assert.match(url.searchParams.get("details")!, /Actual court times:\nCourt <1>:[^\n]+\nCourt 2:/);
      assert.doesNotMatch(decodeURIComponent(url.search), /checkout|ABCDE|guest@example|100\.02/);
    }
    assert.match(message.text, /ETHN Courts\n.*Balamban, Cebu/);
    assert.equal(message.text.includes(`Get directions: ${VENUE_MAP_LINK}`), approved);
    assert.doesNotMatch(`${message.text}\n${message.html}`, /private note|private reference/);
  }
  assert.match(messages[0].text, /listing stays private until your booking is confirmed/);
  assert.doesNotMatch(messages[7].text, /Open Play/);
  assert.match(messages[1].text, /Total paid: ₱100\.02/);
  assert.match(messages[2].text, /isn’t booked[\s\S]*Please resubmit/);
  assert.match(messages[2].html!, /Receipt &lt;unclear&gt; &amp; cropped\.<br>Please resubmit/);
  assert.match(messages[2].html!, /href="https:\/\/example\.com\/track"/);
  assert.match(messages[3].text, /No refund has been recorded/);
  assert.match(messages[4].text, /outside the booking site[\s\S]*Refund recorded\n₱100\.02/);
  assert.match(messages[5].text, /recorded your payment in full/);
  assert.doesNotMatch(`${messages[3].text}\n${messages[3].html}`, /\/track|Booking code/);
  assert.doesNotMatch(messages[5].text, /Booking code/);
});

test("tracking exposes rejection reason only for rejected payment and booking", async () => {
  for (const [bookingStatus, paymentStatus, visible] of [["rejected", "rejected", true], ["pending", "rejected", false], ["rejected", "unverified", false]] as const) {
    const pool = { connect: async () => ({ query: async (sql: string) => ({ rows: sql.includes("FROM ethn.bookings") ? [{ id: "id", operating_date: "2026-01-01", status: bookingStatus, total: "100.00" }] : sql.includes("booking_items") ? [] : [{ method: "gcash", status: paymentStatus, claimed_amount: "100.00", review_reason: "Resubmit", private_detail: "secret" }] }), release() {} }) };
    const result = await trackBooking(pool as never, { token: "a".repeat(64) });
    assert.equal("reviewReason" in result!.payments[0], visible);
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});
