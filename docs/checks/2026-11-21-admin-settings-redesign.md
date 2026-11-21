# Admin settings redesign — 2026-11-21

## Coverage

- Notifications: browser push controls moved to a secondary settings dialog; permission remains requested only by the Enable push button. Inbox remains independent of push.
- Court hours: weekly court summaries precede a wide editor containing the existing all-court atomic save.
- Timing: policy values precede an edit dialog; existing version and conflict handling remain.
- Pricing: not redesigned in this change.

## Validation and limits

No browser used. `npx --no-install tsc --noEmit` passed. `node --test --import ./test/register-loader.mjs test/owner-hours-payload.test.ts test/ethn-hours-validation.test.ts test/ethn-timing-policy.test.ts` passed five tests; one database-dependent timing test skipped. Push subscription and unsubscribe flows were not changed or exercised. Parent coordinates full suite and build.
