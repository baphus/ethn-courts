# ETHN staff payment decision API

`POST /api/ethn/admin/payments/{bookingId}/decision` requires authenticated, enabled owner or staff access. Send same-origin `application/json`, at most 32 KiB. `bookingId` is a UUID. Body is strictly one of:

```json
{"key":"unique-idempotency-key","action":"approve","acceptedReference":"1234567890123","collectedAmount":"100.00","receivedAt":"2026-11-20T12:00:00Z"}
```

```json
{"key":"unique-idempotency-key","action":"reject","reason":"Payment proof is unclear. Please contact us."}
```

`receivedAt` is actual receipt time, not future. Approval reference and amount must match the claimed reference and booking total. Rejection reason is customer-visible plain text, 1–500 characters after trimming; never include internal details. Reuse the same key only for the same decision.

Success: `{ "bookingId": "UUID", "status": "confirmed" | "rejected", "paymentStatus": "accepted" | "rejected" }`. Errors return `{ "error": "..." }`: 400 invalid input, 401 unauthenticated, 403 forbidden/origin, 409 decision conflict, 503 unavailable. No raw database error is returned. Responses use no-store and no-referrer. Mail delivery is best-effort after commit and never changes the decision.

Tracking response includes `reviewReason` on a payment only when both booking and payment are rejected. Render this as text, not HTML.
