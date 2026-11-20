# ETHN database and access chain

Active ETHN services use this schema through server-side SQL transactions. Migrations 0001–0011 were exercised on disposable PostgreSQL 18.2 and the separately approved disposable Supabase project. Those results are dated evidence, not permission to apply migrations to another environment or proof of production readiness.

## Fresh installation only

Provision a dedicated `ethn_checkout` login separately from migration credentials. Verify it is not schema owner, superuser, CREATEDB, CREATEROLE or BYPASSRLS and has no elevated memberships. Keep credentials outside SQL files and Git. Remote connections require certificate and hostname verification.

Review and apply these files in numeric order to a fresh, empty ETHN database:

| File | Responsibility |
|---|---|
| `0001_core.sql` | Settings, courts/hours, staff access, bookings/items, allocations, proof/payment evidence, idempotency, audit and email outbox; initial courts and unset rates |
| `0002_checkout_access.sql` | Runtime checkout grants and RLS |
| `0003_proof_reservation_access.sql` | Receipt reservation and frozen-price acknowledgement |
| `0004_submission.sql` | Pending submission, unreviewed late exceptions, single proof attachment and outbox intent access |
| `0005_tracking_access.sql` | Safe payment-column reads for tracking |
| `0006_outbox_access.sql` | Claimed-mail fencing token and worker access |
| `0007_staff_payment_read.sql` | Staff membership lookup and payment-review reads |
| `0008_payment_decision.sql` | Submission timestamp and authorized approve/reject access |
| `0009_owner_pricing.sql` | Owner pricing and court-name update access |
| `0010_owner_hours.sql` | Owner weekly-hours replace/delete access |
| `0011_staff_access.sql` | Owner staff listing and role/enabled management access |
| `0012_exception_review.sql` | Late-exception assessment write policy |

This chain is not idempotent: repeatability means successful installation into independent fresh databases, not blindly rerunning CREATE statements. Never append it to the legacy `drizzle/` or `supabase/` chain. Existing data requires a separately reviewed migration plan. Migration 0004 depends on the original generated constraint name `payments_check3`; local and approved hosted installation verified this chain, but changing 0001 can invalidate that dependency. Migration 0008 gives existing payment rows migration time, not historical submission time.

## Invariants and shared-role boundary

- Allocation GiST exclusion prevents overlapping occupying ranges, including different starts. Expiry/rejection explicitly releases state; no time-dependent index predicate.
- Runtime grants/RLS do not identify a human user or customer. Services enforce owner capability and current enabled staff role. Settings/court UPDATE-column grants support row locks and require trusted code.
- Idempotency result may be NULL only inside an unfinished transaction. Services write completed result before commit; failures roll back. Replays precede expiry/Storage preflight where required.
- Booking items freeze agreed prices. Exact money, permitted state transitions, full payment, immutable proof ownership and last-owner protection require service validation and integration tests beyond declarative constraints. Owner staff management protects the last enabled owner in its service transaction; the declarative schema still cannot enforce it.
- Submission records a claim, not collection. Timely submission retains pending allocations; late evidence becomes unreviewed exception without reacquiring inventory. Staff exception review records an immutable private assessment only; it does not change the exception, booking, inventory, money or outbox.
- Verified GCash references use exact C-collated equality; application trims outer whitespace only. Current approval checks frozen merchant and full amount. No refund, cancellation, unpaid-confirmed or rescheduling path.
- Outbox payload contains private tracking capability. Worker supports submission/approved/rejected intents; scoped post-response drain is opt-in and best effort. Authenticated backstop exists but has no provisioned scheduler. SMTP is at least once; duplicates remain possible after uncertain send outcomes.
- No orphan receipt deletion is enabled. Attached/uncertain-commit proof lifecycle and retention require explicit operational policy before cleanup.

## Evidence and checks

See `docs/checks/2026-11-20-booking-payment-cutover.md`, `2026-11-20-browser-verification-repair.md` and `2026-11-20-outbox-backstop.md`. They distinguish local SQL, browser, hosted Auth/Storage and fake/local mail evidence.

Default `npm test` skips conditional database cases unless their test-specific environment is supplied. `test/ethn-payment-decision.test.ts` and `test/ethn-exception-review.test.ts` mutate fixtures; use only a new disposable database with actual migrations and restricted login. `test/ethn-staff-payment-read.test.ts` also needs its documented fixed fixture, not arbitrary production data. The full acceptance harness and fixture are recorded in `docs/checks/2026-11-20-booking-payment-cutover.md`; temporary evidence paths are machine-local, not a portable production runbook. Never point either test at a live customer database.

Request validation currently bounds a selection to 100 court entries as an abuse limit. Reassess before a venue can legitimately exceed it. Production host/pooling, backups/restore, scheduling, real rates and official GCash instructions remain launch gates. Additional owner/settings/staff, walk-in, completion/no-show, extension, Open Play, sales and push modules require their own migrations and tested writers using the same allocation authority.
