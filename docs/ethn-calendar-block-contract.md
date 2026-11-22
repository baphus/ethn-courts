# ETHN calendar and court-block contract

## Approved implementation contract — 2026-11-21

This section supersedes conflicting proposals below. User approved these defaults and local implementation; hosted execution remains unauthorized.

- `GET /api/ethn/admin/calendar?date=YYYY-MM-DD` (optional date defaults to current operating date): `{date, serverNow, window: {startsAt, endsAt}, courts: [{id, name, active, intervals: [{id, startsAt, endsAt, state, kind, bookingId, guestName, blockId, reason}]}]}`. IDs are strings; timestamps ISO strings. `kind` is `booking|maintenance|private`; booking fields are null for blocks, block fields null for bookings. Return all courts, including inactive courts and historical allocations. Dates may be historical. Exclude expired holds and released blocks. No contact/payment/proof/tracking data.
- `POST /api/ethn/admin/blocks`: exact `{courtId, startsAt, endsAt, reason, kind}`; kind `maintenance|private`; reason trimmed 1–500 characters. Response 201 `{id, courtId, startsAt, endsAt, reason, kind}`. Future starts only within configured operating-date horizon, positive duration; court must be active. Outside-opening-hours maintenance/private blocks are allowed. Reject overlap with live occupancy; expire only stale booking holds under locks.
- `GET /api/ethn/admin/blocks` (added 2026-11-22 for Court setup): enabled owner or staff, read-only; returns up to 50 unreleased blocks ending after now, ordered by start: `[{id, courtName, startsAt, endsAt, kind, reason}]`. Read-only list on `/admin/courts`; creating and releasing stay on `/admin/calendar`.
- `DELETE /api/ethn/admin/blocks/[id]`: 204 on first or repeated release of an existing block, 404 for unknown block. Retain metadata and audit first release only. Never mutate booking allocations.
- Enabled owners and staff may read/create/release. Existing authentication, origin, bounded JSON and private no-store response conventions apply. Invalid input 400, unauthorized 401/403, missing court/block 404, overlap 409 `SLOT_TAKEN`, service failure 503 with safe error text.
- Active future blocks prevent court deactivation. Hours edits must retain coverage of portions overlapping the current opening hours; outside-hours portions need not become bookable. Existing booking conflict protection stays unchanged.
- UI uses explicit Manila start/end dates and times, including overnight ranges; calendar window follows configured operating-day anchor, not assumed midnight. No new court creation, Open Play or booking-cancellation behavior.

Implementation locations: backend `src/lib/admin/ethn-calendar.ts` plus block service if separated, `/api/ethn/admin/calendar`, `/api/ethn/admin/blocks`, `/api/ethn/admin/blocks/[id]`; UI `/admin/calendar`. Exact DTO above is the agreed wiring target, not proof implementation exists or passes.

## Historical proposal and implementation notes

Scope: staff calendar for a single Manila operating date, plus one-off maintenance blocks. Blocks occupy court inventory directly; they are not fake bookings and never participate in payment, guest, proof, or booking-status workflows. No implementation or migration has been applied. Build only after product decisions below.

## Proposed API

- `GET /api/ethn/admin/calendar?date=YYYY-MM-DD`: authenticated enabled staff (owner or staff); date defaults to current operating date using configured Manila anchor. Return `Cache-Control: no-store`; reject malformed/out-of-horizon dates with `400 INVALID_INPUT`. Return date, server time, courts, and per-court sorted intervals. Interval shape: `{id, startsAt, endsAt, state, kind, reason?, booking?}`. `kind` is `booking` or `maintenance`; booking state distinguishes live held, pending, confirmed, completed. Include guest name only if staff calendar needs it; never include email, phone, payment/proof data, tracking codes or storage paths. Return an empty list for inactive courts, not hidden existing allocations.
- `POST /api/ethn/admin/blocks`: enabled owner or staff; exact JSON `{courtId, startsAt, endsAt, reason}`; strict validation, bounded reason, UUID generated server-side. Require future start, `endsAt > startsAt`, selected court active, interval within allowed booking horizon, and no overlap with any live allocation. Return `201 {id,courtId,startsAt,endsAt,reason}`. Overlap returns `409 SLOT_TAKEN`; invalid input `400 INVALID_INPUT`; unknown/inactive court `404 COURT_NOT_FOUND`.
- `DELETE /api/ethn/admin/blocks/:id`: enabled owner or staff; release only a maintenance block, idempotency policy TBD. Return `204`; missing/non-block allocation `404 BLOCK_NOT_FOUND`; already released behavior TBD.
- Auth failures follow existing admin conventions (`401 UNAUTHENTICATED`, `403 FORBIDDEN`); database/config failures do not expose SQL details.

## Minimal data model

Use `court_allocations` as sole overlap authority. Migration `0015` adds nullable `block_id`, permits exactly one of `item_id`/`block_id`, changes booking-item unique index to partial (`item_id IS NOT NULL`), adds partial unique `block_id`, and adds block FK. Keep exclusion constraint shared across booking and block rows, and retain existing half-open ranges. Add `ethn.court_blocks(id, reason, created_by, created_at, removed_by, removed_at)` with staff FKs and bounded reason; block allocation identifies court/time/state. Prefer explicit `released` state (excluded from exclusion predicate) rather than misusing `expired`; include no block rows in booking status/payment code. `0015` must grant/revoke/RLS-protect new table and columns for restricted `ethn_checkout`, then verify effective grants; runtime needs only minimum select/insert/update access. Existing rows remain untouched. Never apply to existing data without separately approved migration plan.

## Required writer/read changes

- `src/lib/booking/ethn-availability.ts`: already reads allocation ranges without booking join; expose maintenance occupancy safely, do not leak reason publicly.
- `src/lib/booking/checkout.ts`, `src/lib/admin/ethn-walk-ins.ts`: shared overlap exclusion already protects inserts; ensure conflict response maps exclusion violation consistently. Preserve expiry of only held booking rows.
- `src/lib/admin/ethn-hours.ts`: currently inner-joins allocations to booking items and validates active status/hours against them. Include active blocks in conflict inputs so hours edits/deactivation cannot strand them; decide whether hours may be changed around scheduled blocks.
- `src/lib/admin/ethn-booking-read.ts` / calendar query: avoid exposing guest/payment data beyond staff need; don't infer blocks through booking joins.
- `src/lib/booking/submission.ts`, `src/lib/admin/ethn-payment-decision.ts`, walk-in and checkout expiry queries: keep item-scoped state transitions; nullable `item_id` must never update blocks.
- Serialize block create/remove with existing writer locks: checkout takes settings then all courts; hours takes owner, settings, courts. Match order for block mutations; lock selected court(s), then test overlap/insert or release, relying on exclusion constraint as final race guard. Removal must only release its own block.

## Acceptance tests

Migration fresh-chain and upgrade-path SQL tests; XOR/FKs/partial uniqueness/exclusion and half-open adjacency. Concurrent booking-vs-block and block-vs-block yields exactly one success. Held expiry, submission, rejection, completion and walk-in transitions leave block untouched. Public availability reports occupied interval without reason/PII. Calendar auth, Manila anchor/date bounds, inactive court, sorting and privacy. Block validation, overlap mapping, audit actor, removal ownership/idempotency. Hours update/deactivation conflict behavior. Restricted runtime grants/RLS verified; no production DB/browser activity.

## Business decisions blocking implementation

1. Should staff users as well as owners create/remove blocks? Proposal: both, consistent with staff operational access.
2. May blocks be created in past or beyond booking horizon? Proposal: future only, within configured horizon.
3. Are blocks allowed outside posted court hours, and may later hours edits deactivate a court across a block? Proposal: allow outside-hours maintenance; reject settings/hours changes that strand a block unless block is explicitly released first.
4. Calendar guest-name visibility, and whether any booking payment summary is needed? Proposal: name only; no payment details.
5. Remove semantics: hard delete vs retained audit record; idempotent repeat behavior. Proposal: retain block row and mark allocation `released`; repeat returns 204.
