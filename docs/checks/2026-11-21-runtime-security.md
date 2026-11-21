# Local dependency and operational boundaries — 2026-11-21

- Added the planned `web-push@4.0.0` and `@types/web-push@3.6.4` under user's instruction accepting permissions and requesting completion. Installation used `--ignore-scripts`; no provider account, subscription or paid service was created. Package license reported MPL-2.0. Existing dependencies otherwise unchanged intentionally.
- `npm audit --omit=dev --json`: exit 0, no reported runtime vulnerabilities at time checked. This is advisory database evidence, not a full security audit.
- `npm audit --json`: exit 1, four moderate development-tool findings (`drizzle-kit`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `esbuild`), no high/critical findings. No blind `npm audit fix --force` or breaking tooling upgrade applied. Reassess separately before using legacy development servers/tools outside trusted loopback.
- Optional push remains disabled by default. No VAPID keys generated or committed, no real subscriptions created, no provider delivery performed. Subscription endpoints/keys and database/password material must not be logged.
- Added explicit configured-secret guard for ETHN inbox cron, same as operations/outbox/push; local mode does not bypass ETHN scheduler authorization.
- Expense HTTP mutations now enforce same-origin and streaming byte limits. New mutation routes use server authorization and safe generic failures; static regression guards supplement, not replace, full HTTP/browser checks.
- All hosted migrations, production config, real venue data, mail and scheduler provisioning, backup/restore and deployment remain outside local evidence.
