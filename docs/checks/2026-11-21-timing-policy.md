# Timing policy verification

- `node C:\Users\JKsars\AppData\Local\Temp\opencode\ethn-timing-verify.mjs`: exit 0. Disposable PostgreSQL, fresh migrations 0001–0017, 0024 and 0025; role owner/staff authorization, policy validation, optimistic stale version, active confirmed inventory rejection, no-op audit behavior, scoped grants verified. Cluster stopped in finally.
- Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-timing/run-1795214143107/result.json` and `test.log`.
- `npx --no-install tsc --noEmit`: only existing errors in `src/lib/admin/ethn-expense-corrections.ts` (BigInt literals below ES2020 target); no diagnostics in timing-policy files.
- Test includes live booking allocation but no separate court-block fixture or concurrent checkout race fixture; raw allocation query includes block rows, and settings mutex matches checkout lock sequence. No browser/UI run.

No hosted database, migration, browser, package change, or deployment.
