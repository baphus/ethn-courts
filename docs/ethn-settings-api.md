# Owner pricing settings API

`GET /api/ethn/admin/settings` returns an enabled owner's consistent snapshot: `version`, `merchant`, `intervalMinutes`, `minimumMinutes`, `anchorMinutes`, `horizonDays`, `holdMinutes`, and `courts`. Each court includes `id`, `name`, `active`, and `hours`; each hours entry includes `id`, `weekday`, `opens`, `closes`, and `hourlyRate`. IDs and version are decimal strings; rates are decimal peso strings or null. Schedule, activity and timing fields are read-only.

`PUT /api/ethn/admin/settings` accepts only:

```json
{"version":"1","merchant":null,"courts":[{"id":"1","name":"Court 1","rates":[{"hoursId":"1","hourlyRate":"100.00"}]}]}
```

Supply every existing court and each of its existing hours exactly once. IDs and version are canonical positive bigint strings. Names are trimmed, unique, 1–100 characters; merchant is null or trimmed 1–2000 characters. Rates are null or nonnegative exact numeric(12,2) decimal strings. Null disables the affected checkout configuration. PUT increments version even if values do not change; it returns `{"version":"2"}`. Existing booking, item and payment snapshots remain unchanged.

Responses are private and no-store. PUT requires JSON at most 64 KiB and the shared origin check. Invalid input returns 400, missing identity 401, unauthorized owner or origin 403, stale version or name collision 409, and other failures 503. Owner authorization is checked against current staff access; the shared database role is not human authorization. Audit records actor, changed IDs and versions, not merchant or names.

Migration `db/ethn/0009_owner_pricing.sql` follows 0001–0008 on a fresh ETHN database. Applying it to an existing database requires a separately approved migration plan. No UI, deployment, or launch approval is implied.
