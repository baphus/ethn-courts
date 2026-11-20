# Booking and payment-review cutover — local evidence

2026-11-20. Implemented against ETHN no-RPC endpoints; no deployment or hosted Auth/Storage verification.

## Changes

- Homepage and `/book` use timetable-first ETHN booking component, range selection, exact price estimate, authoritative checkout, frozen-price acknowledgement, owner-bound receipt upload, pending/late-evidence submission and code/email tracking. Versioned same-tab draft preserves hold/proof/retry identifiers; server remains authority. No expired-hold reclaim.
- `/admin/payments` uses current ETHN staff guard, queue/detail, expiring private proof link, full-payment approve/reject with actual Manila received time, explicit confirmation and stable per-payload retry key. Unsupported legacy admin pages redirect rather than query old data.
- Login verifies current enabled `ethn.staff_access` after password sign-in rather than old admin metadata; denied/error sessions sign out.
- Public availability uses unified ETHN allocation ranges; nullable rate/merchant yields `configured=false`, not invented price. Old business mutations and old proof read return uncached 410. See `docs/ETHN-CUTOVER-API.md` for exact paths.
- Approval/rejection transactions preserve reference uniqueness, full-payment requirement, staff verification and atomic audit/outbox. Rejection reason is customer-safe and shown only for rejected tracking/payment. Mail worker supports all outcome kinds; no real email sent.
- New availability implementation isolated as `ethn-availability.ts`; old helper restored to audited source hash for retained offline tests/consumers. No legacy writer reactivation. Inherited client metadata/domain/icon removed from root metadata.

## Fresh evidence

1. Actual PostgreSQL 18.2 migrations 0001–0008 applied to independent fresh databases; restricted `ethn_checkout` login.
2. Both conditional integration tests executed explicitly (not skipped): staff reads and payment decisions. Checks include disabled/revoked staff, exact amount/reference, accepted-reference conflict, competing decisions, rejection release, expired-exception refusal and outbox-failure rollback.
3. Actual database outcome intents drained with fake mail; approved/rejected messages and new tracking links verified, rejected-only reason projection checked, decided records absent from pending queue.
4. Next HTTP decision-route checks: malformed JSON 400, cross-origin 403, missing Auth configuration 503; no positive hosted authentication claimed. Temporary Next/PostgreSQL stopped.
5. Availability restricted-role/HTTP checks verified overnight windows, missing rates, expired/live holds, pending occupancy, private projection, malformed date 400 and retired methods 410 without Supabase environment.
6. Reconciled HTTP smoke: `/`, `/book`, `/contact` return 200 with ETHN identity; unauthenticated `/admin/payments` redirects 307 to login; missing database configuration makes availability fail closed 503. Temporary server stopped.

Evidence directories:
- `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-payment-acceptance/run-1795143941128` — full harness, integration logs, result.
- `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-ui-cutover-backend` — availability/retirement result.
- `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-ui-reconcile` — final checks and HTTP smoke.

Final reconciled commands, all exit 0:
- `npm test`: 303 total, 301 passed, 0 failed, 2 conditional integration cases skipped in default run. Those two ran separately above.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- `npm audit --omit=dev --json`: zero reported production findings at verification time. Four earlier development-only Drizzle/esbuild findings remain outside this remediation; no complete security audit claim.

## Launch limits

No browser interaction/visual/accessibility acceptance. No real Supabase Auth, private Storage upload/overwrite verification, SMTP delivery or deployed pool/TLS tested. Public Supabase URL/anon settings must identify same ETHN project as server Storage configuration; merchant text must contain venue-approved GCash recipient instructions. No source-client QR/account may be reused. Browser-storage recovery is same-tab/best effort; storage access/file reattachment failures require manual UX verification. Exact retry keys do not make arbitrary user-edited payloads identical.

Legacy read-only endpoints/pages outside active cutover may still contain old client copy/data assumptions; do not connect legacy environment. No hosted scheduler provisioned, and commercial-eligible free hosting unresolved. Extensions, Open Plays, sales, browser push, walk-in management and broader settings/owner management are later work—not implemented by this batch. No cancellations, refunds or rescheduling were added.
