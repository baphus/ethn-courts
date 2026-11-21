# ETHN audit read contract

Implemented owner-only `GET /api/ethn/admin/activity`. Audit table is `ethn.audit(id bigint, booking_id uuid nullable, actor text, action text, detail jsonb nullable, created_at timestamptz)`. Migration `db/ethn/0016_audit_read.sql` grants only named-column SELECT to `ethn_checkout` and adds SELECT RLS policy. Runtime owner authorization remains mandatory. Migration is for fresh chain or separately reviewed upgrade; never run against existing data without approval.

Authorization requires a currently authenticated, enabled `owner` row in `ethn.staff_access`; disabled/staff/unknown identities are denied before audit data access. Responses private, no-store.

## Query and response

`GET /api/ethn/admin/activity?from=YYYY-MM-DD&to=YYYY-MM-DD&action=<allowlisted-action>&q=<booking-UUID-or-action>&page=1&limit=20`

- `from` inclusive, `to` inclusive, both optional; strict real `YYYY-MM-DD`, reject duplicates, malformed dates, `from > to`, or range over 93 calendar days when both supplied. Filter `created_at` by Manila calendar day (not booking operating date), using `[Manila midnight(from), Manila midnight(to + 1 day))`; document this distinction. No implicit current-day filter.
- `action` is one exact action from static list below; reject unknown/duplicate parameter. `q` max 36 ASCII chars; accept only a complete canonical UUID (search `booking_id`) or exact allowlisted action (search `action`). No substring search over actor/detail/JSON.
- `page` positive decimal integer, default 1, max 1000; `limit` positive decimal integer, default 20, max 50. Reject duplicate, signs, whitespace, decimals, overflow. Stable order `created_at DESC, id DESC`. Count and page query share filters/snapshot. Page cap bounds deep-offset work to at most 50,000 rows.
- Return `{rows, page, limit, total, actions}`. `actions` is the static allowlist, never derived from DB. Each row `{id:string, occurredAtISO:string, action:string, label:string, actorLabel:'Staff'|'Customer'|'System', actorId:string|null, bookingId:string|null, summary:string, detail:object}`. Bigint `id` is decimal string; timestamps UTC ISO; UUIDs canonical strings. No raw actor/detail and no database error text. Unknown actions map to action `unknown`, label `Activity`, summary `Recorded activity`, detail `{}`.
- Keep queries parameterized; `q` UUID searches only `booking_id`; exact action search filters action. `no-store`, appropriate origin/auth checks for session read, bounded DB work. No tracking token, customer hash, proof, storage key/path, payment reference, or raw audit JSON in response, logs, errors, or HTML.

## Action allowlist and explicit projection

Known INSERT callsites For each action, construct output from named keys and validated values; strip all other keys. UUID fields require canonical UUID; string fields/enums use exact bounded allowlists; version strings are bounded decimal strings. Invalid/missing fields become omitted or safe generic summary, never trigger raw fallback. Unknown actions render generic label `Activity`, summary `Recorded activity`, `detail:{}`.

| action | Safe detail projection | Safe summary |
|---|---|---|
| `checkout` | `total` only if exact nonnegative decimal string (bounded digits/scale); `settingsVersion` bounded decimal string | `Booking checkout created` |
| `booking.submit` | `outcome` only `pending\|payment_exception` | `Booking submitted` |
| `proof.reserve` | none; omit `reservationId` | `Payment proof reserved` |
| `payment.approve`, `payment.reject` | none; omit `paymentId` | `Payment approved` / `Payment rejected` |
| `exception.review` | none; omit `paymentId` | `Payment exception reviewed` |
| `hours.update` | `oldVersion`,`newVersion` bounded decimal strings; `courtIds` array max 100 decimal IDs, each 1–12 digits | `Court hours updated` |
| `settings.update` | same version/court ID projection as hours | `Settings updated` |
| `calendar.block.create` | `blockId` UUID, `courtId` 1–12 digit decimal, `kind` only `maintenance\|private` | `Calendar block created` |
| `calendar.block.release` | `blockId` UUID, `courtId` decimal | `Calendar block released` |
| `walkin.create` | `courtId` decimal; `startsAt`,`endsAt` valid ISO timestamps; omit `total`, `method` | `Walk-in booking created` |
| `staff.update` | `userId` UUID; `oldRole`,`newRole` only `owner\|staff\|null`; `oldEnabled`,`newEnabled` boolean or null | `Staff access updated` |

Projection stays explicit as writers evolve. Never return walk-in `total`/`method`, payment identifiers/references, arbitrary action/detail values, or actor text/hash. `staff.update` may include validated target `userId` (owner-approved policy); `booking_id` is safe booking identifier, not tracking capability. Actor values are text, not UUID evidence: join only exact actor text to `staff_access.user_id::text` rows whose role is `owner` or `staff`, regardless of enabled status, to label historical staff actors. Emit verified staff UUID as `actorId`. For unmatched actor on known customer-origin actions (`checkout`, `booking.submit`, `proof.reserve`), emit `Customer`/null. All other unmatched actors emit `System`/null. Never parse actor text as UUID, even if UUID-shaped.

## Test plan before implementation acceptance

- Auth: owner allow; staff allow/deny per decision; anonymous, disabled, stale/revoked identity denied before audit query. Verify DB role flags/grants and RLS using restricted `ethn_checkout`; SELECT must be absent until narrowly approved.
- URL validation: duplicate/unknown params, malformed/impossible dates, range cap, Manila midnight/DST-independent calendar edges, invalid/oversized pagination, UUID/action query semantics, `%`/`_` not wildcard search.
- Projection: fixtures for every action above, null/missing/wrong-type/oversized detail values, unknown/future actions, malformed/UUID-looking actor strings, staff/customer/system classification. Assert exact output keys and no raw actor/detail, hashes, IDs from detail, PII, money/references except specified checkout total, private proof/storage/tracking values.
- Ordering/pagination/count consistency; timestamps and bigint serialization; empty results; no-store and safe generic DB failures. Assert no query reads or logs serialize raw JSON.

Scope audit: inspected current callsites in booking, admin settings/hours/payment/exception/calendar/walk-in/staff services; no callsite changes proposed. This document intentionally does not define UI, code, schema, or deploy work.
