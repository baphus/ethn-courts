import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/booking/ethn-booking.tsx", import.meta.url), "utf8");

test("booking date discard prompt runs before clearing selected times", () => {
  const change = source.slice(source.indexOf("function changeDate"), source.indexOf("const minDate"));
  assert.match(change, /if \(date === chosenDate .*\) return;\s*if \(bookingPage && ranges.length > 0 && !window.confirm\([^\n]+\)\) return;\s*setRanges\(\[\]\)/);
});

test("Open Play fields are on Review and listing validation precedes the hold", () => {
  assert.match(source, /Review your selection[\s\S]*Hosting an Open Play\?[\s\S]*Confirm and hold[\s\S]*aria-label="Court availability"/);
  assert.equal(source.split("Hosting an Open Play?").length, 2);
  const checkout = source.slice(source.indexOf("async function beginCheckout"), source.indexOf("async function leaveCheckout"));
  assert.match(checkout, /const listingError = openPlayValidationError\(\);\s*setOpenPlayError\(listingError\);\s*if \(listingError\) return;[\s\S]*post<Checkout>/);
  assert.match(source, /function openPlayValidationError\(\) \{\s*if \(!openPlayEnabled\) return "";/);
});
