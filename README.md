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

Mail is opt-in (`ETHN_MAIL_ENABLED`); configure sender, origin and transport deliberately. `GET /api/cron/ethn-outbox` requires `CRON_SECRET`; a Vercel schedule is configured but deployment and delivery must be verified. See `docs/ethn-mail.md`.

## First owner setup

No Supabase dashboard account creation is needed. Configure existing ETHN Auth/Storage variables for the same project, restricted `ETHN_DATABASE_URL`, and a random server-only `ETHN_SETUP_KEY` of at least 32 characters (for example, generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). Restart after setting environment variables. Visit `/login`; a fresh instance redirects to `/setup`. Enter setup key, owner email and a 12–128 character password. Keep key out of source control, URLs, client environment variables and logs. Remove `ETHN_SETUP_KEY` after successful setup.

Setup is allowed only when **no ETHN staff rows exist** and no `owner.bootstrap` audit marker exists; disabled staff/owners do not reopen setup. Missing configuration or database errors never open setup. Existing accounts can be claimed only with their correct password and setup key. New accounts are email-confirmed by this operator-authorized flow; setup does not verify inbox ownership. Staff membership and bootstrap audit commit together, serialized by existing settings lock. No schema migration is added; existing staff-management/audit grants and RLS are required.

Supabase Auth and SQL cannot commit atomically. If Auth succeeds but SQL fails, account may exist without staff access; retry using the same email/password/key. Never automatically delete accounts after uncertain commits. If response is lost after SQL commits, sign in instead. Legacy invite registration is retired. Use the ETHN staff workflow to manage access.

## Database and scope

For a fresh ETHN database, use the active SQL-first chain in `db/ethn-migrations/`, with separate migration credentials. `db/ethn/00*.sql` is reference and test SQL; do not apply both chains. See `docs/LOCAL-CUTOVER-STATUS.md` and dated `docs/checks/` for scope and actual verification; historical hosted evidence stops before these new modules. Provision and verify a restricted `ethn_checkout` login separately; SQL grants do not replace server-side authorization. Never apply this chain to a legacy database without a separately reviewed migration plan. `db/ethn/README.md` contains historical offline-draft notes; current verification and cutover documents supersede its claims that services are disconnected.

Active ETHN services use server-side SQL transactions, not the old RPC implementation. See `docs/ETHN-CUTOVER-API.md` for availability and retired endpoints returning 410; other legacy reads are not proof of supported workflows. Owner settings/staff, held walk-ins, calendar blocks, audit, finance/XLSX, sales/corrections, Open Plays, outcomes and extension services now have local implementation slices; use their dated checks for coverage and gaps. Persistent inbox exists; browser push is not configured. None of these statements establish hosted deployment or full browser acceptance. `supabase/` and `drizzle/` are legacy reference/archive, not ETHN setup instructions. `docs/DECISIONS.md` and other fork-era documents are historical references, not current requirements.

## Drizzle-managed ETHN upgrades

Fresh ETHN databases use separate SQL-first Drizzle history: full schema through 0028, then court-photo upgrade. Follow [docs/ethn-drizzle-migrations.md](docs/ethn-drizzle-migrations.md) for role prerequisites, dedicated migration credentials and `db:*` commands. Tooling never wipes or adopts existing ETHN schemas. Database resets and hosted migrations require separate approval. Default `drizzle.config.ts` and `drizzle/` remain legacy-only.

## Contact settings upgrade

Contact details require `db/ethn/0026_contact_settings.sql` after the preceding ETHN schema upgrades. Review and apply it only under an approved migration plan; do not run it against legacy data. Verify restricted checkout grants and RLS after upgrade. The contact page uses the default venue Facebook URL, phone and email when owner overrides are blank or settings are unavailable. Owner settings publish Facebook, phone and email; the contact form opens the visitor's email app and does not send or store messages on the server.

## Removed features

Booking refunds and extension management are retired. Before deploying that change, follow the [extension reconciliation checklist](docs/ethn-extension-refund-retirement.md).

The old late-payment queue and decision APIs are retired. Owners can open late proof from their private inbox or search by checkout ID and reconcile outside the app. Court time is not restored. See `docs/ethn-exceptions-api.md`.

## Verification and launch gates

- Use a commercial hosting plan that supports the checked-in sub-daily jobs (not Vercel Hobby), or configure equivalent authenticated jobs on another eligible host. Verify the deployed runtime can read the trusted database CA file.
- Before an existing-site upgrade, verify a restorable backup, review the Owner roster, reconcile held checkouts without payment snapshots, and complete the extension retirement checklist. Do not deploy if any extension is held or pending.
- Approve real payment instructions before taking money. Keep the same payment method ID when changing instructions for the same receiving account. New online approvals and non-cash internal bookings require the verified transfer ID and migration `0010`; reconcile historical approvals without references outside the app.
- From the exact release commit, run the build, suite, and restricted-role database checks against a disposable target. In staging, verify checkout, proof, approval, tracking, late-payment reconciliation, and finance. Verify authenticated scheduled delivery for any enabled mail or push.

`docs/checks/2026-11-20-browser-verification-repair.md` records previous hosted verification and regression results; it is not deployment approval. Real GCash recipient instructions and rates, production hosting and commercial eligibility, database pool lifecycle/limits, scheduler, and live mail delivery remain unresolved. Origin repair covers a narrow loopback development case, not production proxy or Host validation. Review those boundaries before deployment. Browser verification requires explicit permission for each request; users may verify UI themselves.
