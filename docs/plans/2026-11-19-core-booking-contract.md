# ETHN COURTS — minimal core booking contract

2026-11-19. **Business contract confirmed; implementation gates remain. Not implementation approval.** No migrations, application logic or dependencies changed by this document. Supersedes ambiguous core-contract language in the broader fork plan; latest approved business decisions still govern. Source baseline remains legacy RPC-based code.

## 1. Scope and approved policy

First working slice: settings/courts/hours, staff authorization, availability, held booking/items with frozen prices, guest GCash submission, manual verification/rejection, prepaid staff walk-ins, private proof attachment, audit, idempotency and durable email intent.

Later, not built upfront: extensions/Open Plays (Phase 3), sales/reports/persistent inbox/browser push (Phase 4). Shared allocation authority must accommodate later modules, but no speculative tables, API stubs or generic workflow framework.

Confirmed policy:
- Supabase Free Auth/private Storage retained; business SQL server-only through one chosen driver/Drizzle. No application RPC, stored business function, business trigger or parallel business-table HTTP writer.
- Initially Court 1/Court 2, operating 07:00–03:00 next day Asia/Manila, rate unset until owner configures. Unset rate/payment recipient disables paid checkout.
- Allowed interval settings **30 or 60 minutes**, aligned to court operating opening. Minimum positive multiple of interval; initial interval/minimum 30 minutes. Full selected range must fit hours. No fixed business maximum beyond hours and availability; abuse limits must allow legitimate multi-court selections.
- Operating-date anchor **07:00 Manila initially, configurable**. Before anchor, current operating date is previous Manila calendar date; at 02:00, overnight slots belong to previous date. Grid aligns to court opening within that business day. Horizon: **30 selectable operating dates including current operating date**, ending at current operating date + 29. No already-started interval: start must be at or after authoritative current database instant. Overnight end explicitly next calendar date.
- One continuous range per court per selected operating date; multiple courts may have different ranges.
- Checkout hold initially 10 minutes from fresh final database reservation timestamp after required locks. Persist deadline once and return exact value; commit latency can shorten remaining customer time. Failed transaction creates no hold; retry never extends deadline. Strict expiry, no grace/reacquisition. Exact ten minutes after commit is not promised.
- Whole selected court range must fit one configured opening/rate window. Do not stitch adjacent windows, even at same rate. Initial 07:00–03:00 daily window supports intended launch; crossing windows returns clear selection error. Multi-rate/segmented pricing deferred.
- Summary/price before guest details. Checkout freezes authoritative price; changed estimate acknowledged before customer proceeds to payment. Later settings do not reprice valid hold.
- Money `numeric(12,2)` pesos/decimal strings in DB/API. Exact centavo/rational duration arithmetic in server TypeScript. **Half-up to centavo once per court item, then sum items.** Example: PHP 101.01/hour × 30/60 = PHP 50.505, rounded PHP 50.51. No floating-point money parser.
- Full verified GCash or recorded full cash required before confirmation. Uploaded receipt is claim, not collection. No partial payment/outstanding balance feature.
- No confirmed cancellation, rescheduling, refund/partial refund, hard delete or early release. Rejection only before confirmation; hold expiry not cancellation.
- Public lookup remains code + email, private tracking token remains high-entropy capability.

No-refund policy cannot remove legal obligations. Keep late/duplicate/disputed payment evidence for staff review; any required external resolution is outside app refund functionality. Do not build a refund subsystem disguised as exception handling.

## 2. Logical records — no table-per-concept mandate

These are logical responsibilities, not executable DDL. Choose final physical fields during migration implementation; preserve invariants below. Do not add separate quote/quote-line tables.

| Record | Required responsibility/invariants |
|---|---|
| Current business settings | One row/version; interval, minimum, horizon, hold TTL, operating-date anchor and configured payment destination. Validated finite settings, version increments on edit; no settings-history service. |
| Courts / operating hours | Configurable court identity/active state; weekday open/close and nullable hourly rate. Check positive valid ranges, cross-midnight/adjacent-weekday overlap and full end containment. Historical booking items carry their own schedule/price. |
| Staff access | Verified Auth user ID; enabled owner/staff. Current DB row controls capabilities, not request role/user-editable metadata. Last enabled owner protected transactionally. |
| Booking / booking items | Internal held checkout and customer reservation share same records. Header: ID, owner capability hash, operating date, state, expiry, total, optional guest fields until submission, tracking credentials when required, price acknowledgement. Item: booking/court FK, start/end, rate/duration/amount and relevant setting snapshots. One range per booking/court in core. Item amounts sum exactly to header total in transaction. |
| Court allocations | Sole occupying-time authority: court, positive half-open start/end, booking-item FK for core, state and expiry for holds. One GiST exclusion on court equality + overlapping `tstzrange` for static occupying states. No time-dependent index predicate. FK ownership and court/range consistency enforced by available composite keys/checks plus trusted transaction boundary; no orphan polymorphic IDs as shortcut. |
| Payment evidence | Unverified GCash claim/reference/amount, owner-bound private proof, received/verified amount and times, actor and state. Actual collection distinguishable from claim. Whether collection fields live on accepted submission or separate table is implementation choice; no generic ledger. At most one accepted full core booking collection; cash has no mandatory receipt. |
| Proof reservations/attachments | Unique server-minted object path, checkout/owner binding, expected metadata, attachment/cleanup state. Storage object never trusted solely because path shape valid. Metadata may live with payment evidence if nullable reservation-to-submission lifecycle remains clear. |
| Idempotency | Unique owner/actor + operation + key; stable normalized payload fingerprint; committed response/result. No key collision can disclose another owner's result. |
| Audit | Authenticated actor or customer capability identity, event/action, timestamp and relevant identifiers; retain significant decisions without unnecessary proof/PII duplication. |
| Existing email outbox | Required intent written with business commit; bounded claim/retry/stale-claim recovery through SQL transactions, not RPC. Actual email after commit. |

No rental/refund/cancellation/receivable/quote tables. Do not force independent payment state into booking status; distinguish claim and actual collection even if physical table count is reduced.

## 3. States and occupancy

Internal checkout states: held, expired. Customer reservation: pending, confirmed, rejected, completed. They may share one stored status field with explicit constraints; public UI must not present held checkout as confirmed reservation.

| Transition | Required event | Occupancy |
|---|---|---|
| new → held | Atomic successful checkout, priced items and allocation | Held until expiry |
| held → pending | Timely owned submission with guest details, GCash reference and verified-existing owned receipt metadata | Retained pending review; expiry no longer releases it |
| held → confirmed | Authorized staff records full cash or verifies full GCash for walk-in | Confirmed |
| held → expired | Database time reaches expiry before submission wins | Released explicitly |
| pending → confirmed | Authorized human verifies actual full payment | Confirmed |
| pending → rejected | Authorized rejection, reason recorded | Released explicitly |
| confirmed → completed | Final confirmed end passed | Historical allocation retained; no early release |

No expired/rejected → confirmed shortcut. Pending after end remains pending and shown overdue, never autoapproved. Completed/no-show correction audited, not inventory rewrite. Core UI can derive overdue state; persistent urgent events arrive in later notification phase before final launch.

## 4. One transaction discipline

Ordinary availability/list/read queries are parameterized queries, not automatic transaction wrappers. Use explicit transaction for atomic mutation or genuinely consistent multi-query snapshot. All statements on same checked-out driver connection; no independent pool queries inside one logical transaction.

For core mutations:
1. Authenticate/validate request shape outside transaction; do not accept client totals/actor/role as authority. No network work inside SQL transaction.
2. Look up completed idempotency result before expired-hold/proof preflight. Matching owner/operation/payload returns result; different payload fails. Serialize same key inside transaction and repeat lookup after lock.
3. For idempotent mutations, reserve/serialize scoped idempotency key first. Then relevant access/settings rows, all venue court rows in ascending ID order, then booking headers in stable ID order and their needed items/payment/proof rows. Recheck current staff access where required. Checkout's short all-court lock deliberately serializes inventory for this small venue; revisit only measured contention. Future settings/hours/expiry writers follow same inventory order. No dynamic court-set discovery/restart machinery. Validate actual deadlock/expiry behavior in integration tests.
4. Lock courts before releasing expired allocations or competing submit/update. Recheck booking/item mapping after acquiring locks. Obtain fresh database `clock_timestamp()` **after contended locks**, not request time or transaction-start `now()`.
5. Release relevant conflicting expired held checkouts; never release pending/confirmed. Verify strict `dbNow < expiresAt` for timely submission. Exclusion remains final overlap arbiter.
6. Write all necessary courts/items/state/payment evidence/audit/email intent/result atomically. Failure rolls back entire multi-court mutation. Map expected overlap to slot-lost; bounded retry only for identified safe transaction errors.
7. After commit, external email/Storage side effects handled independently. Uncertain response retries same owner/key; never duplicate actual collection or booking.

Core serialized court rows are appropriate for two-court facility. No advisory-lock service, distributed lock or extra queue server. Settings edits use same lock protocol and reject changes invalidating future occupying ranges; rate-only edits preserve existing item snapshots.

## 5. Operation contracts

Names below describe server functions, not fixed new HTTP routes. Reuse existing route shape where safe; coordinate clients rather than maintain old and new writers concurrently.

### Estimate and availability — read only
Input: operating date and per-court start/end ranges. Return current bookability, duration/rate/item amounts/total and settings version. No hold, guest data or persistent quote created. Public calendar range-overlap reads advisory; response must not expose customer details or private proof metadata.

### Create checkout hold
Input: owner capability, idempotency key, operating date, per-court ranges, previously displayed estimate/version. Validate active courts, date window, start not passed, grid/minimum/continuous ranges, full containment, configured rate/payment destination. Recalculate exact amounts and atomically create held booking/items/allocations.

Return: checkout ID, authoritative priced items/total, expiry/deadline, whether price changed and acknowledgement required. Never silently alter displayed amount. Existing same key returns same checkout; no TTL extension by retry. Price acknowledgement binds checkout ID/frozen total; can be persisted with next safe mutation rather than separate general quote API. Server requires acknowledgement before payment-upload/submission stage if amount changed.

### Recover checkout/result
Input: owner capability and checkout or idempotency identifier. Return only owned committed result or still-live held state. Strictly expired hold not reacquired; remove legacy 30-minute grace. Do not reveal booking by guessable checkout ID alone. Version same-browser draft so old rentals/hourly token lists cannot submit to new contract.

### Reserve receipt upload
Input: owned live checkout, allowed MIME and declared byte size. Validate capability and acknowledgement, reserve unique owner-bound path before generating signed upload URL. Return path/upload token/expiry; no arbitrary client path accepted. Signed upload cannot overwrite an attached immutable receipt. No proof content in DB/outbox/logs.

Storage upload occurs outside SQL transaction. Receipt metadata inspected before attachment; submission transaction rechecks reserved path ownership/state and marks attached. Cleanup atomically claims only unattached eligible records so attachment cannot race deletion. Signed URL lifetime cannot extend checkout eligibility. Attached or uncertain-commit receipts never deleted by cleanup. Exact URL lifetime, cleanup grace and retry semantics must be proved with Storage integration before enabling cleanup; retention periods remain launch input. Do not claim SQL alone makes object operations atomic.

### Submit guest booking
Input: checkout ID, owner capability, idempotency key, guest name/email/contact, GCash reference/claimed full amount and reserved proof identifier, acknowledgement of frozen price where necessary. No rentals, hold-token cross-products or client-calculated price authority.

Before preflight return any completed matching result. Inspect existing object outside SQL transaction, then transaction locks/rechecks authoritative live checkout and proof reservation. If timely, attach proof metadata and move held → pending, retain allocation and queue submission email/audit/result together. Return tracking token/code, frozen total, pending state, deduped and delivery-deferred information if needed by existing client.

If expiry wins, do not reacquire inventory. Approved late-claim policy: an owner may submit existing owner-bound receipt/reference/claimed amount against their expired checkout; persist an unreviewed payment exception with review fields empty until staff review. Checkout remains expired, allocations released, no collection created. Return explicit `not booked—staff review required`, not successful reservation. This exception outcome commits independently of reservation success and is idempotent; do not throw it away through rollback. No new post-expiry upload authorization, refund workflow or automatic slot reacquisition.

### Decide pending payment
Input: verified staff identity, booking ID, idempotency key, approve/reject, reason for rejection; for approval, actual full amount/reference and effective received timestamp. Lock/recheck current role and pending state. Claim/reference mismatch cannot silently confirm. Accepted reference cannot be credited twice; duplicate claim retained and flagged, not automatically treated as duplicate actual receipt.

GCash references trim leading/trailing whitespace only; internal characters and case remain unchanged. Repeated unverified claims retained and flagged. One exact reference cannot credit two accepted payments under same configured merchant account; no override in core. Bind payment destination/merchant identity to held settings snapshot so later account change cannot mix uniqueness scope. Cash requires no GCash reference. Approved review policy: staff records actual received timestamp (default current time), validated separately from immutable server verification time/actor. Rejection reason must be concise and customer-safe; expose that reason in private tracking/rejection email, never internal audit details or raw provider/database errors. Late exceptions remain outside ordinary approval and cannot restore inventory. Approve atomically records one full verified collection, actor/time, confirmed occupancy, audit/email/result. Reject records reason, releases only pending allocation and queues required email/audit. Already committed same decision replays; incompatible decision or confirmed rejection fails. Human confirmation is not automatic upload approval.

### Prepaid staff walk-in
Staff uses normal availability/hold authority—cannot evict another live hold. Collect full cash or verify full GCash, then atomic held → confirmed with actual collection/audit/idempotency and optional customer email intent. Incomplete payment cannot confirm. No partial/unpaid branch, no equipment rentals. Walk-in guest name required; email and phone optional. Email required when confirmation notification requested. Online guest name/email/contact remain required. Do not fabricate contact data to satisfy legacy schema.

### Expire, settings and completion
Expiry changes only actually expired held allocation/checkout, using same court-first locking; pending not expired. Settings/hours/activity mutations reject conflicts and preserve held prices. Confirmed completion after last end is idempotent; schedule/worker frequency before launch must meet approved operational targets. No custom database business function, in-process timer or reliance on `after()` for guarantee.

## 6. Security boundary

Server verifies Supabase session, looks up current enabled owner/staff and checks capability before privileged mutation. Proxy only coarse gate. Dedicated non-owner app SQL login with explicit table DML and appropriate RLS; separate migration credential. No runtime DDL/BYPASSRLS or exposed service credential. Shared SQL identity does not make RLS know human staff role; service capability checks mandatory. Auth/Storage administrative key separate and server-only.

Anon/authenticated get no direct business-table access. Public API returns deliberately restricted fields. Private receipt read requires authorized staff or explicit approved owner scope; public tracking never returns signed receipt URL by accident. Origin/CSRF checks for authenticated mutations, rate limiting on every public endpoint in both proxy rule and matcher.

Unique proof path/attachment, keyed idempotency, required FKs/checks/exclusion/role grants belong migrations. Cross-record totals and permitted transitions enforced by trusted transaction functions and integration tests where no declarative constraint expresses them. No claim that table checks alone prove all business rules.

## 7. Legacy callers to migrate or disable together

| Current area | Files/seams | Required change |
|---|---|---|
| Hold/reclaim | `src/app/api/holds/route.ts`, `holds/reclaim/route.ts`, `booking/hold-owner.ts` | Per-court ranges/checkout identity, strict expiry; no grace or equal-start cross-product |
| Submit/draft | `src/app/api/submit/route.ts`, `booking/validation.ts`, `booking/draft.ts`, `components/booking/booking-flow.tsx` | Committed-result lookup before preflight, held-item amounts, remove rentals, version draft |
| Proof | `src/app/api/proofs/upload-url/route.ts`, `lib/booking/proof.ts`, `lib/proof-client.ts` | Owned reservation/attachment and cleanup concurrency; no path-shape-only binding |
| Time/price | `lib/booking/constants.ts`, `slots.ts`, `hours.ts`, `pricing.ts`, `calendar.ts`, `lib/courts.ts` | Range duration, 30/60 grid, 30-date horizon, exact rounding/full end containment |
| Availability | `lib/booking/availability.ts`, `/api/availability`, `/api/availability/month`, customer/admin calendars | Range-overlap reads against one authority |
| Decision/walk-in | admin booking approve/reject routes, `lib/admin/decisions.ts`, booking POST/form | Explicit verification evidence, paid hold-first walk-in, no live-hold eviction |
| Auth/audit/mail | `lib/admin/session.ts`, `db/schema.ts`, `lib/mail/worker.ts`, cron handlers | Current role, TS claim/drain, scoped postcommit send; no enabled `.rpc()` |
| Removed/late modules | refund/delete routes/actions; config/expenses/bookings RPC callers; finance/report screens | Remove forbidden actions; disable unmigrated endpoints rather than mix old and new writers. Add module schema only in owning phase |

Existing hold `{courtIds,slotStarts}` applies same starts to all courts; cannot represent agreed different court ranges. Existing submit `{holdTokens,rentals,proof}` and old Approved/Refunded status unsuitable unchanged. Route changes and UI caller changes one release unit; no compatibility shim keeping unsafe writer enabled.

First slice contains no ETHN visual redesign; designer handles approved visual phase. Disabled legacy features must fail closed on server, not just disappear from navigation. No client services connected during draft work.

## 8. Acceptance evidence required during implementation

- Install actual no-RPC core migrations twice from fresh isolated databases. Compare constraints/grants; no custom business functions/triggers. Chosen app driver executes real same-connection transactions with verified TLS.
- Two independent requests: different-start overlap rejected; adjacent ranges allowed; multi-court failure rolls back all allocations/items/result. Court-first expiry/submit race follows fresh locked DB time.
- At exact expiry, submission fails; completed earlier same-key result replays despite now-expired checkout. Different owner/key payload cannot read/reuse result. No grace reacquisition.
- Rate changes preserve held item amount; estimate mismatch acknowledged; 30-minute PHP 101.01 rate rounds PHP 50.51; multi-court totals exact and overflow rejected.
- Approved horizon includes current date through +29, not +30; already-started interval rejected; overnight 02:30–03:00 shows next-day end and correct operating date. Alternative 60-minute setting/minimum validated.
- Proof upload alone creates neither pending booking nor collection. Owner/path mismatch, mutable attached object, cleanup-vs-attachment and uncertain response tested. Late payment retained only as exception, never inventory reacquisition.
- Unauthorized/revoked staff/forged role denied; owner safety; public business table/proof access denied. Direct confirmed reject/cancel/delete/refund path unavailable.
- Full payment verified once; duplicate/mismatched reference cannot silently confirm; prepaid walk-in cannot displace live hold or confirm incomplete amount.
- Mail failure leaves booking committed and one durable intent; workers reclaim stale claims and retries cannot duplicate business writes.

Tests use actual application schema and selected driver. Temporary standalone probe optional troubleshooting only; retire duplicate fixture schema when these tests exist. Source unit/build success does not prove live migration/access/race behavior.

## 9. Remaining implementation gates, not extra product scope

Before engine coding, settle these concrete details in migration/API review:
1. **Operating date anchor confirmed:** one business setting initially 07:00; before that time current operating date is previous Manila calendar date. Court grid aligns to its opening within that operating day. Horizon counts from this operating date. Implementation must validate multiple schedule rows/court opening differences without ambiguous labels; no further business choice required.
2. **Lock/idempotency protocol:** choose one exact lock order, payload normalization and replay TTL. Same-key serialization must not invert court/domain locks. Test deadlocks/expiry waits; do not add distributed locking.
3. **Reference policy confirmed:** trim outer whitespace only, preserve exact remaining value, unique accepted GCash reference per frozen merchant account. Duplicate unverified claims recordable. Later extensions must use same accepted-payment uniqueness authority, not separate loophole. Tests must verify merchant identity snapshots and collision behavior.
4. **Proof lifecycle:** signed URL lifetime/overwrite behavior and cleanup grace must keep attached/uncertain-commit objects safe; late payment exception capture and receipt access tied to capability.
5. **Walk-in identity confirmed:** name required; email/phone optional, except email required for requested email confirmation. Online guest fields unchanged. Schema/API/UI must enforce same rule without invented values.

No new provider/package search needed. `pg` candidate install and live access separately authorized. TLS root trust and commercially eligible free hosting unresolved. Scope remains no implementation until this contract is reviewed and concrete next phase authorized.
