# Owner staff management — local evidence

2026-11-20. Implemented owner-only staff listing and create/role/enabled management. No hosted writes, migrations, browser runs, Auth user creation, invites, password changes or deployment in this batch.

## Implemented

- `ethn.staff_access` was readable and had a narrow `enabled` update from the payment-decision migration, but no insert/role grant. `0011_staff_access.sql` adds INSERT (`user_id`, `role`, `enabled`) and UPDATE (`role`, `enabled`) plus insert/update policies for the restricted `ethn_checkout` role. No DELETE. RLS still does not authorize a human; the service checks an enabled owner.
- `src/lib/admin/ethn-staff-management.ts` lists all rows for an owner and creates/updates one existing Auth user. Strict input is exactly `userId` UUID, `role` owner/staff and boolean `enabled`. Target existence is resolved by an injected lookup outside SQL; production passes the server-only Supabase Auth admin `getUserById` using the existing `ETHN_STORAGE_URL`/`ETHN_STORAGE_SERVICE_ROLE_KEY` pair. No fake flag and no new configuration.
- PUT locks all existing staff rows in ascending `user_id` order before the `ethn.settings` singleton, then recomputes from a fresh read under the mutex. This matches the existing actor-staff-row-before-settings order instead of the settings-first protocol that would deadlock with pricing/hours editors. Concurrent membership inserts serialize on the settings mutex and are re-read before the last-owner check. Last-owner rejection, including self-demotion/self-disable, rolls back; self-change is allowed while another enabled owner remains. Real changes are upserted and audited (`staff.update`) with actor, target UUID and old/new role/enabled only. A no-op returns the record with no write and no audit. The settings version is unchanged.
- `GET/PUT /api/ethn/admin/staff` uses strict 4096-byte JSON, origin guard and private/no-store responses. GET is owner-only and returns only `userId`, `role`, `enabled`; it never lists Auth users. Errors map 400 `INVALID_INPUT`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `TARGET_NOT_FOUND`, 409 `LAST_OWNER`, 503 `Service unavailable`. Contract: `docs/ethn-staff-api.md`.
- A target row inserted after the initial locking scan can deadlock with a pricing edit racing that new account; PostgreSQL rollback is safe and the service retries a deadlock once. This rare path is documented and remains a known limitation.

## Actual local verification

PostgreSQL 18.2 disposable loopback SCRAM cluster, actual migrations `0001`–`0011`, restricted `ethn_checkout` login, fresh empty database:

- Validation, unauthenticated and non-owner/disabled-owner denial, target-not-found via injected lookup, and owner GET shape without profile data.
- Insert, promotion, no-op without audit, audit old/new fields, disabled staff cannot act, and self-demotion allowed only while another enabled owner remains.
- Last enabled owner cannot demote or disable self (`LAST_OWNER`).
- Two concurrent self-demotions of the two remaining owners: exactly one committed, one `LAST_OWNER`, one enabled owner remained.
- Eight pricing-edit versus self-demotion races: membership always committed; pricing either committed first or was denied after the actor was demoted; no deadlock escaped and no zero-owner state occurred.
- All writes ran as the restricted role, exercising the new grants and RLS policies.

Logs: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-staff-management` (`run.ps1`, `migrations.log`, `test.log`, `statuses.txt`).

## Checks run

- New conditional case: 1 passed against the disposable database above.
- `npm test`: 316 total, 308 passed, 0 failed, 8 conditional database cases skipped by default.
- `npx --no-install tsc --noEmit`: exit 0.
- `npm run build`: exit 0, including `/api/ethn/admin/staff`.

## Remaining gates

`0011_staff_access.sql` is not applied to any hosted project. No browser/UI verification, real Auth-user creation, invitation flow or staff deletion exists in this slice. Production Auth/Storage project alignment, hosting/pooling and a reviewed migration plan remain separate gates. Local results are not deployment approval.
