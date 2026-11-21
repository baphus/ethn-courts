# Prototype visual identity and fork feature preservation

Date: 2026-11-20

## Scope

Updated target per user: preserve all currently existing fork features and workflows while applying the prototype's logo, athletic display typography, deep navy/orange palette, compact customer navigation, dark operational panels, crisp cards and admin chrome. This is not a 99% pixel-parity target. Preserve real backend services and restrictions; prototype mock data and fake business actions are not copied. Local browser compare was attempted against an isolated copy only. The copy failed to compile due to filesystem-root dependency resolution; screenshots are error pages, not UI evidence.

Reference source (read-only): `C:/Users/JKsars/Documents/ETHN COURTS PROTOTYPE/components/ethn-app.tsx`, `app/globals.css`, `app/layout.tsx`, `public/Orange_Pickleball_with_Motion_Swooshes.png`.

## Implemented visual reach

| Surface | Current feature preserved | Visual treatment applied |
|---|---|---|
| Customer booking and checkout (`src/components/booking/ethn-booking.tsx`) | Live server availability and pricing, continuous range selection, checkout hold, configured GCash recipient, validated proof upload, payer details, submission, pending-review state and code/email tracking | Prototype logo in header, navy compact customer nav, athletic Bebas/Space display typography, dramatic navy/flame hero, broader layout, card treatment, dark structured footer. No fake calendar, totals, QR, or submitted reference added. |
| Staff shell (`src/components/admin/admin-shell.tsx`, `src/components/admin/admin-sidebar.tsx`) | Authenticated staff navigation, owner-only management links, responsive sidebar, theme, sign-out | Prototype logo, deep navy sidebar, orange icon highlights, softer card header and pale operational canvas. No mock admin screens or data added. |
| Shared typography (`src/app/layout.tsx`, `src/app/globals.css`) | Existing Plus Jakarta Sans body font retained | Added Bebas Neue and Space Grotesk local Next font pipeline and `.font-display` mapping following prototype font hierarchy. |

## Fork feature inventory and known gaps

Real active features remain in their existing routes/services: reservation availability/checkout/payment submission and private tracking; staff payment proof review/decision; authenticated exceptions, prepaid walk-in, settings, hours, staff access, users/activity according to their current routes. These feature surfaces were not exhaustively interaction-tested in this visual-only pass. Current routes that redirect/retire or are absent remain gaps, not silently filled with mock features: admin overview/dashboard, booking manager/calendar, courts, open-play management, sales/revenue/finance, notifications, and public Open Plays. See `docs/checks/2026-11-20-prototype-inventory.md` for fuller mapping and approved boundaries.

## Non-goals and safety limits

No cancellation, refund, reschedule, fake booking confirmation, unpaid confirmed walk-in, fabricated rates/payment merchant, fake proof/QR, fake open-play listings, or mock admin metrics. Do not restore retired RPC routes. Unavailable modules remain clearly outside current supported feature set; do not treat prototype placeholders as fork capabilities. Prototype location/contact copy is not copied where it conflicts with configured venue facts.

## Validation / evidence

- `npx --no-install tsc --noEmit`: passed after visual changes.
- Parent final `npm test` after latest visual edits: exit 0; 318 total, 309 passed, 9 conditional skips, 0 failed. Log `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-visual-final-tests.log`.
- Parent final `npx --no-install tsc --noEmit`: exit 0.
- Parent final `npm run build`: exit 0. Log `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-visual-final-build.log`.
- `git diff --check`: passed; Git emitted line-ending warnings for existing CRLF/LF normalization.
- Corrective browser run: isolated copies without `.env` or `.git`, linked existing dependencies, `next dev --webpack`, browser restricted to loopback. Both homepages returned 200 and rendered content. Prototype temp-only PostCSS was adapted to installed Tailwind 4 (original autoprefixer unavailable); reference source itself remains unchanged. Remote images blocked by browser allowlist, so screenshots do not verify photography.
- Screenshot directory `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-visual-completion`: `reference-desktop.png` and `reference-mobile.png` show reference mock; `before-current-desktop.png` and `before-current-mobile.png` show old actual app; `after-current-desktop.png` and `after-current-mobile.png` show updated actual app. Sizes 1440×900 and 390×844. `customer-desktop.png` is an earlier error-page capture, not evidence. Screenshots need parent visual review.
- Final corrective captures: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-visual-completion/final-desktop.png` (1440×900) and `final-mobile.png` (390×844). Isolated app returned HTTP 200; browser waited for fonts and image decode. Hero and player image natural widths both 940px; logo 1254px. Desktop document overflow check false. Images are exact public Pexels URLs used by prototype (`photos/37143606` and `photos/34618472`), downloaded to `public/prototype-hero.jpg` and `public/prototype-player.jpg`; no venue-identity claim implied. Browser restricted to loopback. Captures need parent visual review.
- Final mobile repairs: centered mark and keyboard-operable native disclosure navigation, stacked CTAs, tighter hero positioning, narrower copy. No fake events were introduced.
- Remaining differences: booking appears immediately after hero instead of mock Open Plays (intentional schedule-first priority); real Open Plays has unavailable notice, not invented listings. Real schedule uses per-court ranges instead of mock timetable; no court-profile cards or map image. Protected checkout and admin not visually verified. No percentage claimed.
