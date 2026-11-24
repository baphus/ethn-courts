# Unified Bookings: pre-implementation code review

2026-11-24. Read-only application review; plan corrected, no runtime/schema changes. No browser, tests, hosted data, migrations or scheduler access.

## Main findings

1. **Internal creation cannot reuse current confirmation contract unchanged.** `src/lib/admin/ethn-walk-ins.ts:13-17,30-50` requires holdId; `:115-125` reads existing held booking owned by actor and rejects expired holds. `:130-132` promotes hold to confirmed and records actual receipt time as server now. Requested behavior instead needs direct transactional creation with schedule/quote validation and overlap exclusion. Keep actor checks, idempotency and rollback behavior. Current contract is one court/range, not source-wide creation parity.
2. **Online method selection is not implemented in current submission.** `src/lib/booking/submission.ts:5` accepts no method; `:73` inserts literal `gcash`. Approval currently also permits only GCash in `src/lib/admin/ethn-payment-decision.ts:48`. Preserving existing method is straightforward, but supporting customer selection of another method requires explicit public checkout scope. Internal Metrobank does not automatically imply online Metrobank support.
3. **Simplified approval needs service, route and schema changes together.** Decision route `src/app/api/ethn/admin/payments/[bookingId]/decision/route.ts:10-13` strictly requires reference, amount and receipt time. Service `src/lib/admin/ethn-payment-decision.ts:14-19,50-54` validates them and writes accepted evidence. Derive accepted amount from locked booking total, preserve method/claimed evidence and explicitly record staff verification attestation. Do not fabricate actual receipt time or verified reference.
4. **Database currently rejects requested payment shapes and new outcomes.** `db/ethn/0001_core.sql:24,41,55,62-64` limits statuses/methods and requires accepted payment receipt time/reference. Later walk-in and extension policies also depend on this. Additive reviewed upgrade needed; no rewriting historical migrations. Preserve extension invariants and verify restricted-role RLS/grants.
5. **Finance would silently omit new collections.** `src/lib/admin/ethn-finance.ts:33-36,41-48` buckets cash/GCash only and filters by received_at. Metrobank and payments with unknown actual receipt time will not appear correctly without coordinated report/export changes. Fallback reporting-date semantics still need user approval; actual receipt time must remain truthful.
6. **Refund/cancel/archive are new ETHN workflows.** Current core schema has no corresponding booking outcomes. `src/lib/admin/decisions.ts` refund code is legacy RPC, not usable active implementation. Add distinct transactional outcomes, immutable refund evidence, archive metadata, eligibility and read/report projections. Never implement cancel by deleting payments/bookings or changing a booking to rejected. Concurrent cancellation/refund/completion must share compatible lock order. Pre-start refund cutoff confirmed; after-start cancellation remains undefined.
7. **Source-looking files are not active page wiring.** `src/app/admin/bookings/bookings-view.tsx:13,34,38-41` renders its own list and summary dialog plus manual completion. Existing sibling legacy table/actions/occupancy files do not establish active feature support. Adapt active page rather than assume changing those siblings changes screen. Full-detail component already has proof endpoint support; avoid duplicate proof logic.
8. **Automatic completion exists, scheduling does not.** `src/lib/admin/ethn-outcomes.ts:36-57` handles final confirmed-extension end, pending-extension guard, allocations and audit with batch limit 50. `src/app/api/cron/ethn-operations/route.ts:9-17` protects invocation via cron secret. Removing manual button does not provision scheduler; repeated invocations/backlog and scheduler failure need verification.
9. **Existing database tests may skip rather than verify behavior.** `test/ethn-payment-decision.test.ts:10-13` depends on two separately configured test URLs. Do not call skipped tests a pass or run mutation tests against runtime/hosted database.

## Plan corrections made

- Removed stale architecture wording suggesting hold/confirmation reuse for internal creation.
- Removed held-quote wording from new internal creation component scope.
- Kept no-code/no-migration/no-hosted authorization boundary.

## Recommended implementation order

Resolve public-method scope, finance-date/refund reporting, internal selection cardinality and cancellation eligibility. Then schema/grants, decision contract, direct internal creation, refund/cancel/archive, report projections, unified page/navigation, scheduler evidence and final verification. UI ownership and browser acceptance require separate explicit approvals under current instructions.

## Verification evidence

This report is source inspection, not runtime proof. Application code unchanged. No tests/build/browser or database commands executed for this review.
