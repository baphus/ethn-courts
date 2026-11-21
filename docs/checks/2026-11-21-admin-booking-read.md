# ETHN admin dashboard and booking reads

Backend implementation added for staff-only dashboard, search, and detail endpoints. No UI changes, production access, browser checks, or DB migration execution performed.

## DTOs

- Dashboard: `{ operatingDate, counts: { held, pending, confirmed, completed, expired, pendingReviewOverdue }, recentBookings }`.
- Summary: `{ id, guestName, status, operatingDate, createdAt, total, itemCount }`.
- Search: `{ rows, page, limit, total }`.
- Detail: `{ id, operatingDate, status, expiresAt, total, guestName, guestEmail, guestPhone, createdAt, items: [{ courtId, courtName, startsAt, endsAt, durationMinutes, hourlyRate, amount }], payments: [{ id, method, status, claimedAmount, claimedReference, receivedAt, verifiedAt, collectedAmount, acceptedReference, reviewedAt, reviewReason, proofAvailable }] }`. Payment timestamp fields are ISO strings or `null`; payment rows are explicitly mapped, never returned raw.

`pendingReviewOverdue` means pending booking with earliest item start at or before DB time; never inferred from `expires_at`. `held` excludes expired holds. Dashboard status counts use current operating date; recent list uses all dates.

## Verification

- `node C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-admin-booking-read/verify.mjs`: exit 0; disposable local PostgreSQL 18.2, fresh migrations `0001`–`0014`, restricted `ethn_checkout`; test exit 0, 2 passed, 0 skipped. Cluster stopped in finally. Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-admin-booking-read/run-1795193365650/{result.json,test.log}`.
- Integration coverage: owner/staff authorization and denied staff before data reads; current operating date; expired holds; future-start vs overdue pending; literal statuses; escaped `%` filtering, date bounds, tracking-code prefix, pagination; safe DTO redaction; nullable-safe ISO payment date output; walk-in/exception payment state; missing detail; narrow grants and restricted role flags. No DB writes by services; test fixture populated through disposable admin connection.
- `node --test --import ./test/register-loader.mjs ./test/ethn-booking-read.test.ts`: full DB run in harness above.
- Parent final reconciliation corrected test null narrowing and replaced date-to-ISO slicing with explicit UTC calendar component validation. Fresh restricted-DB harness exit 0; 2 tests passed, 0 skipped; cluster stopped. Evidence `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-admin-booking-read/run-1795193633949/`.
- Parent final `npm test`: exit 0, 320 total, 310 passed, 10 conditional skips, 0 failures. `npx --no-install tsc --noEmit`: exit 0. `npm run build`: exit 0. Logs `final-tests.log` and `final-build.log` in the same temporary parent. UI/backend DTO reconciled; browser and hosted acceptance remain unverified.
