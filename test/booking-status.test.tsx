// Run with: node --import ./test/register-loader.mjs --import tsx --test test/booking-status.test.tsx
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingStatusBadge, bookingStatusStyle } from "../src/components/booking/booking-status";

test("booking statuses have consistent light and dark colors and visible labels", () => {
  for (const [state, color] of Object.entries({ pending: "amber", confirmed: "blue", completed: "green", rejected: "red", refunded: "violet", held: "slate", expired: "slate", cancelled: "slate", archived: "slate" })) {
    const badge = renderToStaticMarkup(createElement(BookingStatusBadge, { state }));
    assert.match(badge, new RegExp(`bg-${color}-\\d+.*dark:bg-${color}-\\d+`));
    assert.match(badge, new RegExp(`</svg>${state}</span>`));
    assert.match(bookingStatusStyle(state).accent, new RegExp(`text-${color}-\\d+.*dark:text-${color}-\\d+`));
  }
  assert.match(bookingStatusStyle("constructor").className, /bg-slate-/);
});
