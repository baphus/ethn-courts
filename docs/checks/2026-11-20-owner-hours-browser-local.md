# Hours stale/reload browser verification — local fixture

2026-11-20. Verification-only follow-up; no application or hosted changes.

The actual HoursEditor component ran in an isolated temporary local fixture app, with explicit mocked owner-hours GET/PUT responses. This is not hosted authentication or PostgreSQL integration evidence.

Passed through actual browser interactions:
- Initial version 1, rate 100.00, active court; Save disabled.
- Rate changed to 101.00 and court toggled inactive; Save enabled.
- Save opened native confirmation; accepted dialog.
- Captured PUT contained version 1, edited rate and inactive status.
- Mock STALE_VERSION response preserved both edits and disabled Save.
- Explicit Reload opened discard confirmation; after acceptance, GET version 2 restored rate 100.00 and active status.

Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-hours-browser-local/result.json`, `payload.json`, `verify.mjs`. Browser and owned server closed.

Earlier CLI open timeout came from captured output pipe remaining open; file redirection resolved that harness issue. Previous hosted disabled-Save/no-dialog behavior did not reproduce; root cause remains unresolved. No product fix justified by this run.

Not checked: native time-input editing, rapid-change reproduction, actual hosted stale-version/reload and staff browser denial. Staff authorization has separate actual local database evidence; earlier hosted owner save/conflict checks remain valid as recorded in `2026-11-20-owner-hours-hosted.md`. Do not combine fixture behavior with those checks to claim full hosted browser acceptance.
