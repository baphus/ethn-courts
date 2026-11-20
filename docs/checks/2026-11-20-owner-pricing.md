# Owner pricing/configuration slice — local evidence

2026-11-20. Scope: owner-only court names, existing hours-row rates and official payment-instruction text. Schedule/activity and booking-policy fields remain read-only. No hosted migration, live rate/account change, browser automation or deployment in this batch.

Implemented `src/lib/admin/ethn-settings.ts`, GET/PUT `/api/ethn/admin/settings`, `0009_owner_pricing.sql` grants/RLS, and owner-only `/admin/settings` screen. Owner navigation uses explicit current role; backend checks owner inside transaction. Full editable snapshot plus version required; unknown/missing IDs, stale version, invalid exact decimal and conflicting names rejected. Name swaps use transaction-local temporary unique names. Existing priced items/merchant snapshots untouched. Audit stores actor/versions/changed IDs, not account instructions.

Local PostgreSQL 18.2: fresh migrations 0001–0009 and restricted role test passed, SCRAM authentication, cluster stopped. Test checks owner access, staff/disabled denial, stale version and invalid membership rollback, court-name swap, exact/null rates, booking/item price and merchant snapshots, single audit. Payment snapshot preservation was not separately asserted; service SQL contains no payment update.

Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-owner-pricing/result.json` and focused test log. Conditional test source: `test/ethn-settings.test.ts`; run only against fresh disposable DB with its two explicit test connection variables, never production.

After UI reconciliation, final commands all exit 0 with hosted variables explicitly blank:
- `npm test`: 306 total, 303 passed, 0 failed, 3 conditional database tests skipped by default. New pricing integration case ran separately as described above; prior staff-read/decision cases have earlier explicit acceptance evidence.
- `npx --no-install tsc --noEmit`.
- `npm run build`.

Final logs: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-owner-pricing-final`.

Parent removed nested main in settings content to preserve admin-shell landmark, and made staff-service configuration failure show generic unavailable state rather than raw error. UI visual/browser behavior not verified in this scope. No new dependencies or runtime credentials changed; original paddle-culture repository clean. Production readiness not implied. Null merchant/rates still disable checkout; no official values supplied by owner yet.
