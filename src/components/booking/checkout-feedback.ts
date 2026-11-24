const fieldErrors = new Set(["INVALID_INPUT", "AMOUNT_MISMATCH", "PROOF_METADATA_MISMATCH"]);
const rejected = new Set(["SLOT_TAKEN", "COURT_UNAVAILABLE", "CLOSED", "CHECKOUT_UNAVAILABLE", "NOT_CONFIGURED", "INVALID_ORIGIN", "ACKNOWLEDGEMENT_REQUIRED", "STORAGE_UNAVAILABLE", "IDEMPOTENCY_MISMATCH"]);

export function checkoutFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (fieldErrors.has(code)) return "field";
  if (code === "ALREADY_SUBMITTED") return "already-submitted";
  if (rejected.has(code)) return "rejected";
  return "uncertain";
}

export function holdExpiry(previous: { id: string; expired: boolean } | null, id: string, expired: boolean) {
  const sameHold = previous?.id === id;
  return {
    observation: { id, expired: expired || (sameHold && previous.expired) },
    warn: sameHold && !previous.expired && expired,
  };
}
