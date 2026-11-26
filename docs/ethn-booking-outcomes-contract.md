# ETHN booking outcomes

`POST /api/ethn/admin/outcomes` accepts `{ "action": "complete", "bookingId": "<uuid>" }` from an enabled Owner. The booking detail modal exposes the action for a confirmed booking after its last reserved slot ends, including confirmed historical extensions. Held or pending extensions block completion until reconciled. The server rechecks eligibility under the shared court locks using the database clock; ineligible bookings return `409 NOT_READY_TO_COMPLETE`.

Completion changes only the selected booking and its confirmed allocations, and writes one `booking_completed` audit row. Repeating a successful request returns `changed: false` without another audit. Payments and booking history remain intact.

The former `/api/cron/ethn-operations` endpoint returns `410 RETIRED`. Ended pending bookings remain in payment review; approval remains blocked, and the Owner can reject after checking the proof and reconciling any money received. Ordinary checkout hold expiry and existing inline extension hold cleanup are unchanged.

`setNoShow` requires a completed booking, `noShow`, `expectedNoShow`, and a trimmed reason of 1–500 characters. Expected current value prevents stale overwrites. Changes record the old and new values and reason in `ethn.audit`; repeating the same value does not create an audit. No payment, refund, allocation, or reservation changes occur. Both operations recheck current Owner access inside their write transaction.
