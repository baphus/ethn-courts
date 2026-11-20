# ETHN outbox backstop — local evidence

2026-11-20. Approved endpoint/service scope completed; no real email, hosted services or scheduler provisioned.

## Implemented

`GET /api/cron/ethn-outbox` requires configured `CRON_SECRET` and existing authorization guard, even in development. Authorization precedes database/mail initialization. Missing opt-in/sender/origin/transport configuration fails closed. It selects at most five due booking IDs and invokes existing booking-scoped worker, at most ten rows per booking. No legacy RPC fallback; no external mail inside a SQL transaction.

Submission's opt-in post-response drain remains best effort. The backstop endpoint exists but is **not automatically scheduled**. Sender/domain/host and scheduler eligibility must be verified before launch. See `docs/ethn-mail.md`.

## Fresh verification

Directly executed temporary harness using actual migrations 0001–0006, PostgreSQL 18.2 and restricted `ethn_checkout` login. Mail transport was fake; Next HTTP checks did not send emails.

- Five-booking cap; remaining booking processed on next batch.
- Ten-row per-booking cap.
- Transient failure persists pending retry with incremented attempts and future availability; not selected before due.
- Stale sending claim recovered; concurrent backstops do not duplicate active claim.
- Actual committed submission stays pending with unverified claim and pending durable outbox when post-submit worker throws; no collection created.
- HTTP 401 for absent secret (including development), missing bearer and wrong bearer; authorized request with mail disabled returns 503 before database access.
- Temporary Next and PostgreSQL processes stopped successfully.

Command: `node --import ./test/register-loader.mjs <temporary-harness-path>`; exit 0. Evidence directory: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-backstop-final/run-1795115818946` (`result.json`, logs). Harness retained in parent `ethn-backstop-final` directory, not a second product schema.

Final commands after reconciliation, all exit 0:
- `npm test` — 295 passed, 0 failed.
- `npx --no-install tsc --noEmit`.
- `npm run build`.

Final logs/statuses: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-backstop-final`.

## Limits

No live SMTP, Supabase Storage, hosted TLS/pooling or external scheduler tested. Successful worker delivery over real SMTP is unproved. SMTP remains at least once; unknown send outcomes can duplicate mail despite claim fencing/stable Message-ID. Request count is bounded, not wall-clock duration. Shared cron auth uses ordinary equality; no constant-time guarantee claimed. Existing in-memory public limiter is per-process and trusts deployment-forwarded IP headers. Legacy business routes/UI remain outside ETHN cutover; do not deploy whole baseline as completed product.
