# Calendar Create event — local verification

Implemented 2026-11-22. No browser, hosted services or migrations used.

- Calendar dialog switches Closure/Open Play, selects multiple active courts, uses explicit Manila date/time fields and preserves failed entries/uncertain-save protection. Open Play uses existing service/public listing; informational fee only.
- Closure service supports atomic multi-court creation with per-court audit and shared allocation exclusion. Existing single-court request/response and independent release remain supported. No schema changes.
- `node --test --import ./test/register-loader.mjs test/ethn-calendar-multi-blocks.test.ts test/ethn-calendar-blocks.test.ts test/admin-calendar-ui.test.ts test/admin-calendar-range.test.ts` — exit 0; 9 passed, 1 conditional DB skip. New mocked transaction tests cover success, invalid court lists, inactive/conflicting courts, rollback after a later exclusion failure and single-court response compatibility. These prove service query/transaction behavior, not actual database locking or rollback effects.
- `npx.cmd --no-install tsc --noEmit` — exit 0.
- `npm run build` — exit 0. Log: `C:/Users/JKsars/AppData/Local/Temp/opencode/create-event-build.log`.
- Final `npm test` — exit 1; 389 tests, 362 passed, 25 skipped, 2 failed. Calendar progressive-disclosure assertion updated for Create event. Remaining failures concern untouched existing working-tree paths: `test/admin-dashboard-ui.test.ts` expects a dashboard widget instance but finds zero; `test/no-instant-slicing.test.ts` flags `booking-filters.ts`, `calendar-range.ts`, `ethn-selection.ts` and `ethn-booking-read.ts`. Log: `C:/Users/JKsars/AppData/Local/Temp/opencode/create-event-tests.log`.
- Browser interactions, screen-reader behavior, HTTP integration, real multi-court race/rollback under PostgreSQL and hosted schema compatibility were not verified. Existing DB integration test skipped without separately configured disposable DBs. No production-readiness claim.
