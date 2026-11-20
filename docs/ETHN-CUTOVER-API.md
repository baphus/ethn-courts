# ETHN cutover API

`GET /api/ethn/availability?date=YYYY-MM-DD` uses the configured Manila business-day anchor. Date is optional and defaults to the current operating date. Response is `no-store`:

```json
{"settings":{"version":"1","intervalMinutes":30,"minimumMinutes":30,"anchorMinutes":420,"horizonDays":30,"holdMinutes":10},"serverNow":"2026-11-19T20:00:00.000Z","operatingDate":"2026-11-19","date":"2026-11-19","configured":false,"message":"Payment or pricing is not configured.","merchant":null,"courts":[{"id":"1","name":"Court 1","windows":[{"opensAt":"2026-11-18T23:00:00.000Z","closesAt":"2026-11-19T19:00:00.000Z","hourlyRate":null}],"occupied":[{"startsAt":"2026-11-19T00:00:00.000Z","endsAt":"2026-11-19T01:00:00.000Z","state":"pending"}]}]}
```

Rates are decimal strings or null, never legacy fallback prices. IDs and settings version are strings. Instants are UTC ISO strings; windows and occupancy are half-open. Each booking range must fit one window. `configured=false` disables checkout when merchant or a displayed window rate is unset. Merchant is configured text, not a verified QR or GCash number; official payment instructions remain a launch gate. Invalid date returns 400 `INVALID_INPUT`; invalid configuration/schedule returns 503 `NOT_CONFIGURED`.

## Retired legacy endpoints

The following methods return uncached `410 {"error":"RETIRED"}` without legacy database, auth or storage access:

- POST/DELETE `/api/holds`; POST `/api/holds/reclaim`, `/api/proofs/upload-url`, `/api/submit`.
- POST `/api/admin/bookings`, `/api/admin/bookings/proof-upload-url`, `/api/admin/bookings/:id/{approve,reject,refund,delete}`; GET `/api/admin/proofs/read`.
- POST `/api/admin/closures`, `/api/admin/courts`, `/api/admin/expenses`, `/api/admin/pricing`; POST/PUT `/api/admin/hours`; PATCH/DELETE `/api/admin/expenses/:id`, `/api/admin/hours/:id`, `/api/admin/pricing/:id`; PATCH `/api/admin/courts/:id`; DELETE `/api/admin/closures/:id`.
- POST `/api/admin/outbox/process`, `/api/admin/users`, `/api/admin/users/:userId/{deactivate,reactivate}`; DELETE `/api/admin/users/:userId`.

Other legacy reads remain legacy and may require Supabase. Unsupported legacy UI must not advertise these retired actions during cutover. Existing records and proof objects are not migrated or deleted by retirement.
