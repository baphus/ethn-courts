# ETHN booking alerts

An on-time online submission with proof, confirmed booking (online approval or direct internal creation), cancellation (staff or scheduled), or recorded external refund creates one persistent inbox alert per enabled Owner in the same SQL transaction. Enabled Owners currently hold all booking-review access. Checkout holds, rejections, archive actions and routine completions do not alert. Retries do not duplicate notices; old rows remain readable without backfill. Owner alerts are in-app only.

`GET /api/ethn/admin/notifications` returns the recipient’s latest 50 alerts, optionally unread only. Booking alerts join the authenticated booking summary at read time: customer name, email and phone if available, booking reference/date, original court slots with durations, rates and subtotals, payment method when available, booking total and recorded refund amount where applicable. This is not a historical snapshot. Proof links, tracking tokens and payment references are excluded. Read status is personal and independent of payment review. Opening a booking from the inbox marks its alert read. Retired exception alerts remain excluded.

Browser push is not sent for these alerts.
