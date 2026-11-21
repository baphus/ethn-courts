# Pricing redesign check — 2026-11-21

- Summary shows configured payment instructions, court names, status, hours and rates, plus read-only booking rules. Pricing opens in a scrollable sheet; payment opens in a dialog. Both retain explicit merchant acknowledgement and the existing full-payload save and version handling.
- Dirty close asks before discarding; busy close is blocked. Conflict and uncertain network outcomes keep the editor and inputs available, disable saving and require an explicit reload. Error remains visible if the editor closes.
- Interaction direction follows the summary-first / focused edit baseline in `docs/admin-redesign-baseline.md`, informed by [Cal.diy booking view at ae027bb](https://github.com/calcom/cal.diy/blob/ae027bb70e694e2d2c44569f398d6cbcee0389b1/apps/web/modules/bookings/views/bookings-view.tsx) (MIT); no code copied.
- `npx --no-install tsc --noEmit`: passed.
- `node --import ./test/register-loader.mjs --test test/owner-pricing-payload.test.ts test/owner-pricing-state.test.ts`: passed (2 tests). These cover payload preservation and queued state updates, not dialog interaction.
- No rendered or browser verification performed. Keyboard focus, responsive layout, close confirmation and save/error flows require user or separately authorized browser verification. Parent runs final suite/build after all writers.
