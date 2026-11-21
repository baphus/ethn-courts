# Local synthetic UI fixtures — 2026-11-21

**Synthetic component smoke only; not authentication, payment, production, or full workflow verification.** Isolated temporary copy excludes `.git` and `.env*`, uses existing dependencies and Next webpack. Temporary fixture route imports actual components without the authenticated admin layout. Browser allowlisted localhost; a local mock intercepts GET `/api/` requests and rejects mutation requests. Unknown API paths return 503. No real sign-in, payment, proof upload, database, or hosted calls were attempted. Server and named browser session closed; port 3197 had no listener after cleanup.

## Captures and checks

Populated synthetic dashboard, booking list, calendar, finance, activity, Open Plays, sales and inbox each rendered at 1440×900 and 390×844: 16 PNGs named `<view>-desktop.png` and `<view>-mobile.png`. Snapshots show the synthetic booking, calendar interval, expense, activity, event, sale and notification. At mobile width, document scroll width was 390 for all eight and for courts, timing, walk-in and extension; internal scroll regions were not audited. Additional mobile screenshots and snapshots show courts, timing, walk-in and extension. The earlier malformed-stub screenshots were overwritten where names overlapped; `extension-mobile.png` and `walkin-mobile.png` remain from the earlier invalid run and are not evidence. Use `extension-populated-mobile.png` and `walkin-populated-mobile.png` instead.

Empty fixture snapshots show no-bookings, no-occupancy, no-finance-activity/expenses, no-activity, no-open-plays, no-sales and no-notifications states. Courts, timing, walk-in and extension empty URLs retain fixture configuration and are not empty-state tests. Activity filter rejected `invalid` UUID and displayed “Enter a complete booking UUID.” This tests client validation only; fixture does not implement server filtering. Browser errors command returned no recorded errors after that interaction. No visual defect confirmed from these DOM/screenshot captures; screenshots were not visually reviewed.

Fixture DTOs reside at `C:\Users\JKsars\AppData\Local\Temp\opencode\ethn-fixture-smoke-1121\src\app\fixture\mock.ts`: synthetic dashboard counts/recent bookings; paginated bookings; calendar court/window/interval; finance totals/daily/components and expense rows; activity rows/actions; Open Plays, sales and inbox arrays; court and timing settings; availability and extension. Read-only stubs do not verify response correctness against server or exercise authorization. API DTO shapes were derived from current component declarations.

Artifacts and manifest: `C:\Users\JKsars\AppData\Local\Temp\opencode\ethn-fixture-smoke-1121\`. Initial `{}` stub attempt was invalid and is excluded from results.

## Not checked

No desktop empty-state captures, booking detail, homepage/reference comparison, full visual review, focus order, accessibility audit, search result filtering, export download, reservation/confirmation, or mutations. Screenshot capture and DOM width alone do not prove absence of clipping, console issues on every route, or functional correctness. Fixture uses simplified root layout without production fonts or admin shell, so layout differs from authenticated app.
