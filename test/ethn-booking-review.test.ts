import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const booking = readFileSync(new URL("../src/components/booking/ethn-booking.tsx", import.meta.url), "utf8");

test("checkout uploads the selected screenshot without submitting the booking", () => {
  assert.match(booking, /const screenshot = e\.currentTarget\.files\?\.\[0\];\s*e\.currentTarget\.value = "";\s*if \(screenshot\) void upload\(screenshot\);/);
  assert.doesNotMatch(booking, /"Upload proof"/);
  assert.match(booking, /onClick=\{\(\) => void submit\(\)\}/);
});

test("refresh restores the existing checkout and payment fields; only explicit leave releases it", () => {
  assert.match(booking, /sessionStorage\.getItem\(STORAGE\)[\s\S]*?setDraft\(value\); setProgress\(\{ \.\.\.emptyProgress, \.\.\.value\.progress \}\)/);
  assert.match(booking, /save\(\{ \.\.\.draft, progress: next \}\)/);
  assert.equal(booking.match(/"\/api\/checkout\/release"/g)?.length, 1);
  assert.match(booking, /async function leaveCheckout\(\)[\s\S]*?await post\("\/api\/checkout\/release", \{ ownerToken: draft\.owner, checkoutId: draft\.checkout\.checkoutId \}\);\s*try \{ finishCheckout\(\);/);
  assert.match(booking, /onClick=\{\(\) => void leaveCheckout\(\)\}/);
});

test("only review confirmation calls the checkout hold endpoint", () => {
  assert.match(booking, /onClick=\{\(\) => \{[^}]*setReviewing\(true\);[^}]*\}\}>Review selection/);
  assert.match(booking, /reviewing && availability \? <form[^\n]*onSubmit=\{e => \{ e\.preventDefault\(\); void beginCheckout\(\); \}\}>[\s\S]*?\{contactFields\}[\s\S]*?<Button type="submit"[^\n]*"Confirm and hold"/);
  assert.match(booking, /async function beginCheckout\(\)[\s\S]*?if \(!validateGuest\(\{ kind: "online", name, email, phone \}\)\) \{[^}]*return;[^}]*\}[\s\S]*?await post<Checkout>\("\/api\/checkout"/);
  assert.equal(booking.match(/\bbeginCheckout\(/g)?.length, 2, "one definition and one call site");
  assert.match(booking, /async function beginCheckout\(\)[\s\S]*?if \(!reviewing\b[\s\S]*?await post<Checkout>\("\/api\/checkout"[\s\S]*?save\(\{ owner, checkout/);
});
