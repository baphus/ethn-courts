# ETHN COURTS — isolated fork and simplified no-RPC implementation plan

Created 2026-11-19; progress reconciled 2026-11-20. Revision 4: feature-first delivery. Earlier planning-only language and future-tense implementation sections below are historical design context, not current progress or standing execution permission. Completed work is recorded in checklist and dated `docs/checks/`. New specialist runs and hosted/deployment actions still require their scoped approvals. Prioritize smallest working features; defer cosmetic refinement and repeated browser polish while preserving authorization, exact money, transaction integrity and conflict protection.

## Steps

### Completed foundation and active core

- [x] Review SRS amendments: no cancellation/refunds/rescheduling, no unpaid confirmed bookings, no application RPCs.
- [x] Create isolated audited fork, sanitized configuration and fresh Git history; original source unchanged.
- [x] Create local initial checkpoint `7ddaa68` and feature commits `f7932b5`, `9860d39`, `1f79a2d`; no remote/push/deployment.
- [x] Verify hosted CA/hostname TLS and restricted application login.
- [x] Implement core schema, allocations, frozen booking items, exact pricing and owner-bound idempotency; install actual schema locally and on disposable hosted project.
- [x] Implement checkout, proof reservation/signing, strict-deadline submission, late-evidence capture and safe tracking.
- [x] Cut customer booking UI over to ETHN endpoints and retire legacy writes server-side.
- [x] Implement current staff authorization, full-payment approve/reject, private proof review and payment-review UI.
- [x] Implement outcome emails, durable worker, opt-in scoped post-submit hook and authenticated bounded retry endpoint; fake/local SMTP tested.
- [x] Implement owner-only court names/rates/GCash-instruction configuration; hosted/browser verified, existing snapshots preserved.
- [x] Implement owner hours/activity API and UI with actual local conflict/rollback/checkout-race tests; migration 0010 applied to disposable hosted project.
- [x] Implement owner staff-access API and UI with last-owner protection, existing-Auth-user verification and actual local concurrent-demotion/pricing-race tests.
- [x] Implement late-payment exception review service, API and screens; review records an immutable private note only (booking stays expired, payment stays exception).
- [x] Verify real hosted Auth/private Storage and core customer/staff browser flow; fix evidenced origin/accessibility/login-branding defects.
- [x] Verify local stale/reload hours UI with explicit fixture responses; do not mislabel as hosted Auth proof.

### Current delivery target — prototype identity, retained fork features

Latest user direction: preserve the original fork's supported features while applying the prototype's logo, layout and aesthetic; no numeric visual-parity requirement. Approved exclusions (rentals, cancellation/refunds/rescheduling, unpaid confirmed bookings) remain. Do not restore retired legacy RPC routes or copy prototype mock actions.

Source coverage inventory: `docs/checks/2026-11-20-fork-feature-coverage.md`. This is source evidence, not runtime acceptance. “Incomplete” does not mean excluded: persistent inbox/push, Open Plays and paid sales remain roadmap items below. Extensions are an added ETHN requirement, not an original-fork feature.

- [x] Restore public landing/navigation/footer composition and prototype logo/identity while keeping real booking prominent. Homepage desktop/mobile screenshots reviewed; this is not full prototype parity or comprehensive content acceptance.
- [x] Perform bounded local desktop/mobile rendering checks: homepage captures plus populated/empty synthetic module fixtures and Observer review. Fixtures omit authenticated shell/fonts; full user-journey/accessibility acceptance remains a launch gate, not proved by screenshots.
- [x] Restore authorized ETHN dashboard/recent-booking and booking search/detail views, without mock metrics or excluded mutations. Restricted PostgreSQL and final regression/type/build passed; browser and hosted acceptance remain unverified.
- [x] Restore ETHN calendar/occupancy and one-off maintenance/private blocks against shared allocation authority; restricted CRUD/race/upgrade tests and final regression/type/build passed. Court creation, browser/HTTP acceptance and DB-integrated hours/block edits remain separate gaps.
- [x] Restore owner-only read-only ETHN audit history with safe event projections, filters and pagination. Restricted PostgreSQL behavior and final regression/type/build pass; browser/hosted acceptance remain unverified.
- [x] Restore first-slice owner finance/custom-period reports and immutable paid expenses using verified booking collections; restricted PostgreSQL reconciliation and final regression/type/build pass. Later local integration includes XLSX, expense corrections and manual sales; browser/live-provider/hosted acceptance remains separate.
- [x] Complete walk-in temporary-hold-before-payment workflow with staff-bound frozen quote, exact full-payment confirmation, overnight end date and live-hold recovery. Restricted database checks pass; real cash/GCash receipt and hosted/browser acceptance remain external verification.

### Major feature backlog — smallest working slice first

- [x] Owner staff-access management with transactional last-owner protection and revocation.
- [x] Staff review of captured late-payment exceptions, without restoring slots or adding refund workflow.
- [x] Prepaid walk-in core: service/API/UI, explicit full-payment and price acknowledgement, actor-scoped retry replay; restricted PostgreSQL concurrency tests and final type/build/regression pass. Later local integration adds server live-hold recovery and explicit overnight end date; browser/hosted and real payment acceptance remain separate gates.
- [x] Local completion/no-show implementation: authenticated bounded completion worker and audited correctable attendance outcome; pending extension review delays completion. Scheduler remains unprovisioned.
- [x] Local prepaid extension implementation: protected added-time hold, staff full-payment verification and timely proof-pending/approve/reject/late-exception states; original remains unchanged on failure. Live Storage/provider and hosted acceptance remain gates.
- [x] Local information-only Open Plays with versioned multi-court edits and conflict-safe allocation blocks; no registration/payment.
- [x] Local paid manual sales and separately dated immutable owner record corrections; no POS/inventory or refunds.
- [x] Local finance/XLSX includes verified booking/extension receipts, paid sales and dated sales/expense corrections with exact reconciliation; not formal accounting profit.
- [x] Local persistent recipient inbox and opt-in Web Push implementation with denied/unsupported fallback; mocked-sender database tests only, VAPID/scheduler/real-device delivery unconfigured.
- [x] Local owner court creation (inactive/unpriced until configured), existing name/activity/hours management and validated versioned timing-policy changes; active inventory prevents policy changes.

### Launch gates and deferred acceptance

- [ ] Finish only missing hosted hours stale/reload/staff browser checks and native-time editing; stop repeated harness churn. Core local authorization/race evidence remains valid.
- [ ] Supply owner-approved real rates, GCash instructions, contacts/policies and permanent owner/staff identities. Unset values keep paid checkout disabled.
- [ ] Select commercially eligible production host, verify pooling/TLS/lifecycle/load and domain.
- [ ] Configure production mail sender/delivery and provision authenticated scheduler; endpoint existence is not scheduler operation.
- [ ] Establish retention and independent DB/Auth/Storage backup with restore drill.
- [ ] Resolve or explicitly accept residual development dependency/legacy archive risks; complete final integrated security/mobile acceptance.
- [ ] Obtain explicit deployment/launch approval. No free-tier uptime or delivery guarantee invented.

Feature acceptance requires functioning service/API/UI as applicable, focused tests and relevant type/build checks. Local DB evidence required for money, access and allocation changes. Browser polish can follow working implementation; do not tick an entire mixed module because its schema or placeholder exists.

## 1. Goal, authority and change register

Create ETHN COURTS in `C:\Users\JKsars\Documents\projects\ethn-courts`, deriving working code from `C:\Users\JKsars\Documents\projects\paddle-culture` and visual direction from `C:\Users\JKsars\Documents\ETHN COURTS PROTOTYPE`. Originals remain untouched. Fresh private Git history; no inherited remotes, deployments, credentials or customer data. Record source commit `89cdad46a823051c88f5e9f108d1fac821899275`; source was clean and one commit ahead of origin/main when checked. Recheck before copying and explicitly review any later changes.

Authority: latest confirmed user decisions below override conflicting SRS v4.0 clauses; otherwise SRS governs function, prototype guides visuals, source supplies compatible implementation patterns. Initial aesthetic-only request was superseded by full SRS scope, then simplified by explicit user amendments. Full launch means this **amended baseline**, not every clause of unmodified SRS.

### Explicit SRS amendments approved in review

1. **No booking cancellation feature.** No customer or staff cancel action, no cancellation endpoint, and no booking hard-delete workaround. Confirmed reservations are final; cannot be released early through app. Hold expiry and rejection before confirmation remain necessary and are not cancellation.
2. **No refund or partial-refund feature.** Remove refund states, tables, authorization workflow, APIs, buttons and reporting framework from planned ETHN scope. Ordinary policy: no refunds. Do not recreate removed features as generic adjustments or payment-exception refund UI.
3. **No unpaid confirmed walk-ins.** Staff creates temporary hold, then records full cash collection or verifies full GCash payment before confirmation. Remove unpaid reservation, partial-collection and outstanding-balance management. This amends SRS §§2, 5.5 and related acceptance criteria.
4. **No application database RPCs/stored procedures.** Business logic in server-only TypeScript transactions. No Supabase `.rpc()`, custom stored business functions, `SECURITY DEFINER`, or business triggers. Standard migrations, checks/indexes/exclusion constraints and managed-platform internal functions remain allowed.
5. **Supabase Free selected**, with existing Auth/private Storage retained. Neon evaluated, not selected. Free tiers only; fewest managed services/dependencies preferred. Production hosting remains unresolved because Vercel Hobby is restricted to personal/non-commercial use under current terms.
6. **Keep existing numeric money storage**, not blanket integer-column conversion. Decimal-string pesos at DB/API boundary, exact bounded centavo arithmetic in TypeScript, explicit prorating/rounding rules.
7. **Actual cash records, not receipt claims.** Submitted proof is unverified claim. Accepted collection/refund event-date clarification is narrowed by removal of refund feature: reports now cover actual verified collections, paid sales and expenses only. Label net cash collected, not formal accounting revenue without approved recognition policy.
8. **Sales corrections separately dated and audited**, original sale retained. Do not silently rewrite prior reports or simulate a cash refund by editing/voiding sale. No generic financial-adjustment engine.

Legal/operational warning: a no-refund policy cannot override applicable law. Late, duplicate, mistaken or disputed payments still require evidence and staff review. Any legally required external resolution is outside this application's refund processing/tracking scope. Never claim app policy removes those obligations. Confirmed erroneous bookings also have no early-release path; owner accepts operational consequences unless scope explicitly changes later.

## 2. Source evidence and review limits

Read-only Explorer/Designer/Oracle review compared source, prototype and SRS; additional Explorer/Oracle review covered no-RPC architecture and provider/package choices. Parent inspected key source/plan files and fetched official provider/driver docs. Later probe local checks passed, but two live read-only connection attempts stopped at TLS before database assertions (§5C). No live schema/transaction/access proof, browser automation, mail/push/device verification, application build/test or restore drill completed. Package versions, licenses and maintenance require exact-release verification before installation.

Source stack: single Next 16.3/React 19.3/Tailwind 4.3 npm app; Drizzle schema types/tooling; Supabase HTTP runtime; Node built-in tests; `postgres`, `drizzle-orm`, `drizzle-kit`, `zod`, date-fns/timezone, Nodemailer already installed. Prototype Next 13/React 18/Tailwind 3 with mock client state: do not copy its dependencies, catch-all app/router or fake logic.

Evidence:
- `src/lib/booking/constants.ts:4–27`: hourly 07:00 Manila operating-day anchor, 24 starts, maximum 240 court-slot pairs, 10-minute hold plus 30-minute reclaim grace. Source AGENTS.md midnight/12-slot claims stale.
- `src/lib/booking/slots.ts`: hourly validation and 12-month horizon, conflicting with ETHN initial 30-minute/30-day policy.
- `src/lib/booking/hours.ts:83–116`: fixed-hour duration/start-based operating-hours acceptance. New ranges need full end containment.
- `src/lib/booking/pricing.ts:201–239`: full hourly rate per start. Must prorate actual duration; not divide visual slots while keeping same charge.
- `src/db/schema.ts:116–222`: separate hold/booking-slot equal-start uniqueness, insufficient as single authority for configurable interval and cross-kind overlap.
- `src/db/schema.ts:152–197`, `supabase/refund.sql`, `booking-delete.sql`: old coupled Approved/Refunded state and destructive delete cannot carry into final-booking ETHN policy.
- `src/lib/admin/session.ts`: single admin membership, not owner/staff capabilities.
- `src/app/api/admin/notifications/route.ts`, `src/lib/admin/notifications.ts`: pending-only feed/browser-local read tracking, not persistent history.
- `supabase/hours-rates.sql`: required rate-on-hours SQL absent from old setup manifest; pricing-windows.sql superseded. Preserve source as evidence, not new deployment recipe.
- 38 source test files include recovery and SQL checks; no fresh passing evidence claimed.

Inherited backlog: response-lost successful submit may fail retry preflight; unattached receipt cleanup has retention gap; browser recovery is same-browser with source-specific 40-minute ceiling. ETHN must address these where strict expiry/private receipt reliability requires it, not inherit grace or claim fixed from plan alone.

## 3. Reuse, change, remove and avoid

| Area | Decision |
|---|---|
| Source auth/private storage, UI primitives, mail transport, validation/time helpers | Reuse compatible pieces; audit source-client identity/config |
| Transaction/idempotency/audit/outbox patterns | Reimplement as TypeScript transaction services, not stored RPCs |
| Hourly slot engine | Replace coordinated hourly assumptions with duration-aware range allocation |
| Prototype colors/type/cards | Adapt via Designer; homepage timetable before promotion |
| Booking UI/verification | Reuse screens, change checkout order, GCash reference/proof and paid-only confirmation |
| Walk-ins | Prepaid cash or verified GCash only; temporary hold before payment |
| Extension | Added held time, prepaid confirmation, original unchanged on failure |
| Open Plays | Real information-only listing and court blocking; prototype admin is inactive placeholder |
| Sales | Simple paid entry ledger; prototype has no real transaction form |
| Finance/expenses/XLSX | Retain useful capabilities, rebuild totals from verified collections; no outstanding/refund feature |
| Notifications | Persistent per-recipient center + permission-aware push; no local-only fake history |
| Calendar/courts/admin/audit | Extend real source functionality rather than replace with mock screens |
| Tracking | Keep code-plus-email lookup/private token links, not prototype reference-only model |
| Equipment rentals, bank-payment choices outside GCash/cash, reschedule, cancel, refund, hard-delete booking | Remove from all active layers |

Avoid extra ORM/auth framework, generic repository/service interfaces, event sourcing, workflow engines, queue server, microservices, hypothetical provider adapters, POS/catalog/stock/fiscal receipts, online Open Play signup/payment/capacity/waitlist/recurrence, prototype-only finance bar toggle/14-day preset/CSV. Existing custom periods/XLSX suffice. New feature only when requirement needs it.

Core contract review draft: [2026-11-19-core-booking-contract.md](2026-11-19-core-booking-contract.md). Latest confirmed details: intervals 30/60 minutes aligned to opening; horizon 30 operating dates including current date (through +29), no already-started slots; half-up centavo rounding once per court item. Anchor/reference/contact rules now confirmed in core contract: configurable 07:00 Manila anchor, exact GCash reference after outer trim with one accepted use per merchant, walk-in name required and email/phone optional unless email notification requested. Exact lock/idempotency and proof lifecycle remain implementation verification gates, not implemented behavior.

## 4. Reviewed business decisions

### 4.1 Schedule, settings and booking shape
- Two initial courts named Court 1/Court 2; owner configures names, description, active status, hours and rates. Deactivation preserves history; conflicting future allocations prevent change.
- Initial 07:00–03:00 next-day Manila hours; 30-minute interval and minimum; 30-day advance window; 10-minute checkout hold. All business values stored in validated settings, not repeated constants. Rate unset disables paid checkout, no assumed amount.
- One contiguous range per selected court in one selected operating day. Multiple courts may have different ranges. Per-court minimum/interval enforced. No disjoint ranges/cross-operating-day bookings initially. No fixed business maximum beyond hours/availability; explicit abuse limits must allow legitimate full-day/multi-court requests.
- Supported configurable intervals, alignment anchor, minimum relation, inclusive horizon boundary and exact rounding finalized at technical contract gate. Initial half-hour support mandatory; do not promise arbitrary minute intervals without tests.
- Current agreed price and allocations immutable under later settings edits. Reject hours/interval/activity changes that strand existing active holds, pending/confirmed reservations or Open Plays. No silent repricing, migration or cancellation.

### 4.2 Checkout, GCash and strict expiry
- Selection and server-calculated summary/total precede guest details. Hold begins only when checkout allocation commits. Guest name/email/contact, full GCash payment, reference and private receipt required for online submission.
- Receipt upload/reference is a claim, not money received. Authorized verification records actual received amount once, actor/time and effective receipt timestamp; discrepancy or reused reference flagged for explicit review, never silently approved.
- Submission must lock owned hold and succeed against **database time** before expiry, atomically retaining allocation pending review. Upload finishing before expiry alone is insufficient. If expiry wins locked check, record late-payment exception and do not reacquire slots automatically.
- Pending allocation remains reserved until authorized approval/rejection. No automatic approval. Late/disputed/duplicate claims kept for review; external resolution outside app scope. No refund subsystem hidden here.
- Idempotent completed-result lookup precedes hold-expiry preflight for retries whose transaction already succeeded. Scope keys to owner/operation and detect different-payload reuse. Customer browser cannot mint totals, verification, actor or role.

### 4.3 Final reservations, prepaid walk-ins and extensions
- Online approval after full verification confirms reservation. Walk-in temporary hold converts only after full cash recorded or full GCash verified; no unpaid confirmed booking or partial-balance UI.
- Confirmed booking final: no cancel, reschedule, refund, partial refund, ordinary hard delete or early inventory release. Payment rejection is allowed only before confirmation. History immutable except explicit audited outcome/operational metadata.
- Confirmed becomes Completed after last confirmed end; no-show completion outcome can be corrected with audit. Pending online after end stays unresolved with overdue alert, never autoapproved/completed. Past allocation does not become future inventory.
- Extension only for active confirmed booking, contiguous to its end, within operating day. Separate configurable hold, initial proposal 10 minutes. Full additional payment required to confirm. Failed/expired extension releases only added hold, original reservation unchanged. Timely submitted extension proof should retain only added allocation pending staff decision, matching ordinary payment-review reservation; exact state/expiry transition must be settled before extension coding.
- No assumed partial payments or customer cancellation in extension workflow. Payment received after released extension goes to exception without displacing new occupant.

### 4.4 Sales, cash reports and corrections
- Paid-only manual sale: description, positive amount, cash/GCash method, actual transaction time, authenticated staff. Optional note only when needed. No unpaid sales, inventory, checkout gateway or receipt-issuance system.
- Net cash collected = verified booking/extension receipts + valid paid sales; show expenses and net after expenses separately. Submitted proofs/pending claims not cash. Do not equate retained cash with statutory accounting revenue automatically.
- Keep charges and confirmed collections distinct for evidence, but no receivables/refund/waiver ledger required under paid-only final-booking scope. Prevent duplicate/manual-sale double counting of booking collections.
- Owner-only correction retains original sale and records dated, reasoned correction/void/replacement. Distinguish inaccurate entry correction from actual cash movement; reports expose correction date and original link. Never edit old row or represent money returned by a data void. Define exact report reconciliation examples before implementing, no general financial-adjustment framework.
- Preserve existing expense reports and XLSX/custom periods. Review expense permissions: operational staff no owner financial correction/report/export access.

### 4.5 Roles, Open Plays and delivery
- Owner: full operations, staff access, court/pricing/settings, cash reports/exports and sales/expense corrections. Staff: bookings/payment verification/prepaid walk-ins/extensions/no-show, Open Play/maintenance blocks, paid sales entry and necessary transaction details. No cancellation/refund permission exists for either role.
- One-off Open Play: title/description/date/time/courts/fee/status. Information only; no signup, online payment or seat claims. Creation/edit must reject conflict with live hold, pending/confirmed reservation, extension or another block. Removing/correcting an Open Play or maintenance block affects only its own allocation; this is not a booking-cancellation feature.
- Persistent inbox required; read state per recipient, browser push subscriptions per device, retries/dedup/link targets. Denied/unsupported push still has inbox; lock-screen payload no customer PII.
- Urgent threshold initial 30 minutes before start, configurable. Target evaluate each minute/event persisted within 2 minutes and completion within 5 minutes while healthy. **Free-only constraint means targets are not proven or guaranteed; scheduler/host/quota proof is launch gate.** No paid-tier SLA implied, no push arrival guarantee. Staff monitors inbox.

## 5. Simplest safe no-RPC architecture

### 5.1 One Next app, one business data path
Route/server action verifies identity and current capability, validates request and calls focused domain function. Use ordinary parameterized queries for reads; use one connection-scoped SQL transaction for multi-step mutations or reads requiring a consistent snapshot. Do not wrap court lists, public information or unrelated lookups in explicit transactions. Keep business functions near existing booking/admin modules. No separate backend, repository hierarchy, provider-portability facade, custom DB function, `.rpc()`, business trigger or workflow framework.

Use installed Drizzle for schema/query construction and reviewed parameterized SQL for locks/range constraints/complex queries. Driver **candidate `pg` + Drizzle node-postgres adapter**, subject to exact-release/install approval and connection proof; reuse `postgres` only with proven compatible endpoint/fix. Do not keep two business SQL clients indefinitely. Supabase JS retained for Auth/Storage administration, not parallel business-table HTTP writes.

Supabase currently warns `postgres.js` pipelining with shared transaction pooler may hang or return mismatched rows; `max_pipeline: 0` breaks transactions. `prepare: false` alone does not solve that documented issue. This is why one small driver addition may be safer than blindly reusing installed package. All transaction statements on same checked-out client/Drizzle transaction, never independent pool queries. Avoid HTTP-only noninteractive batching for read/decide/write workflows.

### 5.2 Database-enforced allocation safety
One `court_allocations` table for checkout holds, pending/confirmed bookings, extension holds, Open Plays and maintenance/private blocks. Separate domain records; allocations only conflict authority. Store court, positive start/end instants, type/domain owner, occupancy state and optional expiry.

Use half-open `[start,end)` with PostgreSQL GiST exclusion on court equality and `tstzrange` overlap for static occupying states; `btree_gist` extension. Touching intervals allowed, overlapping rejected even with different starts or types. Validate exact DDL and foreign-key/domain ownership constraints. Do not put `now()` into index predicate.

All writers lock relevant domain/settings/court rows in fixed order, explicitly release conflicting expired allocations in transaction before new insertion (without requiring same customer ownership), and rely on exclusion as final guard. Handle expiry-vs-submit after lock with current database time, not stale request timestamp or transaction-start time after long lock wait. Multi-court operations all-or-nothing. Availability read advisory only.

Same mutation transaction commits allocation/domain state, agreed item prices or verified collection as applicable, idempotency result, audit and required existing email-outbox intent. Add persistent inbox/push intents transactionally when that feature is implemented; do not introduce those tables merely to finish core booking. No network mail, push, Auth admin call or object-upload operation inside SQL transaction. Retry only identified transient/deadlock/serialization failures with bounded policy and idempotency; map exclusion conflict to actionable slot-lost response. Never blindly replay external side effects.

### 5.3 Exact time, settings and money without wholesale migration
`timestamptz` for instants; explicit selected Manila operating date and next-day end. Full interval end within hours; detect overnight adjacent-weekday schedule conflicts. Server/browser timezone must not affect pricing/grid/day.

Keep source `numeric(12,2)` peso columns and decimal strings. Parse strictly to bounded integer centavos for arithmetic; reject invalid precision/overflow and never parse money via floating-point `Math.round(n * 100)`. Price actual duration per court, apply one documented rounding rule per booking item and sum exact totals. No decimal dependency unless proven required; no blanket conversion of all columns.

No separate quote or quote-line tables in initial design. Before checkout, summary is a server-calculated estimate. Checkout transaction recalculates and returns authoritative amount, creates held booking/items plus allocations, and freezes rate, duration, amount and relevant settings values on those items. If amount differs from displayed estimate, require customer acknowledgement before payment; never silently charge changed amount. Reuse same items through submission and confirmation rather than copy prices into a second subsystem. An internal held checkout is not a confirmed reservation; expire it without retaining unnecessary guest data. Persisted extension items follow same pricing rule when extension feature is added.

One current settings row/version and immutable held-item snapshots suffice; no settings-version service or full history framework. Hold ownership/expiry immutable; valid checkout uses agreed amount after rate edit. Conflict-check schedule/interval changes. Fail closed when price/payment identity missing. Final configured interval options/horizon boundary/rounding specified and tested before engine work.

### 5.4 Small independent reservation/payment model
Reservation pending approval, confirmed, rejected, completed; no-show separate outcome. Hold/expiry belongs allocation/checkout state. Payment submission unverified/accepted/rejected/exception; recorded collection linked once to accepted verified payment/cash. No Cancelled/Refunded/Partially Refunded states in target booking/payment workflow.

Core schema only: current settings, courts/hours, owner/staff access, held bookings/items, allocations, payment submission/verified-collection evidence, idempotency, audit and existing email outbox. Keep existing supporting proof/security objects needed by core flow. No separate quote subsystem. Add extension/Open Play records in Phase 3 and sales/inbox/subscriptions/push-delivery records in Phase 4 with their actual behavior and tests. Allocation constraint is designed for all occupying ranges now, but later modules do not need tables or dormant APIs upfront. Suggested SRS entities are not table-for-table mandate. No refunds/waivers/outstanding ledger or generic event sourcing. Preserve proof/reference/claimed-vs-received evidence and previous rejected submissions as needed by retention policy.

Extension provisional added range and priced items remain separate from original confirmed items until full extra payment verified; confirmation updates final end and accepts added item prices atomically. Confirmation/rejection/expiry locks booking plus extension. One active extension per booking is proposed simplest contract, to settle before implementation. No original schedule/payment mutation on failure.

### 5.5 Direct SQL security and connection operations
Supabase session verified server-side; fetch current enabled owner/staff role from server-controlled DB for sensitive requests. Proxy coarse gate, not authorization. Role changes effective next request; handle stale/revoked sessions and protect last owner transactionally. No role from editable user metadata/request payload.

Dedicated least-privileged app login for business DML, separate migration role. No schema owner/superuser credentials in runtime. Explicit table privileges, RLS/default deny for exposed business tables and no direct anon/authenticated business access. Runtime app role must have narrowly reviewed explicit access/policies; RLS does not automatically understand application staff identity on shared SQL connection. Capability checks remain mandatory in services. Do not blindly grant BYPASSRLS or reuse service-role key as SQL password. Auth/Storage administrative key separate, server-only.

Validated inputs, parameter binding, CSRF/origin controls for authenticated mutations, private signed proofs/owner-bound attachment, public rate limits in both proxy rules and matcher. Dedicated migration connection handles DDL. Verified TLS, correct region/endpoint, bounded pool, timeout and queue monitoring. Transaction-pooling means no session state/prepared statement assumptions. Test deployed function lifecycle/concurrency; choose measured limits, not arbitrary pool size from conflicting generic guides.

### 5.6 Durable delivery and scheduling, not another service engine
Transaction writes persistent inbox and bounded email/push work intents; Node worker logic runs after commit through existing request best effort and authenticated scheduled Next endpoint. Retry failures, identify stale claims, deduplicate events and remove invalid push subscription. No in-process cron/timer, no external send in DB transaction, no guarantee from `after()`.

Supabase Cron may schedule managed `pg_net` HTTP calls to authenticated Next worker route; these are platform internal functions, not application stored business procedures. Store scheduler credential privately, fail closed, bound batch time/count and protect duplicate invocations. Prove Free plan extensions/quotas, host compatibility and latency before relying on minute cadence. No extra job framework initially. Hosting currently unresolved; do not configure Vercel client production from old assumptions.

## 5A. Supabase vs Neon — evidence-based choice

| Topic | Supabase | Neon |
|---|---|---|
| Required SQL integrity | Postgres transactions, `btree_gist` range exclusion; no application RPC needed | Same PostgreSQL design, extension/plan availability verify |
| Reuse from source | Existing Auth/private Storage/SDK and Cron knowledge | Migration of auth/storage APIs if switching bundle |
| Current platform scope | DB/Auth/Storage/Cron | Docs now include Managed Better Auth, private S3-style storage and scheduled Functions; not database-only |
| Interactive transactions | Standard SQL connection; choose compatible driver/pool | TCP or WebSocket Pool/Client; HTTP transaction batch cannot branch between queries |
| Free quota snapshot | 500 MB DB, 1 GB files, 5 GB egress, 50k MAU, max two active projects, pause after inactivity; no automatic DB backups | Docs report 100 CU-hours/project/month, short six-hour restore history and quota-exhaustion suspension; verify Auth/Storage/Functions free entitlement/region |
| Jobs | Cron calls authenticated monolith route, feature/host quota proof needed | Scheduled trigger invokes separate Neon Function; retries/duplicates; minute DB work can prevent scale-to-zero and consume free compute |
| Recovery | Independent DB and object backup/restore needed | Independent restore/export/object/auth coverage also needed; short history not full backup strategy |
| Simplicity verdict | **Selected Supabase Free**, fewest migrations and managed services | Viable alternative, benefits do not justify current auth/storage/scheduler migration |

Neon Managed Auth docs currently AWS-only; storage available in specified regions including Singapore. Do not claim GA or unrestricted free bundle without explicit plan documentation. Do not split Neon DB + Supabase Auth/Storage solely for hypothetical portability. No provider gives correctness automatically; transaction/constraint/security tests mandatory.

Free-only accepted: no automatic paid upgrade or purchase. Supabase Free project's cap must be checked against existing account usage; use distinct client ownership/account, never evade limits. At 5 MB maximum receipts, 1 GB file quota can fill quickly; actual average receipt size/egress/retention need budget. No production retention policy invented to make quota fit.

**Hosting blocker:** Vercel Terms §4 limit Hobby to personal/non-commercial use. Paid client booking deployment cannot be planned on Hobby under those terms. No current commercially eligible free full-Next host selected; keep deploy blocked pending separate evaluation. Do not silently move to static-only/edge-only platform incompatible with Node SQL/mail or weaken SRS. Free projects can pause/exhaust quotas; accepted two-minute alert target and tested recovery need a feasible plan, not unsupported uptime promises.

## 5B. Open-source packages — minimal shortlist

| Package | Status | Why |
|---|---|---|
| `drizzle-orm` / `drizzle-kit` | Keep installed | Typed queries/schema and migrations; no second ORM |
| `zod` | Keep installed | Existing trust-boundary validation |
| `date-fns` / `@date-fns/tz` | Keep installed helpers | Manila day/overnight logic, not duplicate local date math |
| `@supabase/ssr` / `@supabase/supabase-js` | Keep Auth/Storage only | Avoid unnecessary auth/object migration |
| `nodemailer` | Keep installed | SMTP transport behind existing boundary; verified sender still required |
| existing Base UI/forms/table/Recharts/XLSX/UI primitives | Reuse as needed | No additional design/calendar/report toolkit for same capability |
| `pg` and required TS types | Candidate addition, install approval required | Compatible pooled interactive SQL path with existing Drizzle; exact endpoint/load/TLS proof first |
| `postgres` | Conditional reuse or retire business usage | Already installed but documented Supabase shared transaction-pooler hazard; no dual long-term DB clients |
| `web-push` | Candidate addition, install approval required | Established VAPID/payload encryption rather than handwritten crypto; browser-native Push API/service worker handles subscription/reception |
| `@neondatabase/serverless`, managed Better Auth SDK, S3 client | Not selected | Only justified if Neon choice changes |

Primary web-push package manifest fetched reports MPL-2.0. Verify exact chosen release/license obligations/security/Node support and release activity; fetched default-branch manifest is not proof published version is suitable. `pg`/Drizzle license and current maintenance also verified before adding/updating; do not label full dependency audit complete. No new dependency actually installed or approved by shortlist alone.

## 5C. Compatibility review and bootstrap status — 2026-11-19

User requested live Supabase Free foundation proof **before** audited fork copy, with no feature implementation. User later confirmed empty disposable Free project `tgvdukmhnsnsqhokbwbn`. Guarded executable `probe.mjs` and runbook prepared under `C:\Users\JKsars\AppData\Local\Temp\opencode\ethn-bootstrap-proof`. Parent repaired SQLSTATE parsing, RLS expectations and cleanup; syntax/self-test exited 0 and missing-credential guard exited 2 as expected. Two read-only connection attempts stopped at TLS certificate verification before database assertions; no writes performed. User then chose to **defer live proof and keep planning only**, not create offline fork. Destination folder NOT CREATED. Certificate/root trust remains unresolved; never weaken TLS to bypass it. Live mutation/concurrency/access tests remain NOT RUN, not passed. `psql` available; `pg` not installed. SQL capability probe cannot prove complete target migrations, application-driver integration, Auth/private Storage, recovery or scheduler behavior. Full target no-RPC schema still not implemented. Latest user instruction to apply all overengineering findings revises sequencing only: audited offline copy no longer depends on live proof, but folder creation still needs separate execution approval. Secure connection proof belongs before DB integration; actual migration proof follows schema implementation. No continuing live attempts, folder copy or application implementation authorized by this plan edit.

Temporary `probe.mjs` is a disposable diagnostic, not a second application schema or permanent bootstrap gate. Keep existing artifact/evidence for troubleshooting only; do not extend its standalone schema to model ETHN. Once application migrations exist, transfer relevant overlap/expiry/access cases into tests against those actual migrations and chosen driver, then retire duplicate probe fixtures. Do not delete existing diagnostic files as part of this plan-only revision.

Parent independently inspected package-lock metadata with a successful Node command (exit 0): Next **16.3.8**, React/DOM **19.3.0**, Tailwind **4.3.3**. Existing package/license/peer matches:

| Need | Existing package/version | Declared compatibility / license |
|---|---|---|
| Auth/SSR | @supabase/ssr 0.12.7 + supabase-js 2.117.2 | SSR requires JS ^2.114.0; MIT |
| Headless tables | @tanstack/react-table 8.21.3 | React/DOM >=16.8; MIT |
| Accessible UI foundation | @base-ui/react 1.8.0 + existing shadcn base components | React/DOM ^17 or ^18 or ^19, date-fns ^4; MIT package |
| Forms | react-hook-form 7.89.0 | React ^19 included; MIT |
| Validation integration | @hookform/resolvers 5.9.1 + zod 4.6.5 | RHF ^7.55, Zod ^4; MIT |
| Date picker | react-day-picker 10.0.2 | React >=16.8; MIT |
| Charts | recharts 3.10.1 | React/DOM ^19 included; MIT |

Keep these; no need to buy a UI/table package or replace managed auth. Package licenses are distinct from hosted Supabase/email quotas. Declared peer matching is **not runtime integration proof**. No install/build/typecheck/browser was run for compatibility review.

Optional only when justified: @tanstack/react-virtual **3.14.26** (MIT, React 19 peer, for genuinely large tables); react-dropzone **20.2.1** (MIT, React >=18, richer drag/drop only); web-push **4.0.0** (MPL-2.0, explicit push requirement). Better Auth **1.7.26** (MIT) and next-auth **4.24.15** (ISC) are optional replacement migrations, not additions to Supabase Auth; avoid unless required capability missing. Exact-release compatibility/license/security checks still precede any install. Versions from registry snapshot, not installed or recommended automatic upgrades.

Sources: https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs ; https://registry.npmjs.org/%40tanstack%2Freact-virtual ; https://registry.npmjs.org/react-dropzone ; https://registry.npmjs.org/web-push ; https://registry.npmjs.org/better-auth ; https://registry.npmjs.org/next-auth . Existing package claims independently checked against local lockfile.

## 6. Files and layer ownership in future fork

Paths relative to **future ETHN root only**. Existing paths are seams; new names proposed, not artifacts.

| Responsibility | Existing | Planned minimal changes |
|---|---|---|
| SQL runtime | `src/db/client.ts`, `schema.ts`, package files | Server-only pool/Drizzle client, schema/query/migration setup; replace business Supabase HTTP/RPC access |
| Domain transactions | booking/admin helpers, all business `src/app/api/**` | Focused booking allocations/payments/extensions/Open Play/sales functions using shared transaction, no generic repository |
| Security | `src/lib/admin/session.ts`, users/validation, `src/proxy.ts` | Current-role/capability guards and new-route rate limits |
| Migrations | generated `drizzle/*`, manual `supabase/*.sql` | One ordered migration manifest incl reviewed constraints/grants; old RPC files reference/archive only, not target deployment |
| Settings/time/price | constants/slots/hours/pricing/validation/calendar, `src/lib/courts.ts` | Settings-backed duration rules and immutable held booking-item prices; no quote tables; remove hourly/rental assumptions |
| Customer | page/book/contact/track and landing/booking/tracking components | Schedule-first ETHN theme, guest GCash/prepaid flow, private tracking, Open Plays page |
| Admin | bookings/calendar/hours/courts/finance/revenue/users/activity | Payment queue, prepaid walk-ins, extensions/no-show, Open Plays, paid sales and persistent notifications; remove cancel/refund/delete |
| Delivery | mail/outbox/cron auth/routes, notification bell | TS work claiming/drain, inbox/subscriptions, authenticated scheduled endpoint, service worker |
| Docs/ops | README/AGENTS/BACKUPS/env example/seed | ETHN SRS amendments, migration/access/backup/runbook/acceptance; no old-client defaults |
| Checks | `test/*.test.ts`, current loader | Targeted tests plus isolated DB concurrency/security/driver verification, no new test framework |

All source business RPC callers must be inventoried, not just booking: expenses, hours/courts, admin decisions/create, outbox claims, retention/proof prune and helpers. Replace runtime paths before traffic. Remove rental validation/charges/RPC insert equivalents/UI/mail/export/seed fixtures. Remove refund/delete endpoints/actions and old status tests from ETHN active scope, not source repo.

Do not edit archived generated Drizzle migrations/meta manually. Preserve source provenance/history separately; build a clean no-RPC target migration sequence with existing tooling and explicitly reviewed constraint/grant migrations. Never execute source RPC installer as convenient temporary target bootstrap. No additive migration chain may install forbidden custom functions as an unnoticed prerequisite.

## 7. Safe offline fork — Phase 0

1. Separately authorize copy execution; freeze source HEAD and audited copy manifest. Abort if destination exists; no overwrite/merge. Source uncommitted changes must be addressed explicitly. Live database proof is not a prerequisite for offline copying.
2. Copy generic source/config/lockfile/tests required for reuse, not `.git`, `.env*` except sanitized example, `.next`, `node_modules`, caches/logs/build artifacts, seed results, dumps/backups, customer uploads/proofs or source deployment links. Review hidden `.vercel`, Supabase linked-project/tool/MCP/session/browser metadata; exclude secrets and old project bindings. Review old images/manual/QR/3D/content individually.
3. Fresh local private-repo history/provenance; no push or remote creation without approval. Move future implementation session into ETHN root before write/install/DB commands. Retain source untouched. Rename package/root lock metadata without refreshing all dependencies. Copy contains legacy code, not a completed no-RPC app; do not run its SQL installers or connect it to either client's production.
4. After separate install/check authorization, install lockfile and capture baseline `npm test`, `npx tsc --noEmit`, `npm run build` exact status/output with no source credentials. Baseline failures logged, not fixed upstream or hidden. Static checks are a separate baseline result, not proof that copied app is safe to launch.

**Copy gate:** audited files/provenance present, prohibited files and inherited connections absent, source untouched. This proves only safe copy. No database, build or feature-completion claim follows from it. Checkout/deployment remain disabled.

### Separate connection and migration gates

- **Connection gate, before DB integration:** use only separately approved isolated Supabase project; confirm reference/Free quota, verified TLS and chosen application's same-connection interactive transactions. Credentials private, never source .env. Local connection proof may proceed before production host is selected; repeat pool/lifecycle tests on chosen host before launch. No generic capability probe required to create offline folder.
- **Migration gate, after each schema slice is implemented:** inventory source SQL for reference, then implement reviewed no-RPC migrations for current slice—not final future product all at once. Old RPC/Refund/Delete installers excluded. Apply actual migrations to fresh isolated database twice from empty starts, compare relevant schema/constraints/grants and verify absence of custom business functions/triggers. Test driver transactions and least privilege against installed app schema. Never report this gate passed before migrations exist.
- **Launch gate:** all implemented slices integrated, production host/driver/permissions/recovery/acceptance proven. Free host unresolved blocks launch, not offline copy or local planning.

Copy authorization does not authorize installation, live database access or feature implementation. Request missing scope approval at each gate.

## 8. Dependency-ordered work packages

Each package: define targeted examples/contracts, add failing focused tests, implement smallest coherent change, rerun focused checks, record evidence. All same transaction/schema writers one owner; do not parallelize overlapping files. No implementation authorized by this plan. Relevant current Next docs in `node_modules/next/dist/docs/` and current provider docs read before implementation.

### Phase 1 — core settings, permissions and allocation/payment foundation
- Freeze only core interval/minimum/alignment/horizon/rounding/held-price contracts. Half-hour cost prorated correctly; unset rate fails closed. Current settings row/version plus immutable booking-item prices, no quote tables or versioning platform. Extension-specific decisions wait for Phase 3.
- Add current owner/staff capability checks; seed owner safely and protect last owner. App DML vs migration grants; no runtime privileged DDL.
- Implement core schema slice only: settings, courts/hours, access roles, held bookings/items, allocations, payment submission/collection evidence, idempotency, audit and existing email outbox/private-proof support. Explicitly omit extension/Open Play/sales/inbox/subscription tables until their phases; omit cancelled/refund/receivable entities and custom functions/triggers entirely.
- Implement current-slice mutations in server-side transaction functions: hold/expiry/submit/payment verification/manual paid booking, relevant hours/settings and existing email outbox. Ordinary reads use parameterized queries, not automatic transaction wrappers. Fixed lock order/exclusion/idempotency/strict DB-time expiry. Disable unmigrated legacy routes; no `.rpc()` fallback or parallel business HTTP writer. Add later feature writers when their module is implemented; all must use same allocation authority before exposure.
- Apply/test actual core migrations from empty DB after implementation. Core overlap tests use real schema and chosen driver; include different-start overlap, adjacency, multi-court rollback and expiry/submission race. Later feature phases add their cross-kind cases to same tests, not parallel fixture schema.
- Update duration/price consumers needed by core flow and disable unmigrated reports/actions. Remove equipment rental inputs/charges from enabled paths; complete deletion of remaining disabled consumers with their owning phase before launch. Preserve court rental amount.

**Gate:** actual core migration and connection evidence, core overlap/expiry tests, role-deny and exact duration/overnight/settings tests pass. No enabled legacy RPC paths. No requirement to implement later modules to finish core foundation.

### Phase 2 — schedule-first ETHN booking and prepaid walk-ins
- Designer adapts navy `#16384d`, orange `#f28500`, white/off-white and athletic typography. Timetable/date/all active courts/selection summary before promotional hero. Preserve dark mode, keyboard/focus/text status/reduced-motion behavior.
- Summary/server total before details, checkout hold then guest fields/GCash recipient/reference/proof. Real countdown, slot loss, disabled missing-rate/payment config, expiry/uncertain-submit/idempotent recovery/late-exception states. No source-client QR or prototype fake numbers.
- Dedicated verification queue: proof/reference/claimed-vs-expected/received amount, time, duplicate flags. Confirm only after full verification; rejection only preconfirmation. No fake paid/approved labels.
- Walk-ins: hold, full cash collection or full authorized GCash verification, then confirmed. No outstanding balance/partial-payment path. Track/confirmation/email separately label submitted vs verified, preserve secure code+email/token contract.

**Gate:** two courts, 30-min minimum/window, multi-court ranges, full GCash/cash paths, pending protection, duplicate decision/response-lost recovery; private proof attachment/cleanup safe.

### Phase 3 — final-booking operations and Open Plays
- Add only this phase's required extension/Open Play schema and transactions, with incremental migrations and tests against actual installed schema. Reuse booking-item price snapshots and allocation constraint; no standalone quote subsystem.
- Completion after last confirmed end, audited no-show; overdue pending escalates, not autoapproved. Durable urgent notifications completed in Phase 4; private interim screens must not promise them yet.
- Prepaid extension priced items/added allocation/hold, timely proof review protection, full payment confirmation, failure leaves original unchanged. Settle one-active-extension and review/expiry rules now; resolve simultaneous expiry/verify and late extension payment.
- Open Plays public listing/admin create/edit/remove with own conflict-safe one/multiple court allocations; maintenance blocks same authority. No signup, recurrence, seat counters, payment UI.
- Remove ordinary booking Delete, Refund, Cancel and Reschedule routes/actions/navigation/exports/status assumptions. Verify confirmed booking cannot be released via disguised edit/reject API. Document mistakes external escalation, not hidden destructive endpoint.

**Gate:** original unchanged after failed extension, full-payment-only confirmation, no forbidden mutation path, Open Play cross-kind race tests and completion evidence.

### Phase 4 — sales, cash reports, persistent inbox and push
- Add sales and persistent inbox/read-state/device-subscription/push-work tables only with this phase's defined forms/events and tests. Reuse existing email-outbox mechanics; no generic queue/event framework. Apply/test incremental migrations against actual app schema.
- Paid sales staff attribution, immutable original/correction-date links and owner-only correction. Reconcile correction examples without refunds or generic adjustment engine.
- Replace Approved-total financial queries with actual verified booking/extension collections and paid sales; pending excluded. Cash/expense/XLSX/custom-date totals agree. Staff cannot access owner aggregate reports/exports/corrections. Occupancy uses allocated minutes, excludes closed time, shows Open Play/block usage separately.
- Durable per-recipient notification history/read state and device subscriptions. Events payment submission/pending/urgent/exception and required operations; cancellation events removed. Worker claim/expiry/backoff/dedup through SQL transactions, not DB functions.
- Add approved `web-push` only if its release/license gates pass; native browser permission/Push API/service worker. Reject unsupported/denied gracefully, no PII payload, independent delivery retry. No third-party push platform by default.
- Scheduled authenticated Next endpoint for due alerts/completion/work drain; prove Free Cron/host quotas/latency and monitor backlog/last successful run. Inline scoped mail best effort, durable drain guarantees only as measured—not daily Hobby cron or after() assumption.
- Brand public/auth/errors/loading/contact/manual/email/admin; rights-approved assets only. No UI browser automation without separate explicit permission.

**Gate:** immutable cash evidence/reconciled report examples, owner guards, persistent inbox across login/devices; denied/failed push cannot invalidate booking. Free job feasibility and commercially permitted host required before launch.

### Phase 5 — validation and launch
- Reconcile writer lanes then run final static/unit/build checks once; later edits invalidate affected evidence. Exact commands/exits/log excerpts required.
- Isolated DB concurrency, grants, no-RPC/bootstrap, verified TLS/driver/pool tests. SQL-text tests alone cannot prove races.
- Independent DB/Auth/private-object backup and restore drill; DB dump not object backup. Free Supabase no automatic backup entitlement; define owner-operated/eligible free backup routine and storage security before launch. No keepalive trick or quota evasion replacing proper plan.
- User browser/mobile/accessibility/email/device-push acceptance, including next-day end labels and error recovery. Server HTTP tests not visual proof.
- Official rate/GCash/contact/legal/assets/sender/domain/accounts/retention and hosting eligibility signed off. No production checkout with unknown values; no invented retention to fit free storage.
- Old-client linkage/secret scan incl public bundle/config/project URLs/QRs. Deploy only correct client, keep checkout off if integrity/worker/recovery proof absent. Rollback requires compatible schema/app pair or maintenance; old RPC-based version cannot safely serve new schema.

## 9. Verification and evidence matrix

Commands run only in future ETHN folder after approval: `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build`. Focused test uses existing Node loader with actual filename. New framework-free DB integration command/env safety documented in fork before claiming runnable coverage; never guess target or print credentials.

| Scope | Required proof |
|---|---|
| Time/price/settings | Half-hour and allowed alternative grids, minimum, horizon exact boundary, multi-court ranges, next-day 02:30–03:00, full end containment, host timezone independence, rate edit during hold, rounding/overflow |
| Concurrency | Independent connections: same/different-start overlap rejected, adjacency allowed, multi-court rollback, hold vs Open Play/block/extension, expiry vs submit, constraint final guard |
| Transactions/driver | Same checked-out client, rollback on mid-write failure, TLS verification, pool saturation/timeouts/serverless lifecycle, no forbidden prepared/session state; no application RPC dependencies |
| Submission/payment | Proof alone not collection, actual full payment before confirmation, duplicates/ref flags/mismatch, strict locked DB time, late exception, response-lost replay returns committed result |
| Policy scope | No unpaid confirmed walk-in/partial payment, cancellation/refund/reschedule/delete/confirmed-reject bypass; extensions prepaid and original unchanged on fail |
| Sales/reports | Payment timestamp net cash, pending excluded, no manual-sale duplicate, correction-date audit/reconciliation, expense/XLSX agreement, no refund/outstanding UI |
| Access | Owner/staff allow+deny per sensitive endpoint, current role revocation, forged role rejected, last owner protected, app DB no DDL, anon/authenticated no business table access, private proof access |
| Delivery | Durable recipient read state, duplicate jobs/event dedup, urgent/completion timestamps, failed/unsupported push, external-send failure leaves confirmed booking intact |
| Recovery/ops | Clean DB install twice, no custom functions/triggers/.rpc, DB/Auth/object restore, Free quota failure behavior, commercially permitted host, disabled checkout when unavailable |
| UX | User mobile/desktop/keyboard/focus/contrast/reduced motion, schedule-first, overnight dates, truthful pending/paid states, private tracking, all loading/error/empty/recovery states |

Test actual application migrations and chosen driver, not a separately maintained diagnostic schema. Temporary capability probe is optional troubleshooting only; retire its duplicate fixtures after actual-schema tests exist. Safe-copy, secure-connection and migration-install results are separate evidence claims. Reuse existing tests where helpful, add focused cases rather than second runner. Each implementation lane owns focused evidence; integrator runs final suite after reconciliation. Designer owns design; user owns browser E2E unless separately approved. Every subagent launch/resume requires explicit named-scope approval.

## 10. Amended SRS traceability

| SRS area | Target work/gate | Amendment |
|---|---|---|
| §§1,3.1,3.5 visual/public | Phase 2 and 4, UX/user acceptance | Prototype hero moves below timetable |
| §§2,3.2–3.3,6 settings/checkout/price | Phase 1–2 time/payment/race tests | Configurable 30min/30day, prepaid-only confirmation; no rentals |
| §§3.4,5.2 Open Plays/courts/blocks | Phase 3 allocation tests | Information only, one-off; no booking-cancel side effect |
| §§4.1–4.3 lifecycle/payment | Phase 1–3 payment/final-state tests | Remove Cancelled/Refunded/Partially Refunded and unpaid confirmation; retain expiry/rejection/exception/completion |
| §§4.4,5.3 extensions/outcomes/history | Phase 3 | Prepaid extension; no reschedule/cancel/delete |
| §5.4 verification | Phase 2 | Full collection proof; actual actor/time, discrepancy/ref flags |
| §5.5 walk-ins | Phase 2 | **Replaced** with temporary hold then paid confirmation; no outstanding ledger |
| §§5.1,5.6 dashboard/sales/reports | Phase 4 | Actual net cash/expenses, paid ledger, no outstanding/refund reporting |
| §5.7 refunds/cancellation | Removed | Explicit latest user amendment; external legal/payment resolution caveat |
| §§5.8–5.9 inbox/push/RBAC/audit | Phase 1/4 | Remove cancellation event; server roles, durable center, best-effort delivery |
| §7 suggested model | Phase 1 core; Phase 3 extension/Open Play; Phase 4 sales/inbox/push | Feature-local tables only; held booking-item prices, no separate quotes/refunds/receivables; PostgreSQL constraints, TS mutations not RPCs |
| §8 security/reliability/acceptance | Phase 5 | Accepted amended feature set; free hosting/recovery/scheduler proof required |
| §§9–10 inputs/phases | Sections 7–11 | Missing inputs explicit gates; full amended baseline before public launch |

## 11. Remaining decisions and approval gates

Owner inputs before launch: actual rate; official GCash recipient/QR/instructions; approved contact/policies/identity/photos; client-owned accounts/domain; owner/staff identities; verified email service/sender; lawful retention for PII/proofs/cash/audit/inbox plus backup responsibility. User confirmed reuse rights for supplied code/design; dependencies/third-party assets still audited.

Technical gates apply only to owning phase, not all before first code. Core: supported intervals/alignment/horizon/rounding, held booking-item price snapshots, minimal core schema/grants and compatible `pg`/Drizzle connection with verified TLS. Phase 3: extension timely-submission/expiry and one-active-extension rules, Open Play schema. Phase 4: exact sales-correction reconciliation, inbox retention/recipients/dedup and push schema. Before launch: minute Cron/host proof, commercially eligible free full-Next hosting, Free quota monitoring and independent backup/restore. Actual migration-install proof follows each implemented schema slice; none is required merely to authorize offline source copy.

No paid services authorized. If free-only constraints cannot meet host terms, storage, backup or timing requirements, stop with explicit blocker. Do not weaken integrity or invent service guarantees. Seek approval for changed budget/scope rather than deploy anyway.

Review Sections 4/5 first, then migration/driver/hosting gates. Approval to revise this document is not approval to copy repository, install packages, connect services, publish or deploy. Ask separately to execute Phase 0 after review.

## 11A. Overengineering review resolved

1. Removed circular bootstrap gate: safe offline copy, secure connection and actual migration installation now separate claims (§7). Copy still requires execution approval, not completed product schema.
2. Removed separate quote subsystem: immutable rate/duration/amount/settings values live on held booking items reused through submission/confirmation (§5.3); no duplicate quote tables.
3. Removed transaction wrappers for ordinary reads: parameterized queries by default, explicit transaction for atomic mutations/consistent-snapshot needs only (§5.1 and Phase 1).
4. Removed speculative Phase 1 tables: extension/Open Play schema ships in Phase 3; sales/persistent inbox/push schema in Phase 4 (§5.4, §8). Existing email reliability remains core.
5. Standalone probe becomes disposable diagnostic, not parallel product schema or mandatory copy gate; authoritative tests use actual migrations/application driver (§5C, §9).

Kept overlap exclusion, role/private-proof security, exact money, idempotency, audit and durable email because they protect real correctness. Persistent inbox/push remain accepted later scope, not removed without approval.

## 12. Primary research sources and qualifications

Retrieved 2026-11-19; prices/entitlements/features change. Official docs used because Context7 discovery unavailable. No live quote or account entitlement verified.

- Supabase pricing/free quotas/pause/no automatic backups: https://supabase.com/pricing
- Supabase connection modes/pooling/limits: https://supabase.com/docs/guides/database/connecting-to-postgres and https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits
- Critical postgres.js shared-pooler warning: https://supabase.com/docs/guides/database/postgres-js
- Supabase backup/object exclusions: https://supabase.com/docs/guides/platform/backups
- Supabase Cron: https://supabase.com/docs/guides/cron
- Neon plans/free compute/recovery: https://neon.com/docs/introduction/plans
- Neon driver interactive-vs-HTTP transactions/pooling: https://neon.com/docs/serverless/serverless-driver and https://neon.com/docs/connect/connection-pooling
- Current Neon Managed Auth: https://neon.com/docs/auth/about
- Current Neon private object storage: https://neon.com/docs/storage/overview
- Neon scheduled Functions/retries/region/deployment caveats: https://neon.com/docs/compute/functions/triggers/overview and https://neon.com/docs/compute/functions/triggers/schedule
- PostgreSQL range constraints/half-open ranges/btree_gist: https://www.postgresql.org/docs/current/rangetypes.html
- node-postgres same-client transactions: https://node-postgres.com/features/transactions
- Vercel serverless pool lifecycle: https://vercel.com/kb/guide/connection-pooling-with-functions
- Vercel Hobby commercial-use restriction, Terms §4: https://vercel.com/legal/terms#hobby-plan
- web-push source/license manifest: https://github.com/web-push-libs/web-push and https://raw.githubusercontent.com/web-push-libs/web-push/master/package.json

Skipped: implementation, new folder, installs, browser, live services/driver load tests, exact-release maintenance/license audit and backup/restore. Main blockers: commercially eligible free hosting, safe transactional connection, no-RPC clean bootstrap and free-tier operational recovery/timing proof.
