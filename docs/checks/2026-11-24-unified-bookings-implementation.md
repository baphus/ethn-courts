# Unified Bookings implementation checkpoint

2026-11-24. Implementation is not yet release-ready. User confirmed concurrent branding/landing/auth/contact edits are intentional and authorized reconciliation; those changes were preserved. Public booking component was found truncated during reconciliation, repaired, then current shared-file state was rechecked with TypeScript and build. No unrelated branding changes were reverted.

## Implemented

- Configurable staff/owner payment-method service/API and bounded normalized QR upload; public enabled-method list and QR endpoint.
- Public checkout freezes method instruction list; submission preserves selected method and customer evidence, requires attached proof, accepts optional reference/claimed amount.
- Online approval can use explicit full-payment attestation; server derives collected amount from locked booking total and preserves method. Legacy explicit evidence contract retained for existing callers.
- Direct internal creation transaction: no hold, confirmed booking/allocation, accepted payment, optional actual time/reference, configured methods plus cash, idempotency and overlap rejection.
- Authorized idempotent refund/cancel/archive actions, external refund ledger, future-slot release, retained original payment history. Refund/cancel currently reject bookings already started or with pending/confirmed extensions.
- Unified bookings dialog embeds details/proof/actions, archived filtering, occupancy, new-booking form, payment instructions UI, Payments/walk-in redirects and navigation updates.
- Finance includes other methods and recorded refunds; actual-time fallback to verification time is disclosed and does not overwrite receipt time.
- Vercel cron config invokes existing protected operations endpoint every minute. Not provisioned/deployed; hosting-plan eligibility remains gate.
- Additive migration generated via existing Drizzle command; SQL copied from reviewed reference. No existing/hosted DB migration executed.

## Evidence

- `node --import ./test/register-loader.mjs --test test/ethn-unified-bookings.test.ts`: 3 pass, exit 0 (initial focused execution).
- Latest `npm test`: 413 tests, 386 pass, 1 fail, 26 skipped; log `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-unified-final-tests.log`. Remaining failure `test/no-instant-slicing.test.ts` reports six existing ISO date-slicing sites, also present in first full test execution. No claim full suite passes.
- `npx --no-install tsc --noEmit --incremental false`: exit 0 after repairing truncated booking file and updating export fixtures.
- `npm run build`: exit 0; log `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-unified-build.log`.
- Approved disposable PostgreSQL verification: `scripts/verify-unified-local.mjs`, installed local binaries, generated loopback cluster/restricted login; 1 integration test pass, no skips, exit 0. Latest evidence `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-unified-4eq0fc/tests.log` (includes versioned QR retention). Covers method configuration, direct creation/replay/overlap, refund replay, archive, finance other/refunds, cancellation payment retention, online method snapshot after disabling/editing method, screenshot submission, simplified approval and revoked staff. Cluster stopped/deleted by script; logs retained.
- No browser acceptance performed; no permission granted.

## Remaining reconciliation/release gates

- Resolve concurrent changes, especially shared `src/components/booking/ethn-booking.tsx`; final evidence can become stale if another writer edits afterward.
- QR versions now persist immutable bytes per method/version. Customer QR endpoint accepts version (or UI `v`) and serves original version even after method changes; public QR images are venue payment instructions, not private payment proofs. Latest disposable test confirms old QR bytes survive replacement.
- Existing pre-migration held checkouts lack payment-method snapshots; require controlled expiry/cutover or reviewed compatibility policy, not fabricated method fallback.
- Internal creation currently one court/range. No confirmed multi-court requirement.
- Test coverage must expand for failed/uncertain action commits and approval retries, QR security and restricted-role upgrade from existing schema; disposable fresh-chain check is not upgrade proof.
- Inspect remaining old UI/source tests and active method/status consumers; no production-ready claim.
- Migration requires separate authorization against real target. Browser acceptance, scheduler deployment and actual payment/QR instructions remain unverified.
