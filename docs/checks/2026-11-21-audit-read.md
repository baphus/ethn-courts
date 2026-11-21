# ETHN audit read

Implemented owner-only `GET /api/ethn/admin/activity`, explicit allowlisted audit projection, and `0016_audit_read.sql` narrow SELECT grant/RLS policy. Read response is private/no-store. Staff actor attribution uses exact text comparison against staff IDs, including disabled historical staff. No raw actor or unapproved detail fields are returned.

## Verification

- Focused `node --import ./test/register-loader.mjs --test test/ethn-audit-read.test.ts`: 3 pass, 1 conditional DB test skipped (DB URLs absent).
- Full fresh PostgreSQL chain through `0016_audit_read.sql`: migrations `0001`–`0016` applied successfully with local restricted `ethn_checkout` role and flags/grants verified; the database behavior harness did not complete because its temporary consumer import failed under Windows ESM path handling. DB behavioral acceptance remains unverified.
- Parent reconciliation fixed `occurredAt` API/UI naming, replaced server-local date roundtrip with `manilaDateStr`, and corrected integration assertions to actual allowlist/count semantics. Fresh harness `node C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-audit-read/verify.mjs`: exit 0, 4 tests passed, 0 skipped, restricted PostgreSQL with migrations 0001–0016, cluster stopped. Evidence `run-1795208102823/{result.json,test.log}` in same folder.
- Final `npm test`: exit 0, 330 total, 318 passed, 12 conditional skips, 0 failures. `npx --no-install tsc --noEmit`: exit 0. `npm run build`: exit 0. Logs `final-tests.log` and `final-build.log` in same temporary parent. No browser/HTTP acceptance performed.

Disposable local DB stopped and removed fixtures. No hosted service, production DB, browser, or migration touched.