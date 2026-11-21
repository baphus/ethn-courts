# Admin redesign: calendar, courts and staff

Scope: bounded UI slice, following the list-first pattern documented in `docs/admin-redesign-baseline.md` (Cal.diy reference; no code copied).

- Calendar keeps date navigation and occupancy visible; block entry opens from a dialog. Uncertain creation requires checking the refreshed calendar before retry.
- Courts retains the court list; creation opens in a dialog and preserves the same pending idempotency payload and owner retry guidance.
- Staff retains the access list; grant and row editing open a dialog for existing Auth accounts. Existing immediate-change confirmation and server error handling remain.
- Finance: expense entry moved into a dialog; pending expense has a resume banner. Expense correction remains in its existing details disclosure because its pending retry lives inside the mounted component.
- Sales: entry and owner correction moved into dialogs; the existing pending-request banner remains visible.
- Open Plays: event entry and edit moved into a dialog; existing version and conflict messages remain.
- Booking search keeps prominent search/status segments with advanced date filtering in a popover; activity filters use a labelled popover with active-filter count.
- Exception assessment opens in a focused wide dialog; attendance corrections use a short reason dialog with uncertain-outcome reload protection.
- Hours/timing show current summaries with explicit editors. Pricing is summary-first with a pricing sheet and separate payment dialog; official-instructions acknowledgement remains required.
- Browser push configuration is secondary disclosure, not a permanently expanded settings block.
- Existing payment master-detail and dedicated long walk-in/extension workflows remain; these were not replaced with tiny dialogs or functionally redesigned. Dashboard/inbox core read surfaces remain largely unchanged. This is progressive-disclosure coverage, not a claim every admin screen was rebuilt or visually accepted.

Final parent validation after all UI slices: `npm test` exit 0, 360 total / 334 passed / 26 conditional skips / 0 failures; `npx --no-install tsc --noEmit` exit 0; `npm run build` exit 0; `git diff --check` exit 0 with LF/CRLF warnings only. Added `test/admin-progressive-disclosure.test.ts` for labelled task entry points and uncertain outcome guards. Logs: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-admin-redesign-{tests,tsc,build}.log`. Focused calendar/staff test skips are not DB acceptance evidence. No browser, visual, keyboard or screen-reader verification was performed; rendered behavior remains unverified. No hosted services or database migrations were used.
