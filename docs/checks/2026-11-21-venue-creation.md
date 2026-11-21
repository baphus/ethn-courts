# Venue creation slice verification

Scope: owner-only service and schema capability for creating/listing courts. API/UI/timing settings intentionally excluded.

- `node C:\Users\JKsars\AppData\Local\Temp\opencode\ethn-venue-verify.mjs`: exit 0; disposable local PostgreSQL cluster initialized, fresh migrations 0001–0017 plus 0024 applied, restricted `ethn_checkout`-role integration test passed, cluster stopped in finally.
- Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-venue/run-1795213598621/result.json` and `test.log`.
- `node --test --import ./test/register-loader.mjs test/ethn-venue.test.ts`: exit 0, test skipped because no `ETHN_VENUE_TEST_DATABASE_URL` configured in normal environment; integration test above supplies isolated DB.
- `npx --no-install tsc --noEmit`: blocked by existing errors outside this slice in `src/app/admin/walk-in/walk-in-form.tsx`, `src/lib/admin/ethn-outcomes.ts`, `src/lib/admin/ethn-sales.ts`, `src/lib/admin/ethn-walk-ins.ts`, and `test/ethn-sales.test.ts`. No diagnostics reference venue files.

No hosted database, migration, API/UI, browser or deployment touched. Existing dirty worktree belongs to parent scope; only four slice files added by this task.
