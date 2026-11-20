# Owner hours/activity management — local evidence

2026-11-20. Implemented owner-only weekly-hours and existing-court active-status management. No hosted migration or schedule changes, browser verification, new packages or deployment in this batch.

## Implemented

- Pure `validateEthnHours` reuses schedule resolution for seven-day overnight/anchor/overlap checks. Unset rates remain valid configuration and disable checkout separately. Relevant live holds, pending and confirmed future/in-progress allocations must fit one proposed window, aligned to current interval/minimum and active court. Expired holds/past allocations ignored.
- `putEthnHours` verifies current owner inside transaction, checks version, locks settings then all courts/hours, obtains fresh database time and reads allocations with **booking-header** hold expiry. Conflict rolls back. Success atomically replaces hours, updates activity, increments version and records audit IDs/versions. No booking/item/payment history or frozen prices changed.
- `0010_owner_hours.sql` adds only hours INSERT/DELETE, identity-sequence usage and matching RLS. Shared SQL role still requires server human authorization.
- GET/PUT `/api/ethn/admin/hours` uses existing owner snapshot, strict 64 KiB JSON, origin guard, private/no-store responses and safe conflict/error mapping. Exact DTO mapping documented in `docs/ethn-hours-api.md`.
- `/admin/hours` has owner-only page/navigation, weekly window add/remove/edit and active toggles. Timing rules remain read-only. Empty windows mean closed; blank rate maps null. Conflict preserves edits; stale/uncertain save requires explicit reload. Functional state updates avoid lost queued edits.

## Actual local verification

PostgreSQL 18.2 disposable loopback SCRAM cluster, actual migrations 0001–0010, restricted `ethn_checkout` login:
- Owner update, stale rejection, replaced rows/activity/version/audit and frozen-item preservation.
- Pending allocation invalidation rejects atomically with unchanged snapshot.
- Staff/disabled-owner denied.
- Live held booking blocks change; expired booking-header hold ignored even if allocation expiry remains future.
- Four concurrent checkout-versus-schedule races: either checkout commits and edit conflicts, or edit commits and checkout fails selection; no live committed hold outside final hours.

Local Next HTTP checks: GET missing auth config 503; wrong origin 403; malformed/wrong-type/oversize body 400; valid shape without config 503. Positive hosted Auth HTTP not claimed. Temporary PostgreSQL and Next stopped.

Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-hours-transaction` and `.../ethn-hours-api/result.json`, harness and integration logs.

## Reconciled checks

All exit 0 with active hosted environment explicitly blanked:
- `npm test`: 314 total, 308 passed, 0 failed, 6 conditional database tests skipped by default. Hours conditional cases were run separately above; older conditional cases have their earlier acceptance records.
- `npx --no-install tsc --noEmit`.
- `npm run build`.

Logs: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-hours-final`.

## Remaining gates

Migration 0010 is **not applied** to hosted project; deploy permission/UI rollout requires separate authorization and browser verification. Actual venue hours/active status remain unchanged. UI visual/accessibility behavior unverified in browser. Anchor/interval/minimum/horizon/hold policy edits and court creation/deletion are outside this slice. Rate-only schedule edits preserve existing booking item amounts. Replacing hours creates new hours-row IDs and increments settings version; stale pricing forms must reload rather than force updates. Production hosting/pooling/scheduling and broader SRS modules remain unfinished.
