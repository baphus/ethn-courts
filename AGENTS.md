# AGENTS.md — ETHN courts

Single-package Next.js 16 / React 19 app, npm with `package-lock.json`, Node 22.6+. ETHN booking and venue administration are locally implemented; this is not a production-ready deployment. Legacy fork code remains alongside active ETHN code.

## Find current truth

- Before behavior changes, read `README.md`, relevant API/feature docs and recent `docs/checks/`. Check active page/service wiring: old components and legacy reads do not establish supported workflows.
- Current Unified Bookings checkpoint: `docs/checks/2026-11-24-unified-bookings-implementation.md`. It supersedes earlier claims that cancellation/refunds, configurable payment methods or direct internal bookings do not exist. `docs/LOCAL-CUTOVER-STATUS.md` and older API docs can lag newer work; reconcile them with source and newer evidence.
- Historical fork requirements, `docs/DECISIONS.md` and offline-draft claims in `db/ethn/README.md` are reference, not current architecture or deployment evidence.

## Commands and files

- `npm run dev`, `npm run build`, `npm start`.
- `npm test`: Node test runner with `test/register-loader.mjs`. Conditional database tests need separately configured disposable databases; skipped tests are not verification.
- `npx --no-install tsc --noEmit --incremental false` checks types without updating incremental artifacts.
- ETHN migration scripts: `npm run db:status`, `npm run db:migrate`, `npm run db:generate -- --name=descriptive_change`. Read `docs/ethn-drizzle-migrations.md` before using them; migration execution needs separate target-specific authorization.
- Do not add tooling without asking. Leave generated `.next/`, `node_modules/`, `tsconfig.tsbuildinfo` and `next-env.d.ts` alone. Legacy `drizzle/` is archival; active ETHN migration SQL and generated metadata belong in `db/ethn-migrations/`.

## Active scope and boundaries

- Active `/api/ethn/` services use server-side SQL transactions, not legacy RPCs or ORM queries. Booking/payment logic lives in `src/lib/booking/` and `src/lib/admin/ethn-*.ts`; verify actual callers before editing similarly named legacy modules.
- Owner is the only active admin role (`db/ethn-migrations/0003_owner_only_admin.sql`). Use Owner for admin workflows; `ethn.staff_access` is a legacy table name, not a separate active role.
- Local implementation includes customer availability/checkout/proof/private tracking; owner payment review, unified bookings and direct internal creation; settings/pricing/hours/access/court setup; calendar blocks, audit, finance/XLSX, sales/corrections, outcomes, extensions, information-only Open Plays and persistent inbox. First-owner bootstrap uses `/setup`; read `README.md` before changing its Auth/SQL recovery and authorization rules.
- Unified Bookings adds configurable payment instructions/versioned public QR images, customer method snapshots, full-payment attestation, and restricted cancel/refund/archive actions. Refund records track external refunds, not money transfers. Eligibility restrictions remain; do not generalize these into unrestricted cancellation, rescheduling or payment-provider integration. Late-payment exception review is removed (`docs/ethn-exceptions-api.md`).
- Retired legacy methods return 410; consult `docs/ETHN-CUTOVER-API.md` before changing them. Preserve retirement rather than reconnecting legacy business RPCs.
- Mail is opt-in and at least once; see `docs/ethn-mail.md`. Persistent inbox is fallback for optional browser push; VAPID provisioning and real-device delivery remain unverified. ETHN cron endpoints require `CRON_SECRET`. `vercel.json` includes every-minute `/api/cron/ethn-operations` plus legacy cron entries; configuration is not evidence of deployed scheduling or ETHN outbox/inbox/push coverage.

## Database and security

- SQL-first Drizzle history in `db/ethn-migrations/` is the active migration path: fresh baseline through 0028 (including both 0026 files), court-details upgrade, then Unified Bookings upgrade. `db/ethn/0001_core.sql` through `0030_unified_bookings.sql` remain ordered reference/fresh-test fixtures. Never apply both chains to one database, rewrite applied migrations or use schema push. Default `drizzle.config.ts`, `src/db/schema.ts`, `drizzle/` and `supabase/` are legacy-only.
- Migration runner uses dedicated `ETHN_MIGRATION_DATABASE_URL` and separate history; it refuses untracked existing ETHN schemas rather than adopting/resetting them. Existing/hosted upgrades require reviewed history, backup/restore and cutover plans, including expiry/policy for held checkouts without payment-method snapshots. See `docs/ethn-drizzle-migrations.md`.
- Runtime uses separately provisioned restricted `ethn_checkout`, never postgres, migration owner, superuser or BYPASSRLS. Validate effective grants/RLS as well as server authorization. Remote DB requires verified TLS CA; non-TLS exception is disposable development/test loopback only.
- Browser Auth and private Storage must target the same ETHN project. Storage service credentials, private proof keys and tracking capabilities remain server-restricted; public venue payment QR images are distinct from private customer proofs. Never log or commit credentials, payment data or private proofs. Use `.env.example`; no legacy credential fallback.

## Verification and launch gates

- Run focused tests plus applicable type/build checks. Latest recorded Unified Bookings check reports type/build success and disposable-local integration success, but full suite had 1 failure in `test/no-instant-slicing.test.ts` and 26 skips. These are historical results, not current pass claims; rerun relevant checks after changes.
- Read dated checks for exact scope: later hosted-schema records exist, while the November 24 Unified Bookings migration has only disposable-local verification and no browser acceptance. Earlier hosted/browser records do not prove current deployment.
- Do not drive a browser without explicit permission for that specific request. Ask the user to verify UI or grant permission first. Never access production data, modify hosted services, reset databases or run migrations without separate authorization.
- Launch still requires owner-approved payment instructions/rates/policies, host/domain and commercial eligibility, pool limits/lifecycle, deployed authenticated scheduling, live mail/push validation where enabled, backups/restore and explicit deployment approval. Loopback origin repair is development-only; production proxy/canonical-origin/Host handling needs review. Rate limits are per-process, not distributed protection.

## Agent skills

### Issue tracker

Issues and specs live in local Markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` and `docs/adr/`. Before domain exploration or naming concepts, read `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
