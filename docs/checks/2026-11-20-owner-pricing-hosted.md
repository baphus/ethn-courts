# Owner pricing — hosted and browser verification

2026-11-20. Scoped verification on approved disposable project `tgvdukmhnsnsqhokbwbn`; not deployment approval.

## Hosted migration

Reviewed guarded probe applied `0009_owner_pricing.sql` after confirming expected schema, policies, empty test tables and restricted role. Verified client TLS, new column privileges, no broad schedule/DDL grants and rolled-back restricted-role test updates. Migration retained; no real rate or payment-account details set.

Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-settings-hosted/result.json` (pass, commitState committed).

## Browser regression and repair

Initial harness attempts failed on textarea waits, locator syntax and native confirmation handling; those are automation defects, not product passes. A later real save persisted merchant/rates but lost court-name edits. All failed runs restored fixture configuration and removed temporary users/holds.

Focused UI repair uses functional state updaters for merchant, court names and rate fields, capturing each event value before the updater runs. Queued-edit unit regression verifies earlier edits survive later field updates. Stale captured state was a diagnosis hypothesis; final real browser results establish corrected behavior without asserting every prior failure had the same cause.

Final real browser run passed:
- Both court names remain edited after merchant and all 14 rate edits.
- Enabled owner saves test names, exact rates and TEST ONLY instructions.
- Held checkout's rate/total/merchant snapshots stay frozen; a later checkout uses new rate/instructions.
- Stale version returns conflict, preserves unsaved edit, disables save; explicit reload discards edit and loads fresh snapshot.
- Separate real staff Auth login has no owner navigation; direct settings page denies access.
- Full owner-page axe: 0 violations, 41 passes. Mobile screenshot captured, not manually visually reviewed.

Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-settings-hosted/browser-1795163206363/result.json`, `owner-a11y.json`, reusable temporary `browser.mjs` harness.

Cleanup passed: temporary Auth/staff rows, held checkouts, item/allocation/idempotency/audit fixtures removed; original court names, rates and merchant restored. Settings version advanced to **18**, never rolled backward. No unrelated data overwritten. Owned browser sessions and Next server closed. Remembered private password forgotten.

## Final checks

All exit 0 after repair/reconciliation:
- `npm test`: 307 total; 304 passed, 0 failed, 3 conditional database cases skipped by default. Pricing case has separate actual restricted-role PostgreSQL evidence; staff-read/decision cases ran in prior acceptance.
- `npx --no-install tsc --noEmit`.
- `npm run build`.

Logs: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-settings-verified-final`.

Hours, court activity and timing policies remain read-only. No real venue values, emails, payments or deployment. Production pooling/hosting/scheduler/recovery and later SRS modules remain separate gates.
