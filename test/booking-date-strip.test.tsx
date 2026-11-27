import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingDateStrip } from "../src/components/booking/booking-date-strip";

const render = (props: Partial<Parameters<typeof BookingDateStrip>[0]> = {}) => renderToStaticMarkup(createElement(BookingDateStrip, {
  value: "2026-12-31", onChange: () => {}, ...props,
}));

test("staff date picker offers seven dates across the year boundary and marks selection", () => {
  const html = render();
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 7);
  assert.match(html, /aria-label="Thursday, December 31, 2026" aria-pressed="true"/);
  assert.match(html, /aria-label="Sunday, January 3, 2027"/);
  assert.match(html, /Choose date/);
});

test("public date picker retains its bounds before a date is selected", () => {
  const html = render({ value: "", anchor: "2026-12-31", min: "2026-12-31", max: "2027-01-01" });
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /aria-pressed="true"|December 30|January 2/);
});
