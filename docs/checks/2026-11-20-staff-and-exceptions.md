# Staff access and late-payment exception review

2026-11-20. Local implementation and verification only: no hosted migration, browser run, deployment or real Auth account creation.

## Owner staff access

- `db/ethn/0011_staff_access.sql`: INSERT/UPDATE (`role`,`enabled`) grants plus permissive-fine RLS for membership rows; no DELETE.
- `src/lib/admin/ethn-staff-management.ts`: owner-only list and upsert. Lock order is all staff rows ascending `FOR UPDATE`, then the settings singleton `FOR UPDATE`, then a non-locking re-read, actor-owner recheck, last-enabled-owner check, upsert, audit.
- `src/lib/admin/ethn-staff-server.ts`: `authUserExists` reads the existing Auth project through `ETHN_STORAGE_URL`/`ETHN_STORAGE_SERVICE_ROLE_KEY`; no new configuration. The lookup now runs only after the caller is confirmed as an enabled owner, so a staff caller cannot probe Auth accounts.
- `src/app/api/ethn/admin/staff/route.ts`: GET/PUT with origin guard and 4096-byte JSON cap. `TARGET_NOT_FOUND` → 404, `LAST_OWNER` → 409, unauthorized → 401/403.
- `src/app/admin/staff/*`: minimal owner screen — list, per-row role/enabled edit, grant by existing Auth user ID. No invitations, passwords or account creation.

## Late-payment exception review

- `db/ethn/0012_exception_review.sql`: `payments.reviewed_at/reviewed_by/review_reason` write policy limited to `status = 'exception'` rows with all review fields set.
- `src/lib/admin/ethn-exceptions.ts`: queue (unreviewed exceptions on expired bookings, limit 50), detail and review. Review locks actor → booking → payment, requires an attached owned proof, writes only the review fields, and audits `exception.review`. It never touches allocation, payment status, collected amount or outbox. Repeating the identical note returns the stored review; a different note returns `REVIEW_ALREADY_FINAL` (409).
- `src/app/api/ethn/admin/exceptions/*`: staff-readable queue/detail and POST review. Private proof is reached through the existing signed-URL payment endpoint.
- `src/app/admin/exceptions/*`: pending queue, detail, private proof link and one-shot review note. The screen states that no slot, refund or acceptance is created.

## Evidence

Fresh disposable PostgreSQL 18.2 cluster, migrations `0001`–`0012` in order, restricted `ethn_checkout` login (no superuser/BYPASSRLS), two independent databases:

- `test/ethn-staff-management.test.ts`, `test/ethn-staff-lookup-boundary.test.ts` — exit 0. Covers validation, staff denial, insert/promote/no-op audit suppression, self-change with another owner present, last-owner rejection, concurrent demotion, 8 pricing-vs-membership races, and no zero-owner outcome. Boundary test proves a staff caller is denied before any Auth lookup.
- `test/ethn-exception-review.test.ts` — exit 0. Covers staff/owner allow, disabled denial, ordinary pending payment rejected, identical-note idempotence, changed-note 409, concurrent different notes (single winner), unchanged booking/allocation/money/outbox, and single audit row.
- Harness: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-major-batch/verify.mjs` plus dated `run-*` output; cluster stopped and verified in `finally`.
- Repository checks after screen integration: `npm test` 317 total / 309 pass / 0 fail / 8 conditional DB skips; `npx --no-install tsc --noEmit` exit 0; `npm run build` exit 0 with both new admin routes compiled.

## Limits

- Migration `0011`/`0012` are not applied to the hosted disposable project; no browser or Auth-identity test of either screen exists yet.
- The rare deadlock between a membership insert and a concurrent pricing edit relies on PostgreSQL aborting one transaction and the single service retry. Documented in code.
- `ETHN_STORAGE_URL` must be the same project as Auth for target verification to mean anything.
- Review is an assessment record, not a resolution workflow: no late-payment acceptance, refund, slot restoration or customer-visible outcome is implemented.
