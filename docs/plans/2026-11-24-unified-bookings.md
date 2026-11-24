# Unified Bookings and Payment Management Plan

**Status:** Planning only. No implementation, database changes, scheduler provisioning, browser use or deployment authorized.

**Goal:** Bring Paddle Culture booking-management layout and actions into one ETHN Bookings page, preserving ETHN branding and transactional safeguards.

**Architecture:** Adapt source presentation, not its Supabase services or retired APIs. Reuse ETHN booking reads, staff calendar, payment decisions, private proof access, walk-in pricing/validation/locking patterns and outcomes services. Internal creation replaces the hold-dependent path with direct atomic confirmation; do not reuse the reserve/confirm contract for that flow. Add narrowly scoped refund/archive persistence and extend payment contracts through reviewed additive migrations.

**Stack:** Existing Next.js 16, React, TypeScript, PostgreSQL, npm and installed UI components. No new tooling or dependencies.

## 1. Reviewed decisions

### Unified management page
- `/admin/bookings` owns booking and payment review. `/admin/payments` redirects here; remove separate Payments navigation and update entry links.
- Use Paddle Culture management-page composition: responsive table/mobile cards, search, status/date filters, pagination, refresh, occupancy grid, detail dialog and New booking entry.
- Retain ETHN shell, brand, typography and colors. Keep existing ETHN summary fields in rows; contact/court/time details remain in details.
- Preserve URL-backed filters, server-side paging, loading/error/empty states and full-detail access.
- Use ETHN statuses: pending, confirmed, completed, expired, rejected. Refund adds a documented terminal outcome; archive is visibility metadata, not a booking/payment status.
- Occupancy uses staff-only calendar data, not public availability. Show booking states, holds, blocks and inactive/closed periods using actual ETHN schedule data. Booking cells open details; holds/blocks expose only supported information.

### Online payment review
- View private proof and payment information from booking details; approve or reject there.
- Preserve the payment method selected by customer. Never replace method with GCash during approval. Do not silently add new public checkout methods as part of this task.
- No receipt-time, reference-number or collected-amount input in online review.
- Staff explicitly confirms checking merchant account and receiving full booking total. Screenshot alone does not establish receipt.
- On approval, derive accepted/collected amount from locked server-side booking total; preserve original customer-claimed amount separately. Client cannot supply an authoritative amount or method.
- Keep customer-submitted reference in history; do not invent independently verified reference or actual receipt time. Record staff identity and server verification timestamp separately.
- Rejection needs trimmed customer-visible reason, maximum 500 characters, and confirmation. Preserve transactional booking/payment/allocation changes, idempotency, audit and notification behavior.
- Only pending bookings with compatible unverified payment/proof may be decided. Preserve stale-state, revoked-staff and uncertain-commit handling. No partial approval.

### Internal creation
- Staff creates paid bookings at configured rates, with overlap protection; successful payment confirmation immediately confirms booking.
- Required method: Cash, GCash or Metrobank. Optional actual payment time and optional reference number. No screenshot required.
- Confirm full payment received; GCash/Metrobank require merchant-account check. Derive accepted amount from locked quote, not client price.
- Missing actual payment time remains unknown; server creation/verification timestamp remains mandatory. Supplied time must be valid and not future-dated.
- Staff submits internal creation directly: atomically validate current availability/rates, insert confirmed booking and allocations, record accepted payment and audit. No held/pending booking, reserve step, hold ID or later approval. Reuse existing pricing, schedule validation and transaction/locking patterns, not the reserve/confirm workflow. Concurrent conflicts reject creation without partial booking/payment records.
- Staff may cancel confirmed internal bookings without refund: release only future slots, keep accepted payment and all booking/audit history, record a distinct cancelled outcome. Label action Cancel booking, not permanent Delete. Archive remains a separate visibility action. Do not reopen elapsed slots or rewrite completed attendance/history. Cancellation after any slot starts requires an explicit supported-state rule before implementation.
- Alternatively, staff may record a full external refund before first slot starts; the existing pre-start refund cutoff remains confirmed.
- Source multi-court creation parity needs an explicit decision because current ETHN walk-in contract handles one court/range.

### Refund and archive
- Full refund only for confirmed bookings before first slot starts. No partial refund or refund after play starts.
- Money is returned externally first. Require reason and external refund reference, then record refund transactionally, release allocations and preserve payment/audit history. Application does not send money. Internal bookings additionally support non-refund cancellation: release future slots, retain accepted payment and history. User reconfirmed internal refunds are before first slot only.
- Delete means archive terminal bookings (rejected, expired, completed or refunded), never hard delete. Keep archived-record access; default list excludes archives. Archive must not release slots, cancel live bookings or erase finance history.
- Add internal cancellation service/route and focused tests alongside refund/archive: authorize enabled staff, lock booking and allocations, require internal-origin eligibility, serialize against refund/completion, make retries idempotent, preserve collected amount, release future allocations only and audit cancellation. Extend booking/read/filter/schema consumers for cancelled outcome; test concurrent cancel/refund and unauthorized attempts.
- Enabled owners and staff can create, approve, reject, cancel internal bookings, refund and archive. Enforce all permissions on server, not only controls.

### Automatic completion
- Remove manual Complete ended bookings control.
- Use scheduled protected server operations endpoint to mark confirmed bookings completed after final slot ends, including confirmed extensions; skip pending extensions as existing service does.
- Scheduler must run independently of open browser. Existing worker processes at most 50 bookings per invocation; scheduling/backlog handling must account for this.

## 2. Evidence and impact

Source reference root: `C:/Users/JKsars/Documents/projects/paddle-culture`.
- Management: `src/app/admin/bookings/{page,bookings-table,columns,booking-card,booking-actions,occupancy-grid}.tsx`.
- Details/actions: `src/components/admin/booking-detail-dialog.tsx`.
- Separate creation: `src/app/admin/bookings/new/page.tsx`, `src/components/admin/booking-create-form.tsx`.
- Source API calls must not transfer; equivalent old ETHN routes are retired 410.

Target evidence:
- `src/app/admin/bookings/bookings-view.tsx`: active management page.
- `src/app/admin/bookings/booking-detail.tsx`: already contains on-demand private proof access; reuse rather than duplicate.
- `src/app/admin/payments/payment-review.tsx`: existing review UI, confirmation, retries and decision handling.
- `src/lib/admin/ethn-payment-decision.ts`: currently hardcodes GCash eligibility and requires reference, amount and actual received time; contract must change.
- `src/lib/admin/ethn-walk-ins.ts`: existing held booking/confirmation, cash/GCash methods, required GCash reference; extend in place.
- `src/lib/admin/ethn-outcomes.ts`: completion and allocations transaction, audit, 50-record batch.
- `src/app/api/cron/ethn-operations/route.ts`: authenticated completion endpoint already exists; scheduler not provisioned.
- `db/ethn/0001_core.sql`: only cash/GCash, accepted-payment constraints require received time and electronic reference. `0013_walk_in.sql`, `0021_extensions.sql`, and related policies depend on these shapes.
- `src/lib/admin/ethn-finance.ts`: cash/GCash buckets only; uses `received_at` for collection dates. Nullable actual time and Metrobank otherwise disappear from reports.
- `README.md`, `docs/ETHN-CUTOVER-API.md`, `docs/checks/2026-11-21-walk-in-holds.md`: current architecture and local-only evidence. Global project instructions contain older scope statements; current implementation must be inspected rather than assuming workflows absent.

## 3. Decisions needed before implementation

These are not permission to silently choose new business rules:
1. **Unknown receipt date in finance:** recommended reporting date is actual receipt time when known, otherwise verification time explicitly labeled as fallback. Never write fallback into actual-receipt column. Confirm before changing finance semantics.
2. **Refund reporting:** recommended immutable refund ledger with separate gross collections, refund totals and net collections by recorded return date; archive never removes collections. Define reports/XLSX treatment and preserve original payment rows.
3. **Internal booking selection:** confirm whether existing single-court/range creation is sufficient or source multi-court/multi-range parity is required. Do not promise source creation parity with current walk-in contract.
4. **Scheduler target and cadence:** recommended every minute if host supports it; no deployment provider or provisioning authorized. Preserve 50-record bound and make backlog behavior visible; test repeated invocations drain backlog.
5. **Existing-data migration:** inspect actual schema version using approved non-secret diagnostics only, then prepare migration review. No data access or migration execution authorized by this plan.
6. **Implementation ownership:** UI changes require designer involvement under project workflow, but no new agent run is authorized. Obtain explicit agent/scope approval before any delegation. Browser inspection also needs separate explicit permission.

## 4. File/change map

Extend existing:
- `src/lib/admin/ethn-payment-decision.ts` and `src/app/api/ethn/admin/payments/[bookingId]/decision/route.ts`: proof-based review contract with merchant verification attestation, authoritative total and preserved method.
- `src/lib/admin/ethn-payments.ts`, `ethn-booking-read.ts`, `ethn-calendar.ts`: compatible read DTOs, refund/archive visibility and method preservation.
- `src/lib/admin/ethn-walk-ins.ts`, `src/app/api/ethn/admin/walk-ins/route.ts`, existing creation callers: direct atomic confirmed creation without a hold, three methods, optional receipt time/reference and authoritative paid quote. Inspect other reserve callers before changing or removing their contracts.
- `src/lib/admin/ethn-finance.ts`, finance DTO/UI/export consumers and analytics queries affected by refunded states, unknown receipt date or method enumeration.
- `src/app/admin/bookings/{bookings-view,bookings-table,booking-card,columns,booking-detail}.tsx`, filters and `[id]/page.tsx`: unified page and details.
- `src/app/admin/bookings/new/page.tsx`: replace retired redirect with active internal creation.
- `src/app/admin/payments/page.tsx`: redirect; remove unused `payment-review.tsx` only after review logic transferred and callers checked.
- `src/components/admin/admin-sidebar.tsx`, `attention-panel.tsx`, `src/app/admin/page.tsx`, login defaults and admin auth redirects: one management destination; avoid redirect loops.
- `src/app/api/cron/ethn-operations/route.ts`: retain authenticated endpoint; adjust only if backlog strategy requires it.

Create focused modules:
- `src/lib/admin/ethn-booking-refunds.ts`, `ethn-booking-archive.ts`: authorized idempotent transactions.
- `src/app/api/ethn/admin/bookings/[id]/refund/route.ts`, `archive/route.ts`: origin checking, exact input validation, staff boundary, private responses and stable errors.
- `src/app/admin/bookings/occupancy-grid.tsx`: source composition adapted to ETHN calendar.
- `src/components/admin/ethn-booking-create-form.tsx`: adapt existing field/validation patterns with non-reserving quote and direct atomic creation; no held quote, reserve request or source backend.
- New reviewed SQL-first upgrade under `db/ethn/` using next free sequence at implementation time. Register with existing ETHN migration process; never hand-edit generated Drizzle artifacts or rewrite historical migration files.
- Focused tests named below; `docs/checks/2026-11-24-unified-bookings.md` for actual results after execution.

## 5. Ordered implementation tasks

### Task 1 — Close decisions and contract blast radius
1. Resolve section 3 business decisions before coding.
2. Read current installed Next.js guides before route/component changes; applicable project instructions and latest payment/finance/migration checks remain mandatory.
3. Enumerate payment method/status, receipt-time, accepted-reference, booking outcome and allocation-state consumers across schema/RLS, submission, tracking, extensions, finance/export, dashboard, mail and tests.
4. Freeze exact request/response contracts and error mapping before schema edits. Keep retired routes retired.

**Acceptance:** every changed invariant has identified callers and regression tests; no public Metrobank rollout assumed.

### Task 2 — Payment schema compatibility
1. Add failing database checks in `test/ethn-payment-decision.test.ts`, `test/ethn-walk-in.test.ts` and migration tests for missing actual receipt time, three internal methods, preserved submitted evidence and mandatory verified actor/time/amount.
2. Prepare additive SQL migration to support chosen shapes and refund/archive metadata, grants and RLS. Keep online proof requirements separate from internal staff attestations and extension rules.
3. Update schema declarations through existing workflow; do not regenerate or apply migrations without approved scope.
4. Validate fresh chain and upgrade from prior supported schema using separately authorized disposable database, restricted runtime role and effective grants/RLS tests.

**Acceptance:** no synthetic references/timestamps, existing payment history retained, cash and extension invariants unchanged except explicitly approved changes.

### Task 3 — Online decisions
1. Update tests to approve with idempotency key plus explicit full-payment/merchant-verification attestations, without receipt/reference/amount inputs.
2. In `decidePayment`, lock booking/payment, validate compatible submitted method and attached proof, derive collected amount from booking total and retain method/claimed amount/reference. Preserve actor, audit, outbox and allocation transaction.
3. Update route body validation and every existing caller together. Reject unexpected authoritative amount/method overrides.
4. Test rejection reason bounds, duplicate replay, different-key competing decisions, revoked staff replay, missing proof, incompatible method and uncertain commits.

**Acceptance:** approval cannot switch methods, duplicate collections or approve a partial amount; no online staff-entry requirement for time/reference.

### Task 4 — Internal bookings
1. Add direct-creation tests for cash/GCash/Metrobank, absent/present reference and actual time, future-time rejection and no screenshot requirement. Assert no held/pending booking is created and no hold ID is required.
2. Adapt internal creation to one authorized idempotent transaction: lock applicable settings/courts, validate current schedule and displayed quote/version, create confirmed booking/allocations and accepted payment, then audit. Keep allocation exclusion and rollback every write on conflicts; no reserve call or holding period.
3. Use server-validated total for collected amount; require explicit full-payment confirmation and electronic merchant-account verification.
4. Implement agreed selection cardinality with concurrent overlap checks. Preserve unrelated reserve callers until separately reviewed; do not create a hidden temporary hold for this flow.

**Acceptance:** immediate confirmed paid booking; no overlap, partial collection, duplicate payment or invented receipt time.

### Task 5 — Full refund
1. Create `test/ethn-booking-refunds.test.ts` for before-start eligibility, full original accepted amount, required reason/reference, owner/staff authorization and replay/conflict cases.
2. Implement refund ledger/state change with consistent staff/court/booking/payment locks and database time; no external transfer API.
3. Validate no used/started slots, unsupported extension/payment state or duplicate refund. For extensions not covered by agreed full-refund policy, reject explicitly rather than silently lose money.
4. Release eligible allocations, preserve accepted collection evidence, add audit and update read projections atomically.

**Acceptance:** no record deletion or overwritten original payment; repeated request cannot record a second refund. Known inability to atomically commit an external money return and SQL record is documented; uncertain results require retry/reconciliation, never sending money twice.

### Task 6 — Archive and financial projections
1. Create `test/ethn-booking-archive.test.ts` for terminal-only archive, repeat safety, default exclusion, archived retrieval and financial-history preservation.
2. Implement archive metadata and authorized route; do not alter booking/allocation/payment outcome on archive.
3. Update list filtering/paging and detail DTOs; add explicit archived-record access.
4. Implement approved finance date/refund rules and Metrobank bucket end-to-end through reports/export/analytics; retain decimal-string money with integer-cent arithmetic.
5. Extend `test/ethn-finance.test.ts`, relevant analytics tests and `test/finance-ui-export.test.ts` to prove no Metrobank or undated approved collection disappears, refund does not double-count and archive never changes totals.

### Task 7 — Unified page and creation UI
1. With approved UI ownership, adapt source composition into existing ETHN components. Do not globally replace tokens or shell.
2. Merge review into booking dialog, retaining proof-link expiry, confirmation, stale-response protection, retry idempotency, busy/error states and accessible labels/focus.
3. Add conditional approve/reject/refund/archive controls and internal creation entry; derive availability from authoritative server state, not client status assumptions alone.
4. Add occupancy from staff calendar; refresh list, selected detail and occupancy after mutations.
5. Remove manual completion control. Redirect Payments page and fix navigation/login/dashboard/detail links, keeping payment APIs.
6. Update source-level/UI interaction checks: URL filters, mobile cards, pending-only decisions, exact method labels, optional internal fields and no online reference/time inputs. Add keyboard/dialog/proof and stale-selection behavioral checks using existing test facilities.

**Acceptance:** staff can review and decide bookings without visiting separate Payments page; no retired endpoint calls or duplicate review implementation.

### Task 8 — Scheduled completion
1. Extend `test/ethn-outcomes.test.ts` and `test/ethn-operations-cron-guards.test.ts`: final-slot boundary, confirmed extensions, pending-extension skip, repeated runs, more than 50 due bookings and unauthorized cron.
2. Keep completion independent of page load; retain protected cron and bounded transactions.
3. Document scheduler URL, authorization, approved cadence, backlog monitoring and failure handling. Provision only under separate explicit hosted authorization.

**Acceptance:** local job behavior verified; automation not claimed live until approved scheduler evidence exists.

### Task 9 — Final verification and handoff
1. Run focused tests per changed lane; investigate failing excerpts before repairs.
2. After reconciliation, run once: `npm test`, `npx --no-install tsc --noEmit`, `npm run build`. Record exact commands, exit codes and relevant logs. Conditional database test skips are not passes.
3. Obtain separate permission for browser acceptance, or provide user checklist: responsive list/cards, filters/back button, occupancy/day switching, dialog keyboard focus, proof access/expiry, approve/reject refresh, internal methods/optional fields, refunds, archive access and redirect behavior.
4. Document actual evidence, schema upgrade requirements, scheduler not provisioned and remaining risks in dated check. No production-readiness claim.

## 6. Focused command baseline

Use installed Node runner; tests importing app modules require project loader:

```sh
node --import ./test/register-loader.mjs --test test/ethn-payment-decision.test.ts test/ethn-staff-payment-read.test.ts test/ethn-booking-read.test.ts
node --import ./test/register-loader.mjs --test test/ethn-walk-in.test.ts test/ethn-outcomes.test.ts test/ethn-operations-cron-guards.test.ts
node --import ./test/register-loader.mjs --test test/ethn-booking-refunds.test.ts test/ethn-booking-archive.test.ts test/ethn-finance.test.ts test/finance-ui-export.test.ts
npm test
npx --no-install tsc --noEmit
npm run build
```

New-test commands become runnable after corresponding tasks. Inspect each database test's existing environment contract and use only approved disposable databases; do not point tests at configured hosted/runtime data. Existing source inspection is planning evidence only, not test execution.

## 7. Scope exclusions and release gates

No hard delete, partial refunds, automatic money transfer, unpaid/credit bookings, custom rates, public-method expansion, dependency installation, hosted mutation or unauthorized migration. Do not copy source credentials, storage paths, database services or legacy API assumptions. UI/browser acceptance, database upgrade verification and scheduler operation remain explicit gates.
