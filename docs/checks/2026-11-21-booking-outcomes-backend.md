# Booking outcomes backend check

Scope: migration `0018_booking_outcomes.sql`, staff service and focused tests only. No API/UI, hosted DB, scheduler or production action.

Fresh local PostgreSQL 18 initialized and stopped by isolated test harness. Applied fresh chain `0001`–`0018` under local owner; runtime tests used restricted `ethn_checkout`. Focused `test/ethn-outcomes.test.ts`: pass, exit 0. Cases cover due-only completion, future/pending bookings, last-item end, allocations, current staff authorization including staff disablement serialization, no-show correction, stale expected value, reason auditing, and completed-only guard. Harness: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-finance/run-1795213861219`; server stopped successfully. Cron completion entry point was additionally exercised against the isolated database; empty retry returned zero without creating system audit rows.

`npx --no-install tsc --noEmit` did not pass repository-wide. Existing errors remain in `ethn-extensions.ts`, `ethn-sales.ts`, `ethn-walk-ins.ts`, and `test/ethn-sales.test.ts`; outcome-specific actor narrowing error was corrected after that run. Re-run typecheck after integration.
