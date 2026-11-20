# ETHN late-exception review API

Staff-only API. Every request verifies the current enabled `ethn.staff_access` owner/staff identity; a shared database role is not authorization. Responses are `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.

Exception review records a private staff assessment only. The payment stays `exception`, the booking stays `expired`, and no slot, acceptance, collection, refund or outbox row changes.

## `GET /api/ethn/admin/exceptions`

Pending queue: payments with `status = 'exception'`, no review yet, and an expired booking. Oldest submission first, maximum 50.

```json
[{"paymentId":"uuid","bookingId":"uuid","operatingDate":"2026-11-22","guestName":"Late Guest","total":"100.00","claimedReference":"ref","claimedAmount":"100.00","createdAt":"2026-11-20T08:00:00.000Z","proofAvailable":true}]
```

`proofAvailable` is true only for an attached proof bound to that payment, booking and booking owner. The response never contains an object path, owner token, tracking secret or signed URL.

## `GET /api/ethn/admin/exceptions/:paymentId`

One exception, reviewed or not. `paymentId` must be a UUID.

```json
{"paymentId":"uuid","bookingId":"uuid","operatingDate":"2026-11-22","guestName":"Late Guest","total":"100.00","claimedReference":"ref","claimedAmount":"100.00","createdAt":"2026-11-20T08:00:00.000Z","proofAvailable":true,"review":{"note":"Needs manual match","reviewedAt":"2026-11-20T09:00:00.000Z","reviewedBy":"staff-uuid"}}
```

`review` is null before review. Unknown or non-exception payment returns `404 {"error":"NOT_FOUND"}`. For guest contact, court items and proof actions, use the existing `GET /api/ethn/admin/payments/:bookingId` and `GET /api/ethn/admin/payments/:bookingId/proof`; the detail response is enough to link them by `bookingId`.

## `POST /api/ethn/admin/exceptions/:paymentId/review`

Strict JSON body, maximum 32 KiB, same-origin required:

```json
{"note":"Needs manual match"}
```

`note` is trimmed and must be 1-500 characters. Success returns the prior/current review:

```json
{"paymentId":"uuid","bookingId":"uuid","note":"Needs manual match","reviewedAt":"2026-11-20T09:00:00.000Z","reviewedBy":"staff-uuid"}
```

Review is immutable. Repeating the same exact trimmed note returns the prior result without another audit row, but still checks the current staff identity. A different note returns `409 {"error":"REVIEW_ALREADY_FINAL"}`. A missing/non-exception payment, non-expired booking, non-GCash method or missing attached proof returns `409 {"error":"REVIEW_NOT_ELIGIBLE"}`. Concurrent different notes have one winner.

The audit row uses action `exception.review` with the payment id only; the note is not duplicated into audit detail or public tracking. Customer tracking exposes a review reason only for a rejected booking/payment, so exception notes remain private.

Statuses: `400` invalid body/UUID/note, `401` unauthenticated, `403` bad origin/not current staff, `404` detail not found, `409` final/ineligible, `503` unavailable. The server does not expose whether an unauthorized payment exists.
