# Local ETHN operations and launch boundaries

## Fresh schema

Use the complete numbered chain in `db/ethn/`, not `supabase/` or `drizzle/`. Separate migration owner and restricted `ethn_checkout` login are required. A fresh disposable integration test is not an existing-data migration plan. Do not run these files against hosted/customer data without separate review and authorization.

`node test/run-ethn-local-db.mjs` is an isolated local regression runner. It needs `ETHN_TEST_PG_BIN` pointing at PostgreSQL binaries and optionally `ETHN_TEST_TEMP`. It creates random loopback credentials, never loads `.env.local`, initializes a fresh database for each suite, and stops/removes its own disposable data. Logs remain in its temporary evidence directory. It does not test live Auth, private Storage, SMTP or real push providers.

## Scheduled endpoints

All ETHN workers require an explicitly configured `CRON_SECRET`, including local use:

- `/api/cron/ethn-outbox`: opt-in bounded email retry.
- `/api/cron/keepalive`: restricted ETHN database connectivity check, Sundays at 02:10 UTC.
- Booking operations, legacy retention, and legacy proof pruning are unscheduled and return `410 RETIRED`. Owners complete bookings individually or reconcile ended pending payments in payment review. Inline extension hold cleanup is retired. Any existing target must pass [extension reconciliation](ethn-extension-refund-retirement.md) before rollout.
- New-booking inbox alerts are recorded with the booking; no inbox cron is needed.
- `/api/cron/ethn-push`: optional push delivery/retry after VAPID configuration.

Endpoint implementation does not provision a scheduler or prove latency/availability. Use bearer secret privately; never put it in query strings, source, screenshots or logs. Repeated delivery can occur after uncertain external-send outcomes. Inbox stays available if email or push fails.

## Browser push

`ETHN_WEB_PUSH_ENABLED=0` is default. Enabling requires operator-provisioned matching VAPID public/private keys and valid `VAPID_SUBJECT`. Private key remains server-only. HTTPS or trusted loopback is required by browsers; permission is requested only after staff explicitly choose Enable. Denied/unsupported permission must not disable inbox. No real-device delivery claim is made by mocked-sender DB tests. Keys, subscriptions and endpoints are private; do not log them.

## Money and corrections

Booking/extension payment proof is a claim until accepted. Reports aggregate actual receipt dates in Manila, not booking/verification dates. Manual non-booking sales are separate collections. Immutable sales/expense corrections apply on their correction date and retain the original; they record data corrections, not actual cash refunds or cash movement. Do not use corrections to process returns. Formal accounting/revenue recognition remains outside this report.

## Outstanding operator actions

Real court rates/GCash recipient/contact policies; permanent owner/staff Auth identities; reviewed hosted migration chain and effective grants/RLS/TLS; commercially eligible production host/domain/pooling; verified SMTP and scheduler; private DB/Auth/Storage backup plus restore drill and retention; VAPID keys and real-device test; explicit deployment/launch approval. Local build/test success does not waive these gates.
