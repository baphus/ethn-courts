# AGENTS.md — ETHN courts

Single-package Next.js 16 app, npm with `package-lock.json`. Current scope is ETHN booking/payment cutover, not a production-ready deployment. Read `README.md`, `docs/ETHN-CUTOVER-API.md` and relevant recent `docs/checks/` before changing behavior; historical fork documents and `db/ethn/README.md` may describe obsolete disconnected drafts.

## Commands

- `npm run dev`, `npm run build`, `npm start`.
- `npm test`: Node test runner with `test/register-loader.mjs`; Node 22.6+ required. Conditional database tests need separately configured disposable databases.
- `npx --no-install tsc --noEmit`.
- Do not add tooling without asking. Do not edit generated `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, or `drizzle/` artifacts.

## Architecture and boundaries

- Active ETHN booking/payment services use server-side SQL transactions, not legacy RPCs. `db/ethn/0001_core.sql` through `0008_payment_decision.sql` form the ordered fresh-ETHN schema chain. `supabase/` and `drizzle/` are legacy reference/archive, not setup instructions. Never run either chain against existing data without an approved migration plan.
- Runtime uses a separately provisioned restricted `ethn_checkout` login, never postgres, migration owner, superuser or BYPASSRLS. Validate effective grants and RLS. Shared database role does not replace server authorization. Remote DB requires verified TLS CA; local exception is development/test loopback only.
- Browser Auth and private Storage must target the same ETHN project. Storage service credentials and private object keys remain server-restricted. Never log or commit credentials, payment data, private proofs or tracking capabilities. `.env.example` documents active and legacy-only variables; no legacy credential fallback.
- Retired endpoints return 410; consult `docs/ETHN-CUTOVER-API.md` before touching legacy routes. Other legacy reads and UI are not evidence of completed ETHN workflows. Extensions, Open Plays, sales, push, owner/settings/staff management and walk-in operations remain outside completed scope.
- Mail is opt-in. ETHN outbox cron requires `CRON_SECRET`; no scheduler is provisioned. Delivery is at least once. See `docs/ethn-mail.md` and `docs/checks/2026-11-20-outbox-backstop.md`.
- Loopback origin repair is development-specific. Production proxy, canonical origin and Host validation still require review and testing. Rate limits are per-process; do not claim distributed protection.
- Real rates and GCash instructions, production host and eligibility, pool limits/lifecycle, scheduler and live mail delivery remain launch gates. Never claim production readiness from local tests.

## Verification

Run focused tests for changes plus applicable type/build checks. Latest recorded hosted/browser and regression evidence is `docs/checks/2026-11-20-browser-verification-repair.md`; results are historical, not proof of current deployment. Do not drive a browser without explicit permission for that specific request. Ask the user to verify UI or grant permission first. Never access production data, modify hosted services, or run migrations without separate authorization.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
