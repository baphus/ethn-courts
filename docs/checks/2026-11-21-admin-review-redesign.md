# Admin review redesign check — 2026-11-21

## Changes in this batch

- Bookings: search remains prominent, status options are visible, and date filters use a draft popover with Apply and Clear. Existing abortable requests and pagination remain.
- Activity: filters move into a popover with an active count and clear action. Existing validation, read-only table and keyboard-accessible horizontal scrolling remain.
- Payment review already presents a queue beside selected details on desktop and stages decisions before confirmation; this batch did not alter payment handlers.

## Verification and limits

- `npx --no-install tsc --noEmit --incremental false` passed during concurrent work.
- Browser verification not performed, per instruction. Popover focus, mobile layout and keyboard use still need human verification.
- Booking row menu, booking detail/outcome controls, and exception review redesign remain outstanding. Payment mobile selection and confirmation were not redesigned in this batch.
