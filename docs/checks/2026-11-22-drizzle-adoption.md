# ETHN Drizzle adoption tooling — 2026-11-22

Existing ETHN database, court migration not applied: user-confirmed starting state. Separate SQL-first custom migrations generated using installed Drizzle Kit 0.31.x; generated SQL/metadata live in db/ethn-migrations, not legacy drizzle/. Config has no DB credentials and cannot directly push/migrate. Dedicated node runner uses installed Drizzle ORM migrator, verifies timestamp/hash prefix, locks concurrent runs and requires explicit reviewed fingerprint for baseline. Baseline marker blocks accidental schema replay. Human comparison against all SQL through 0028 (both 0026 files) is mandatory; preflight is deliberately not claimed as exhaustive schema verification.

Validation:
- Installed `drizzle-kit generate --custom --config=drizzle.ethn.config.ts --name=...` produced both migration entries, exit 0.
- `node --test --import ./test/register-loader.mjs test/ethn-migrations.test.ts`: exit 0, 2 pass. Checks marker guard, copied SQL equality, timestamps, isolated credentials, transaction-pooler refusal and TLS/local conditions.
- `npm run db:ethn:fingerprint`: exit 0; local only.
- `npx --no-install tsc --noEmit --incremental false`: exit 0.

No DB connection, baseline insertion or migration execution occurred. No new dependency installed. Disposable clone adoption/migrate/replay and effective grants/RLS remain required before live execution. See docs/ethn-drizzle-migrations.md.
