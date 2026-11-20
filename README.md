# ETHN courts

ETHN booking and payment cutover in a Next.js application. This is **not production-ready**. Legacy code and historical documents remain in the repository; their presence does not mean their workflows are supported.

## Development

Node.js 22.6 or later and npm are required. Copy `.env.example` to `.env.local` and configure only the ETHN project; never copy credentials from another client. Restart the development server after changing environment values.

```sh
npm ci --ignore-scripts
npm run dev
npm test
npx --no-install tsc --noEmit
npm run build
```

Availability needs `ETHN_DATABASE_URL` for a restricted `ethn_checkout` login, not a postgres, owner, or migration credential. Remote database connections require verified TLS using `ETHN_DATABASE_CA_FILE`; the explicit local exception is for development/test loopback only. Browser Auth and private Storage must use the same ETHN Supabase project. Keep `ETHN_STORAGE_SERVICE_ROLE_KEY` server-only. See `.env.example` for configuration; legacy variable names there are not active ETHN fallbacks.

Mail is opt-in (`ETHN_MAIL_ENABLED`); configure sender, origin and transport deliberately. `GET /api/cron/ethn-outbox` requires `CRON_SECRET`, but no scheduler is provisioned. See `docs/ethn-mail.md`.

## Database and scope

For a fresh ETHN database, review and apply `db/ethn/0001_core.sql` through `0008_payment_decision.sql` in numeric order using separate migration credentials. Provision and verify a restricted `ethn_checkout` login separately; SQL grants do not replace server-side authorization. Never apply this chain to a legacy database without a separately reviewed migration plan. `db/ethn/README.md` contains historical offline-draft notes; current verification and cutover documents supersede its claims that services are disconnected.

Active ETHN services use server-side SQL transactions, not the old RPC implementation. See `docs/ETHN-CUTOVER-API.md` for availability and retired endpoints returning 410; other legacy reads are not proof of supported workflows. Extensions, Open Plays, sales, push, owner/settings/staff management and walk-in operations are not complete ETHN modules. `supabase/` and `drizzle/` are legacy reference/archive, not ETHN setup instructions. `docs/DECISIONS.md` and other fork-era documents are historical references, not current requirements.

## Verification and launch gates

`docs/checks/2026-11-20-browser-verification-repair.md` records previous hosted verification and regression results; it is not deployment approval. Real GCash recipient instructions and rates, production hosting and commercial eligibility, database pool lifecycle/limits, scheduler, and live mail delivery remain unresolved. Origin repair covers a narrow loopback development case, not production proxy or Host validation. Review those boundaries before deployment. Browser verification requires explicit permission for each request; users may verify UI themselves.
