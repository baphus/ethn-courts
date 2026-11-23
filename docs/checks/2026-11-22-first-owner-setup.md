# First-owner setup — 2026-11-22

## Scope

`/setup` checks uncached `/api/ethn/setup` availability and collects email, password (12–128 characters), and server-only `ETHN_SETUP_KEY`. `/login` redirects to setup only when configured and empty. POST validates same-origin, bounded JSON, timing-safe key digest, and exact fields. Existing per-process proxy limiter applies 5 GET/POST requests per minute per reported IP; this is not distributed protection.

The setup transaction locks staff rows then singleton settings, rechecks absence of all staff rows and `owner.bootstrap` audit marker, provisions Supabase account, inserts owner access and marker, and commits. Disabled staff/owners close bootstrap too. Audit marker prevents reopening after staff rows are removed under ordinary operations; deleting audit history is outside this guarantee. No elevated database connection, migration, dependency or legacy credential fallback added. Legacy invite endpoint no longer supports unauthenticated bootstrap.

Auth uses same configured ETHN project as browser and Storage. Operator key authorizes email-confirmed account creation, not proof of inbox ownership. Existing accounts require correct email/password/key. Auth and SQL have no shared transaction: failed SQL may leave Auth-only account. Retry same credentials while setup remains open; after uncertain successful commit, sign in. No automatic account deletion. Remove setup key after completion.

## Evidence and limits

- `node --import ./test/register-loader.mjs --test test/ethn-setup.test.ts`: exit 0; 4 pass. Tests cover key/input rejection before SQL/Auth, two simulated concurrent claims with one winner, closed state and rollback/error redaction. SQL mocked; not proof of actual PostgreSQL locking, restricted-role grants, or RLS.
- `npx --no-install tsc --noEmit --incremental false`: exit 0.
- `npm run build`: exit 0. Log: `C:\Users\JKsars\AppData\Local\Temp\opencode\ethn-setup-build.log`.
- No browser access authorized/run. No hosted Auth account, database, environment or migration changed. Real Supabase behavior, mail/recovery, disposable-database concurrency and visual acceptance remain unverified. Full regression suite not run; working tree contains unrelated existing changes.
