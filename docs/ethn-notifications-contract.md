# ETHN booking alerts

An on-time online submission with proof, confirmed booking (online approval or direct internal creation), cancellation (staff or scheduled), or recorded external refund creates one persistent inbox alert per enabled Owner in the same SQL transaction. Enabled Owners currently hold all booking-review access. Checkout holds, rejections, archive actions and routine completions do not alert. Retries do not duplicate notices; old rows remain readable without backfill. Existing new-booking owner email remains separate and unchanged.

`GET /api/ethn/admin/notifications` returns the recipient’s latest 50 alerts, optionally unread only. New booking alerts join the authenticated booking summary at read time: customer name, reference, original court slots, and booking total or recorded refund amount. This is not a historical snapshot. Contact info, proof links, tracking tokens and payment references are excluded. Read status is personal and independent of payment review. Opening a booking from the inbox marks its alert read. Retired exception alerts remain excluded.

Browser push carries generic review alerts only and does not control inbox availability. See [ETHN push](ethn-push.md).
