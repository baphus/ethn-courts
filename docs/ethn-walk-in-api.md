# Prepaid walk-in API contract

Current workflow reserves before collecting payment. `POST /api/ethn/admin/walk-ins` with `{action:"reserve",courtId,date,start,end,guestName,guestPhone}` creates a staff-bound held booking and returns `{holdId,courtId,courtName,startsAt,endsAt,total,settingsVersion,merchant,expiresAt}`. No payment exists yet. `GET` recovers this account's latest live hold; reconcile booking history if a confirmation response was lost.

Confirmation requires current enabled owner/staff identity and JSON body (add the returned `holdId`):

```json
{
  "action":"confirm", "holdId":"returned-hold-UUID", "courtId":"1", "date":"2026-11-22",
  "start":"2026-11-22T02:00:00.000Z", "end":"2026-11-22T03:00:00.000Z",
  "guestName":"Desk Guest", "guestPhone":null,
  "method":"cash", "reference":null,
  "displayedTotal":"200.00", "settingsVersion":"1",
  "collectedAmount":"200.00", "paymentReceived":true,
  "idempotencyKey":"unique-per-submission"
}
```

Client obtains displayed total and settings version from the authoritative schedule/pricing response. On-screen total and actual collected amount must be equal exact peso strings with at most two decimal places. Staff explicitly confirms receipt (`paymentReceived: true`) only after receiving full cash or verifying full GCash payment. Server locks the actor-owned hold and checks fresh database deadline, frozen settings version/total and collected amount. Later venue price/recipient changes do not reprice this hold. Mismatch returns 409 `PRICE_CHANGED`, with no accepted payment; expired/wrong holds return 409. Never retry a price mismatch without presenting new amount/version and obtaining fresh acknowledgement.

Idempotency is scoped to authenticated staff actor and `walkin` operation. Same key + normalized payload replays committed result without rechecking schedule or price. Same key with any changed normalized payload returns 409 `IDEMPOTENCY_MISMATCH`. Caller must retain key until definitive result; after uncertain network outcome retry identical request. Key reuse by another actor is independent. GCash requires `reference`; cash accepts absent/null/empty reference only. Duplicate accepted GCash reference returns 409 `REFERENCE_TAKEN`; allocation conflict returns 409 `SLOT_TAKEN`.

Success returns `{bookingId,courtId,courtName,operatingDate,startsAt,endsAt,total,method}`. Invalid input returns 400 `INVALID_INPUT`; schedule/configuration errors return 400 as reported; unauthenticated/forbidden use standard admin errors. No unpaid booking is created.
