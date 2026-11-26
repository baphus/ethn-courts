# Owner Access API

`/admin/owner-access` replaces `/admin/staff`, which redirects to the new page. The former `GET` and `PUT /api/ethn/admin/staff` return `410 Gone`.

`GET /api/ethn/admin/owner-access` requires an enabled Owner and lists Owner memberships, including disabled Owners. It does not list former Staff, Auth profiles, or email addresses.

```json
{"owners":[{"userId":"00000000-0000-4000-8000-000000000001","enabled":true}]}
```

`PUT /api/ethn/admin/owner-access` accepts JSON up to 4096 UTF-8 bytes with exactly `userId` and `enabled`. It returns the stored `{userId, enabled}` record. The user must exist in the same ETHN Auth project. The route does not create accounts, send invites, change passwords, or delete memberships. Granting access to a former Staff account is an explicit Owner grant; revoking a former Staff membership leaves its historical row unchanged.

At least one enabled Owner must remain. Owners may disable their own access only if another enabled Owner remains. Identical writes are no-ops; each actual change retains the `staff.update` audit action for continuity, with actor, target and old/new role and enabled state. All responses are private/no-store. PUT checks Origin, authenticates and authorizes before looking up the target in Auth, and checks authorization again inside the transaction. Errors: 400 `INVALID_INPUT`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `TARGET_NOT_FOUND`, 409 `LAST_OWNER`, 503 service unavailable.

Membership writes lock access rows by ascending `user_id` before the settings singleton, then re-read membership under that mutex. The settings version is unchanged. A new-row lock can race another writer after the initial scan; the service retries one PostgreSQL deadlock and never commits a zero-Owner state.

See [migration instructions](ethn-drizzle-migrations.md#owner-roster-review) for the prior Staff promotion migration and forward-only review gate.
