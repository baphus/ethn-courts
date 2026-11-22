# Court setup and payment instructions split — 2026-11-22

## What changed

- `/admin/courts` is now **Court setup**: all courts, each with its weekly windows and the hourly rate on each window, edited in place. Add court, rename, add window, and quick setup (one window applied to selected weekdays) open in dialogs. One "Save schedule" writes hours, rates and active flags atomically through `PUT /api/ethn/admin/hours`. Rename uses `PUT /api/ethn/admin/settings` with the rest of the snapshot unchanged. Court descriptions stay create-only; there is no description update endpoint.
- `/admin/hours` redirects to `/admin/courts`. `/admin/courts` was chosen as the surviving URL because the page is about courts, not hours.
- `/admin/settings` is now **Payment instructions** only: the GCash merchant text, saved through `PUT /api/ethn/admin/settings` with court names and rates sent unchanged. It also shows the read-only variant of the confirm-before-save checkbox already required by that endpoint.
- New `GET /api/ethn/admin/blocks` returns up to 50 upcoming unreleased blocks for a read-only "Upcoming closures" list on Court setup. Creating and releasing blocks remains on `/admin/calendar`.
- Deleted `court-manager.tsx`, `hours-editor.tsx`, `owner-pricing.tsx`, `hours-payload.ts` (moved to `courts/schedule-payload.ts`) and `test/owner-pricing-state.test.ts` (the reducer helpers it covered no longer exist). `test/admin-progressive-disclosure.test.ts` now guards the Court setup dialog entry point.
- Sidebar: "Courts" → "Court setup"; "Pricing settings" → "Payment instructions"; the separate "Court hours" item is gone.

## Decisions behind it

Matches the forked repo's information architecture: one Court Setup surface where a court, its windows and its rates sit together, with the fork's add-window, quick-setup and edit-court dialogs. The fork's paddle/ball rental rules and closure domain were **not** ported: ETHN has no paddle/ball booking line, and dated maintenance already lives in `court_blocks` on the calendar. Two scoped saves were kept rather than merging the two endpoints, so rates/windows stay one atomic transaction and payment text stays another.

## Verification (local only)

- `npx --no-install tsc --noEmit` — exit 0.
- `npm test` — 337 pass, 26 conditional skips, 0 fail (was 338 pass with the deleted reducer test).
- `npm run build` — exit 0; `/admin/courts` and `/admin/hours` build as expected.
- No browser pass was run; the request did not grant permission. Layout and dialog behaviour on a phone are unverified.

## Still open

- Real court rates and official GCash instructions remain unset, so public checkout stays `configured:false` with the placeholder merchant text.
- `src/app/admin/hours/hours-manager.tsx` is an unused fork-era component (not imported since the baseline commit) and was left in place here.
- Any hosted verification, deployment or migration remains unauthorized.
