# Calendar UI check — 2026-11-21

- UI targets approved contract: GET `{date, serverNow, window: {startsAt, endsAt}, courts: [{id, name, active, intervals: [{id, startsAt, endsAt, state, kind, bookingId, guestName, blockId, reason}]}]}`; POST exact `{courtId, startsAt, endsAt, reason, kind}`; DELETE by block ID expects 204. Backend integration remains subject to parent verification.
- Calendar defaults to server operating date; displays returned window in Manila. All courts and returned intervals render, including inactive courts. Booking links only; release controls only for blocks. Mutations confirm and refresh; uncertain results are reported without optimistic removal.
- `node --import ./test/register-loader.mjs --test test/admin-calendar-ui.test.ts`: passed (1 test; Manila overnight conversion and date navigation).
- `npx --no-install tsc --noEmit --incremental false`: first run passed; second run failed in parallel backend work at `test/ethn-hours-validation.test.ts:54` (`oldHours` property absent). No calendar UI errors reported.
- Browser not used; responsive layout, accessibility, API integration and live mutation flows require authorized verification. No hosted access.
