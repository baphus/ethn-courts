# Open Plays API and UI integration — 2026-11-21

- Public API and page use the bounded public service DTO; staff GET checks access before listing. Staff mutations use origin checks and service authorization; create reads bounded JSON.
- Staff page creates and removes events, with Manila dates/times, active courts, informational fee and removal confirmation. Listing includes upcoming and ongoing events only; no history, editing, registration or payment.
- `npx --no-install tsc --noEmit --incremental false`: failed in concurrent `test/ethn-sales.test.ts` changes, TS18048 at 14:69, 14:117, 21:69, 21:117; no Open Plays errors reported.
- `node --test --import ./test/register-loader.mjs test/ethn-open-plays.test.ts`: one database test skipped; disposable DB not configured.
- Edit slice: staff PUT uses bounded JSON, origin validation and `editOpenPlay`; stale versions return `STALE_OPEN_PLAY` / 409. Staff form loads actual court IDs and version, preserves entries on conflict, and offers reload via Edit. Public DTO now includes court IDs and version, not staff or block metadata. Ongoing events may be listed, but backend requires edits to start in the future.
- Edit slice typecheck: `npx --no-install tsc --noEmit --incremental false` passed. Focused DB test skipped again without disposable DB; DTO assertions updated.
- Browser not run; no permission. Routes and UI have not been exercised against a configured backend. Generic calendar block guard remains parent-owned.
