# Dashboard and booking UI — 2026-11-21

- Added staff dashboard, booking search and read-only detail, using private ETHN endpoints with no-store requests. Dashboard counts represent the current operating date; recent bookings span dates. Booking totals are not revenue.
- Search resets pagination on filter changes and aborts stale requests. Detail separates claimed and collected amounts. Private proof links use the existing staff gate and are offered only when the safe DTO reports an attached proof on the sole payment.
- Detail payment DTO uses `id`, `method`, `status`, `claimedAmount`, `claimedReference`, `receivedAt`, `verifiedAt`, `collectedAmount`, `acceptedReference`, `reviewedAt`, `reviewReason`, and `proofAvailable`; nullable payment dates are ISO strings. Confirmed camelCase mapping in parallel backend source.
- `npx --no-install tsc --noEmit --incremental false`: passed after backend source update. No browser, full suite, build, database, hosted service or real authentication used. Parent owns integration validation; typecheck does not establish DTO or database behavior.
