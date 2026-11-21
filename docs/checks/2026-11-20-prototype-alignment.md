# Prototype alignment slice

## Reference

Read-only visual source: `C:/Users/JKsars/Documents/ETHN COURTS PROTOTYPE/app/globals.css` (navy `#16384d`, bay `#1f4e6b`, orange `#f28500`, cream `#f6f8f8`, ink `#17252e`) and `components/ethn-app.tsx` (customer header, hero, booking surface and card language). Prototype's mock dates, pricing, accounts, payments, routing and fake booking state were not reused. Plan authority: `docs/plans/2026-11-19-ethn-fork-plan.md` §§52, 73, 96-97.

## Changed, compared against reference sections

- `src/app/globals.css`: align public theme tokens with prototype `app/globals.css` root palette; admin theme tokens remain separate.
- `src/components/booking/ethn-booking.tsx`: adapts real ETHN single-page schedule/checkout/tracking rather than prototype's mock wizard. References: prototype `components/ethn-app.tsx` `CustomerHeader`/`HomePage`/`Timetable` (lines 53, 62-83), `WizardProgress`/`BookingFlow`/`Summary`/`Payment`/`Complete` (91-96), and `ContactPage`/`CustomerFooter` (55-58). Current schedule gets branded intro, two-column court cards and selection/total panel; checkout gets branded total/deadline panel; tracking form gets booking-updates section. Existing server availability, range validation, checkout creation, exact frozen amount, strict deadline, upload validation/private proof, submit and safe tracking behavior retained.
- `src/app/checkout/track/[token]/page.tsx`: branded compact customer header/status heading/footer around existing safe server-rendered tracking details.

## Boundaries

No service/API/database/auth/admin files changed. No unconfigured rates, merchant details, or contact details introduced. Existing configuration message and null-rate handling retained. No browser, automation, screenshot, hosted service or real customer data used. Visual browser acceptance explicitly not performed.

## Checks

- `npm test`: exit 0; 318 total, 309 passed, 0 failed, 9 skipped (conditional database tests).
- `npx --no-install tsc --noEmit`: exit 0.
- `npm run build`: exit 0.
