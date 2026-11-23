# Fresh ETHN Drizzle verification — 2026-11-22

Supersedes baseline-adoption setup in 2026-11-22-drizzle-adoption.md. User changed target to fresh database. No earlier adoption executed; initial migration replaced with full ordered SQL through 0028 (both 0026 files), then court details migration. No wipe implemented or performed.

Evidence:
- `node --test --import ./test/register-loader.mjs test/ethn-migrations.test.ts test/ethn-migrations-fresh.test.ts`: exit 0, 3 pass. Exact SQL-chain equality/order, court SQL equality, TLS isolation and fresh target/role guards.
- `npx --no-install tsc --noEmit --incremental false`: exit 0.
- New isolated PostgreSQL cluster initialized under %TEMP%/opencode, bound only to 127.0.0.1:55439. Local trust auth, no customer data or hosted access. Provisioned anon/authenticated NOLOGIN placeholders and restricted ethn_checkout LOGIN only in disposable cluster.
- `npm run db:ethn:migrate`: exit 0, Applied 2 ETHN migrations.
- `npm run db:ethn:status`: exit 0, applied=2, pending=0, freshSetupRequired=false.
- Repeat `npm run db:ethn:migrate`: exit 0, Applied 0 ETHN migrations.
- SQL inspection: 24 ethn tables, effective photo UPDATE grant true. Transaction under SET LOCAL ROLE ethn_checkout inserted inactive court and updated description/photo; trigger advanced details_version 0 to 1. Transaction rolled back. All commands exit 0.
- Disposable cluster stopped successfully; files retained in temporary folder. No hosted connection, wipe, Auth/Storage provisioning or browser testing.

Plain PostgreSQL schema migration works with role prerequisites. Supabase-specific project setup and production readiness remain separate gates.
