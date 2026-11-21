# Calendar blocks verification

Implementation verification recorded 2026-11-21. Local-only; no hosted DB or browser.

## Commands and current evidence

- `node --test --import ./test/register-loader.mjs test/ethn-hours-validation.test.ts test/ethn-hours-block-validation.test.ts` — 7 passed.
- `npx --no-install tsc --noEmit` — passed.
- `npx --no-install tsc --noEmit` — passed.
- `node --test --import ./test/register-loader.mjs test/ethn-hours-validation.test.ts test/ethn-hours-block-validation.test.ts test/ethn-calendar-blocks.test.ts` — pure hours tests passed; integration test is conditional/skipped without disposable DB variables.
- PostgreSQL 18.2 disposable harness: fresh chain 0001–0015 passed; populated 0014→0015 preserved booking and allocation; block DB test passed 1/1 under restricted `ethn_checkout`; process stopped. Test asserts enabled staff/owner, disabled denial, strict overlap, adjacency, checkout-vs-block one winner, stale hold expiry, future/horizon rejection, release idempotency/audit-once, calendar DTO, and restricted DELETE/column-update grants. Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-calendar-blocks/run-1795206745830/result.json` and `test.log`.
- Parent final regression initially caught ISO-date slicing in UI date navigation; replaced it with existing `manilaDateStr` helper. Fresh `npm test`: exit 0, 326 total / 315 passed / 11 conditional skips / 0 failures. `npx --no-install tsc --noEmit`: exit 0. `npm run build`: exit 0. Logs `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-calendar-blocks/final-tests.log` and `final-build.log`.
- Not tested: lock-wait clock expiry, hours service DB integration with block, public availability privacy, all booking decision/submission paths, hostile cross-ownership FK/XOR attempts, and HTTP route handlers. Hosted database remains untouched. Calendar/block core is implemented; these acceptance gaps remain, not production-readiness evidence.
