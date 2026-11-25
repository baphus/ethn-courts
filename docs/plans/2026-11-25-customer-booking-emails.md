# Customer booking emails

**Goal:** Send compact, status-first plain-text booking updates with ETHN Courts location and contact details.

**Architecture:** Keep the existing restricted SQL grants, `guest_email` column, transactional outbox, opt-in sender, and post-response drain. No migration, new endpoint, transport, or customer access path. Keep owner permissions, action eligibility, and audit writes unchanged.

1. `src/lib/mail/ethn-worker.ts`: render each event with the booked court/time ranges in Manila time, applicable amount and reference, private tracking (or venue contact), and directions only for confirmation. Validate recipients and links, preserve older online payloads, and never render cancellation/refund staff notes or transfer references. Update `test/ethn-decision-mail.test.ts` to capture all messages with a fake transport.
2. `src/lib/admin/ethn-internal-booking.ts` and `src/app/admin/bookings/new/new-booking.tsx`: add optional, server-validated `guestEmail` using the existing form field pattern; clear it after a successful booking. Queue staff confirmation in the booking transaction. Keep no-email request fingerprints compatible and include email changes in replay checks.
3. `src/lib/admin/ethn-booking-actions.ts`: queue cancellation/refund only after eligible mutations and only when an email exists. Verify an online tracking token against its stored hash before reuse. Do not notify on archive or create duplicate outbox rows on replay. Wire the existing best-effort drain in both staff route handlers after commit.
4. Extend the restricted SQL integration fixture to check persisted email, outbox rows, missing email, reference privacy and idempotency. Run focused Node tests and type check; disposable DB setup requires separate authorization. Do not send real mail, run migrations or drive a browser. Update `docs/ethn-mail.md` with behavior and remaining deployment prerequisites.
