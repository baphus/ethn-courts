import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingInvoice } from "../src/components/booking/ethn-booking-invoice";

const date = "2026-11-26";
const court = { court: "Court 1", startsAt: "2026-11-26T10:00:00Z", endsAt: "2026-11-26T14:00:00Z", amount: "600.00", durationMinutes: 240, intervalMinutes: 60, hourlyRate: "150.00" };

test("invoice shows booking date once and counts saved grid slots across courts", () => {
  const html = renderToStaticMarkup(createElement(BookingInvoice, {
    date, items: [court, { ...court, court: "Court 2", intervalMinutes: 30, hourlyRate: "175.00", amount: "700.00" }], total: "1300.00", paymentMethod: "GCash", email: "s•••@gmail.com",
  }));
  assert.match(html, /Booking date · November 26, 2026/);
  assert.equal(html.match(/November 26, 2026/g)?.length, 1);
  assert.match(html, /6:00\s*PM – 10:00\s*PM/i);
  assert.match(html, /4 \u00d7 60-min slots/);
  assert.match(html, /8 \u00d7 30-min slots/);
  assert.match(html, /Total slots<\/dt><dd[^>]*>12</);
  assert.match(html, /GCash/);
  assert.match(html, /s•••@gmail\.com/);
  assert.match(html, /4 \u00d7 60-min slots.*₱150\.00\/hr.*₱600\.00/);
  assert.match(html, /8 \u00d7 30-min slots.*₱175\.00\/hr.*₱700\.00/);
  assert.match(html, /₱1,300\.00/);
  assert.doesNotMatch(html, /Manila time|Operating date/);
});

test("invoice shows overnight dates and keeps extensions out of original slot total", () => {
  const overnight = { ...court, startsAt: "2026-11-26T15:30:00Z", endsAt: "2026-11-26T16:30:00Z", durationMinutes: 60 };
  const html = renderToStaticMarkup(createElement(BookingInvoice, { date, items: [overnight], total: "600.00", extensionItems: [{ ...overnight, intervalMinutes: 30 }] }));
  assert.match(html, /11:30\s*PM – November 27, 2026 · 12:30\s*AM/i);
  assert.match(html, /1 \u00d7 60-min slot ·/);
  assert.match(html, /Total slots<\/dt><dd[^>]*>1</);
  assert.match(html, /Confirmed extensions · separate from booking total.*2 \u00d7 30-min slots/);
});
