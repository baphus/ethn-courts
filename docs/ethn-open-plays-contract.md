# Open Plays backend contract (partial)

Migration: apply `db/ethn/0019_open_plays.sql` after `0017_expenses.sql` on a fresh ETHN chain. It is standalone after 0017; do not assume or require `0018_booking_outcomes.sql`.

`createOpenPlay(pool, verify, input)` accepts title, optional-empty description, informational decimal fee (including zero), UTC millisecond start/end, and a unique list of court IDs. It returns version `1`. Staff/owner authorization and all allocation changes share one transaction. The event must be future, within configured horizon, and wholly inside every selected court's posted hours; missing rate does not prevent an informational event. Active overlapping booking allocations and holds block creation; expired holds are expired under booking locks before inserting the linked blocks/allocations. Shared exclusion constraint arbitrates races.

`listPublicOpenPlays(pool)` returns unremoved event fields and court names, including past sessions (maximum 100). Events whose linked blocks were removed or whose confirmed allocations are no longer present remain excluded. It does not return allocation/block IDs, private reasons, staff identity, or internal event version.

`editOpenPlay(pool, verify, id, input)` takes the same fields as create plus integer `expectedVersion`. It locks actor, settings, courts and event in that order; rejects stale versions; validates all new allocations while old event allocations remain in place, then releases only its old linked blocks and inserts all new linked blocks within one transaction. Any conflict rolls back event metadata and old allocations unchanged. Success increments and returns `version`.

`removeOpenPlay(pool, verify, id)` tombstones event and linked blocks and releases only its confirmed allocations. It is idempotent; event and block audit history remains. It does not mutate booking/payment rows. Generic calendar block removal must reject blocks with `open_play_id`; route event removal through this service.

No HTTP route, UI, enrollment, seat reservation, payment, email, or scheduler is part of this slice. Next slice must add public/staff APIs and UI, update generic block removal guard, and add broader race coverage before calling module complete. The staff edit API must submit `expectedVersion`; successful mutation returns incremented version. Local tests require `ETHN_OPEN_PLAYS_TEST_DATABASE_URL` (restricted `ethn_checkout`) and `ETHN_OPEN_PLAYS_TEST_ADMIN_URL` (disposable local migration owner).
