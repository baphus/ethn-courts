# Owner hours — partial hosted/browser verification

2026-11-20. Migration 0010 applied to approved disposable Supabase project tgvdukmhnsnsqhokbwbn. This is partial evidence, not full browser acceptance.

## Established

- Verified owner TLS and guarded migration detection (absent vs fully present; partial state aborts).
- Restricted ethn_checkout hours INSERT/DELETE and identity-sequence access exercised in transaction and rolled back.
- Actual hosted Auth owner login and /admin/hours page loaded.
- Browser court deactivation with a live held booking returned conflict; DB activity/version/hold remained unchanged.
- Browser removal of an empty court's weekly window and deactivation saved successfully; 13 windows and inactive empty court verified in DB. Existing held item amount unchanged.

Successful valid-save evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-hours-hosted/run-1795170823371/result.json`. Other attempts recorded in sibling run directories.

## Not established

Stale-version/reload and separate staff browser denial did not complete in this batch. Native time filling, checkbox action syntax and confirmation timing caused harness failures. Later enabled-save wait timed out; exact product-versus-harness cause remains unresolved. No app fix was applied or feature declared fully verified. Prior actual local PostgreSQL tests separately cover staff denial, stale version, live/expired holds and checkout/edit races; they do not replace missing browser evidence. No new accessibility result claimed.

## Cleanup

Each run closed owned browser/Next processes and removed temporary Auth users/staff rows, hold/item/allocation/idempotency/audit fixtures. Guarded restoration returned original weekly windows, active status, rates and merchant. Version was advanced, not reset; final reported version **28**. Hours-row identity IDs necessarily changed during replacement/restoration; stale pricing forms must reload. Test-only configuration never became approved venue values. Schema/migration 0010 retained as authorized.

Final attempt evidence: `.../ethn-hours-hosted/run-1795170958529/result.json`; exit 1 (verification incomplete), cleanup passed. Remembered owner credential forgotten afterward.

Next: diagnose browser harness input/confirmation state locally without more hosted churn; rerun only missing stale/staff cases once reliable. No deployment or production schedule changes authorized by these checks.
