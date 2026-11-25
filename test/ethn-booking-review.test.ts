import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const booking = readFileSync(new URL("../src/components/booking/ethn-booking.tsx", import.meta.url), "utf8");

test("only review confirmation calls the checkout hold endpoint", () => {
  assert.match(booking, /onClick=\{\(\) => \{[^}]*setReviewing\(true\);[^}]*\}\}>Review selection/);
  assert.match(booking, /reviewing && availability \? <form[^\n]*onSubmit=\{e => \{ e\.preventDefault\(\); void beginCheckout\(\); \}\}>[\s\S]*?\{contactFields\}[\s\S]*?<Button type="submit"[^\n]*"Confirm and hold"/);
  assert.match(booking, /async function beginCheckout\(\)[\s\S]*?if \(!validateGuest\(\{ kind: "online", name, email, phone \}\)\) \{[^}]*return;[^}]*\}[\s\S]*?await post<Checkout>\("\/api\/checkout"/);
  assert.equal(booking.match(/\bbeginCheckout\(/g)?.length, 2, "one definition and one call site");
  assert.match(booking, /async function beginCheckout\(\)[\s\S]*?if \(!reviewing\b[\s\S]*?await post<Checkout>\("\/api\/checkout"[\s\S]*?save\(\{ owner, checkout/);
});
