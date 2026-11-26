import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("changing an internal booking date confirms before clearing court selections", () => {
  const booking = source("app/admin/bookings/new/new-booking.tsx");
  assert.match(booking, /onValueChange=\{async value => \{[^\n]*!await confirm\("Changing the date clears selected hours\.[^\n]*return; setSelection\(\{\}\);[^\n]*setDate\(next\)/);
});

test("expense fields retain native form names and paid-date constraints", () => {
  const fields = source("app/admin/finance/expense-actions.tsx");
  assert.match(fields, /<DateField name="paidDate" required max=\{today\}/);
  assert.match(fields, /<FormSelect[^>]*name="category"[^>]*defaultValue=/);
  assert.match(source("components/ui/date-field.tsx"), /name=\{name\} value=\{current\} required=\{required \|\| incomplete\} min=\{min\} max=\{max\}/);
});
