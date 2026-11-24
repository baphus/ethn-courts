import assert from "node:assert/strict";
import test from "node:test";
import { checkoutFailure, holdExpiry } from "../src/components/booking/checkout-feedback";

test("expiry warns once only for a hold observed active in this visit", () => {
  const restored = holdExpiry(null, "old", true);
  assert.equal(restored.warn, false);
  assert.equal(holdExpiry(restored.observation, "old", true).warn, false);

  const active = holdExpiry(restored.observation, "new", false);
  assert.equal(active.warn, false);
  const expired = holdExpiry(active.observation, "new", true);
  assert.equal(expired.warn, true);
  assert.equal(holdExpiry(expired.observation, "new", true).warn, false);
  const resynced = holdExpiry(expired.observation, "new", false);
  assert.equal(holdExpiry(resynced.observation, "new", true).warn, false);
});

test("checkout distinguishes validation, rejection, prior submission, and uncertain results", () => {
  assert.equal(checkoutFailure(new Error("INVALID_INPUT")), "field");
  assert.equal(checkoutFailure(new Error("PROOF_METADATA_MISMATCH")), "field");
  assert.equal(checkoutFailure(new Error("SLOT_TAKEN")), "rejected");
  assert.equal(checkoutFailure(new Error("ALREADY_SUBMITTED")), "already-submitted");
  for (const code of ["UPLOAD_UNCERTAIN", "INTERNAL", "SUBMISSION_UNAVAILABLE", "IDEMPOTENCY_INCOMPLETE"]) {
    assert.equal(checkoutFailure(new Error(code)), "uncertain");
  }
  assert.equal(checkoutFailure(new TypeError("Failed to fetch")), "uncertain");
});
