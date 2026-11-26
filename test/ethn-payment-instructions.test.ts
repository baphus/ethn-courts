import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/components/booking/ethn-booking.tsx", import.meta.url), "utf8");

test("checkout hides payment instructions and QR when payment cannot proceed", () => {
  assert.match(source, /clockReady && !expired && !draft\.releaseRequested && !\(draft\.checkout\.acknowledgementRequired && !ack\) && checkoutMethods\?\.filter\(m => m\.id === methodId\)\.map\(m =>[^\n]*\{m\.instructions\}[^\n]*Download QR/);
});
