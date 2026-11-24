# ETHN cutover API

`GET /api/ethn/availability?date=YYYY-MM-DD` uses the configured Manila business-day anchor. Date is optional and defaults to the current operating date. Response is `no-store`:

```json
{"settings":{"version":"1","intervalMinutes":30,"minimumMinutes":30,"anchorMinutes":420,"horizonDays":30,"holdMinutes":10},"serverNow":"2026-11-19T20:00:00.000Z","operatingDate":"2026-11-19","date":"2026-11-19","configured":false,"message":"Payment or pricing is not configured.","merchant":null,"courts":[{"id":"1","name":"Court 1","windows":[{"opensAt":"2026-11-18T23:00:00.000Z","closesAt":"2026-11-19T19:00:00.000Z","hourlyRate":null}],"occupied":[{"startsAt":"2026-11-19T00:00:00.000Z","endsAt":"2026-11-19T01:00:00.000Z","state":"pending"}]}]}
```

Rates are decimal strings or null, never legacy fallback prices. IDs and settings version are strings. Instants are UTC ISO strings; windows and occupancy are half-open. Each booking range must fit one window. `configured=false` disables checkout when merchant or a displayed window rate is unset. Merchant is configured text, not a verified QR or GCash number; official payment instructions remain a launch gate. Invalid date returns 400 `INVALID_INPUT`; invalid configuration/schedule returns 503 `NOT_CONFIGURED`.

## Staff profile

Enabled staff and owners can edit their own display name from **Edit profile** in the staff portal header. `GET /api/auth/profile` returns the current `{userId, role, email, name}`. `PATCH /api/auth/profile` accepts only `{name}` (trimmed, 1–100 characters); a successful update returns `{ok: true, name}`. The sign-in email, account ID and staff role are unchanged. Both responses are private and uncached.

## Staff calendar and court blocks

Staff endpoints use enabled ETHN owner/staff identity and private `no-store` responses. `GET /api/ethn/admin/calendar?date=YYYY-MM-DD` accepts historical dates; response is `{date,serverNow,window,courts}` with booking/block interval DTO documented in `docs/ethn-calendar-block-contract.md`. It omits contact and payment data.

`POST /api/ethn/admin/blocks` accepts exact `{courtId,startsAt,endsAt,reason,kind}` (single block response) or `{courtIds,startsAt,endsAt,reason,kind}` (response `{blocks:[...]}`), where `kind` is `maintenance|private`. `courtIds` must contain 1–100 distinct active court IDs. Multi-court creation uses one transaction: any invalid court or overlap rejects all blocks; audit remains per court. Active blocks use shared court allocation exclusion. `DELETE /api/ethn/admin/blocks/:id` marks block released; repeats return 204. Apply `db/ethn/0015_court_blocks.sql` only through approved migration process. Local fresh-schema check does not approve hosted migration.

## Owner finance and expenses

`GET /api/ethn/admin/finance` and `/api/ethn/admin/expenses` are owner-only. Contract, data meaning, DTOs, validation, immutability and setup limits are in `docs/ethn-finance-contract.md`. Migration `db/ethn/0017_expenses.sql` requires approved migration process; never run against existing/hosted data without separate authorization. Finance reports only accepted booking collections by `received_at` Manila date, less recorded expenses; it excludes manual sales/extensions and is not formal accounting profit/revenue.

## Open Plays

`GET /api/ethn/admin/open-plays` and public `/open-plays` list unremoved events, including past sessions. Events with removed linked blocks or no confirmed linked allocations remain excluded. Staff can edit only future-starting events; past sessions remain available for review and removal.

## Retired legacy endpoints

The following methods return uncached `410 {"error":"RETIRED"}` without legacy database, auth or storage access:

- POST/DELETE `/api/holds`; POST `/api/holds/reclaim`, `/api/proofs/upload-url`, `/api/submit`.
- POST `/api/admin/bookings`, `/api/admin/bookings/proof-upload-url`, `/api/admin/bookings/:id/{approve,reject,refund,delete}`; GET `/api/admin/proofs/read`.
- POST `/api/admin/closures`, `/api/admin/courts`, `/api/admin/expenses`, `/api/admin/pricing`; POST/PUT `/api/admin/hours`; PATCH/DELETE `/api/admin/expenses/:id`, `/api/admin/hours/:id`, `/api/admin/pricing/:id`; PATCH `/api/admin/courts/:id`; DELETE `/api/admin/closures/:id`.
- POST `/api/admin/outbox/process`, `/api/admin/users`, `/api/admin/users/:userId/{deactivate,reactivate}`; DELETE `/api/admin/users/:userId`.

Other legacy reads remain legacy and may require Supabase. Unsupported legacy UI must not advertise these retired actions during cutover. Existing records and proof objects are not migrated or deleted by retirement.
