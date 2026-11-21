# Walk-in reservation before payment verification

Local-only verification, 2026-11-21. No hosted DB, browser, hosted migration execution, or deployment. Fresh local schema installation is recorded below.

## Result

- Fresh disposable local PostgreSQL harness: `node C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-finance/verify-walkin.mjs` exit 0.
- Harness applies fresh schema 0001–0017, 0021, 0023 to a throwaway database, runs the focused test with restricted `ethn_checkout` login, and stops its PostgreSQL cluster in `finally`.
- Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-walk-in-holds/run-1795215147234/{result.json,test.log}`.
- `npx --no-install tsc --noEmit` produced no diagnostics for walk-in service, route, UI, or test files. Other project diagnostics were not evaluated here.

## Focused database coverage

Staff auth and input validation; reserve creates a held booking/allocation with no payment; overlap rejection; wrong-staff cannot confirm; amount mismatch leaves hold intact; atomic cash and GCash confirmation; idempotency replay and mismatch; frozen quote survives current rate/merchant changes; expired hold cannot collect; live checkout blocks reserve and expired checkout is expired before reservation; concurrent same-key confirmation produces one booking/audit; revoked staff cannot replay.

No live money transfer was performed. Hold expiry is checked using database clock; test advances expiry using disposable admin connection.
