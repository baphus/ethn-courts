# Owner staff management API

`GET /api/ethn/admin/staff` requires an enabled owner and returns every `ethn.staff_access` row:

```json
{"staff":[{"userId":"00000000-0000-4000-8000-000000000001","role":"owner","enabled":true}]}
```

Only `userId`, `role` and `enabled` are exposed; the API never lists Auth users, emails or other profile data.

`PUT /api/ethn/admin/staff` creates or updates one existing Auth user. Send JSON of at most 4096 UTF-8 bytes, with exactly these fields:

```json
{"userId":"00000000-0000-4000-8000-000000000001","role":"staff","enabled":true}
```

`role` is `owner` or `staff`. The user must already exist in the same ETHN Auth project; this endpoint does not create users, invite them, change passwords or delete membership. Disable with `enabled:false` instead. Success returns the stored record. Sending the current role and enabled state returns the record without writing or auditing.

An enabled owner must remain. Demoting or disabling the last enabled owner returns 409 `LAST_OWNER`, including a self-change. Self-changes are allowed while another enabled owner remains. Every real change writes one `staff.update` audit row with actor, target UUID, and old/new role and enabled state; no email or profile data.

Both operations require an enabled owner, use `private, no-store` responses, and PUT rejects a mismatched Origin. Errors: 400 `INVALID_INPUT`; 401 `UNAUTHENTICATED`; 403 `FORBIDDEN`; 404 `TARGET_NOT_FOUND`; 409 `LAST_OWNER`; 503 `Service unavailable`. Target existence is checked through the server-only Supabase Auth admin lookup backed by `ETHN_STORAGE_URL` and `ETHN_STORAGE_SERVICE_ROLE_KEY` (same ETHN project as private Storage); no new configuration or fallback is used.

## Transaction lock protocol

Membership writes take `ethn.staff_access` rows in ascending `user_id` order `FOR UPDATE` first, then the `ethn.settings` singleton `FOR UPDATE`, then re-read staff from a fresh snapshot under that mutex. Existing writers (`putSettings`, `putEthnHours`, owner pricing, payment decision) lock their own actor staff row before settings, so this order cannot form the settings-first cycle. The settings mutex is what serializes concurrent membership inserts (including the same new target), and it is held through the last-owner check, upsert and audit commit. It is not bumped, because staff changes do not alter the settings snapshot version.

A target row inserted by another membership after the initial locking scan can only be locked after settings, so a pricing edit racing that brand-new account can still deadlock. PostgreSQL aborts one side safely; this service retries a deadlock once, and a rejected attempt cannot commit a zero-owner state. Revisit if account creation becomes frequent.
