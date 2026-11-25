# ETHN booking outcomes

Apply `db/ethn/0018_booking_outcomes.sql` only to fresh ETHN schema after `0017_expenses.sql`, or through a separately reviewed existing-database migration. No migrations were run against a hosted database.

`completeDueBookings` is staff-only and completes at most 50 confirmed bookings whose latest booking-item `ends_at` is no later than the database clock. It locks current enabled staff, then all courts in ID order, then due bookings; it changes only confirmed allocation rows belonging to those bookings and writes one audit row per completed booking. Repeating call has no duplicate completion audit. Staff may invoke on demand.

`GET /api/cron/ethn-operations` runs bounded completion and cancels up to 50 pending bookings per run once their last court slot ends. The cancellation and allocation updates share the court lock used by payment approval, which also rejects approval after the last slot ends. Cancellation records one `booking.cancel` audit by `system:cancellation` and preserves payment claims and proofs. It does not issue a refund or send a cancellation email. The endpoint requires `CRON_SECRET` and returns `completed` and `cancelled` counts. Apply the pending-cancellation schema upgrade before deploying; actual timing depends on the deployed scheduler.

`setNoShow` requires a completed booking, `noShow`, `expectedNoShow`, and trimmed reason of 1–500 characters. Expected current value prevents stale overwrites; setting same value is an audited no-op-free response. Actual changes store old/new value and reason in `ethn.audit`; no payment/refund, allocation, or reservation change occurs. Both operations lock and recheck current enabled staff inside their write transaction so staff disablement serializes against writes.

`no_show` is distinct from booking/payment status. Runtime DB login remains restricted; application verifies per-user staff identity and authorization. Grants do not authorize users by themselves.
