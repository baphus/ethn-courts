# ETHN timing policy

Owner-only `GET/PUT /api/ethn/admin/timing`; runtime authorization is rechecked in SQL. DTO and PUT body are exactly `{version,intervalMinutes,minimumMinutes,anchorMinutes,horizonDays,holdMinutes}`. Version is optimistic; stale write returns HTTP 409 `STALE_VERSION`.

Constraints: interval 30 or 60 minutes; minimum 1–1440 and multiple of interval; anchor 0–1439 minutes; horizon 1–365 days; hold 1–60 minutes. Proposed anchor is checked against each court's configured weekly windows with `scheduleWindows`; invalid schedule returns 400 `INVALID_SCHEDULE`.

Any actual policy change is rejected with HTTP 409 `ACTIVE_INVENTORY` while any future allocation exists in pending/confirmed state, or a held state whose expiry is future (or absent). This reads raw allocations, covering booking and block allocations without relying on extension shape. Completed/past allocations do not block. Lock sequence is staff row, singleton settings row, then all courts in ID order; checkout uses settings then courts, serializing writes safely. Successful changes increment shared settings version and write `timing.update` audit; unchanged values do not increment/audit.

Migration `db/ethn/0025_timing_policy.sql` grants only timing-column updates to `ethn_checkout`; it does not grant merchant/rate edits. Apply only on fresh ETHN chain after 0001–0017 and 0024. Existing/hosted databases need separate approved migration plan. UI at `/admin/timing`; no navigation/sidebar changes in this slice.
