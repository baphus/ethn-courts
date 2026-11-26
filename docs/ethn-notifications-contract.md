# ETHN booking alerts

A successful online booking submission or a staff-created confirmed booking records one inbox alert and queues one owner email per enabled owner, in the same SQL transaction as the booking. Checkout holds, late/failed submissions, extensions and status changes do not create new-booking alerts. Idempotent booking retries do not send a second alert. Existing inbox rows are preserved; there is no historical backfill or separate reconciliation job.

`GET /api/ethn/admin/notifications` shows the current owner's latest 50 alerts, with an optional unread-only filter. `GET /api/ethn/admin/sidebar-counts` returns all pending bookings and the current owner's total unread alerts. The list and sidebar refresh about once a minute while visible. Single and bulk mark-read operations are recipient-scoped and idempotent. Retired exception alerts stay excluded from the list and counts.

Alerts link to authenticated booking details without exposing private customer or payment information. Owner email uses the existing ETHN mail outbox; see [ETHN mail](ethn-mail.md). Optional browser push remains separate and does not control whether alerts appear in the inbox.
