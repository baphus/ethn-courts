# Push notification prerequisites (read-only inventory)

Checked 2026-11-21. No credentials, environment values, hosted services, browser, or database accessed.

## Local inventory

- `package.json` and `package-lock.json`: no `web-push` entry.
- Root `node_modules`: `npm ls web-push --depth=0` returns empty; `require.resolve('web-push')` returns `MODULE_NOT_FOUND`. No installed version or resolved package path exists.
- Existing push mentions are historical planning only. `docs/plans/2026-11-19-ethn-fork-plan.md` and `docs/plans/2026-11-19-ethn-fork-plan.md` describe `web-push` as a candidate addition requiring approval; they do not indicate it was installed. (The 2026-11-19 plan also describes version 4.0.0 as a registry snapshot, not an approved/current installation.)
- No active service worker, `PushManager`, VAPID, or Web Push subscription implementation found under source. Legacy notification code is not Web Push.
- Existing ETHN persistent inbox is reusable: `db/ethn/0022_notifications.sql`, `src/lib/admin/ethn-notifications.ts`, `src/app/api/ethn/admin/notifications/`, `src/components/admin/notification-bell.tsx`, and `test/ethn-notifications.test.ts`. `reconcileInbox` creates per-staff-recipient inbox rows; it is not push delivery. Keep it as fallback and avoid leaking booking/customer details in lock-screen payloads.

## Smallest safe implementation path (not implemented)

1. Keep the persistent inbox authoritative; add opt-in per-device subscriptions only after explicitly approving a Web Push dependency. Do not install packages without that approval. Browser permission/Push API/service worker are browser-native; delivery encryption/VAPID needs a vetted server library, not handwritten crypto.
2. Authenticate every subscribe, unsubscribe, and delivery operation against enabled ETHN staff identity. Bind each subscription to authenticated recipient; never accept recipient identity from request body. Protect endpoints from cross-site requests, validate bounded subscription input, and authorize every notification link. Revoke/delete only the current user's subscriptions; remove invalid/expired endpoints after delivery failure.
3. Store subscription endpoints and keys as sensitive bearer capabilities: restrict SQL grants/RLS, redact from logs/errors/backups exposed to operators, and keep VAPID private key server-only. Send generic, minimal payloads without names, payment details, or other booking PII; deep-link to an authenticated inbox.
4. Deliver after transaction commit, outside database transactions; use bounded retries/deduplication and stale-subscription cleanup. Do not claim delivery guarantees without a provisioned scheduler/worker. Existing mail scheduler is not provisioned and is not evidence push scheduling exists.
5. Require HTTPS in deployed browsers (localhost is the development exception), secure-origin service-worker scope, and user-initiated permission/subscription. Unsupported browsers, denied permission, or absent VAPID config must leave inbox operational.

## External launch blockers

- User approval to add a push library after release/license/security/Node support review. No package install or lockfile change performed.
- Operator-generated and securely provisioned VAPID public/private keys, production canonical HTTPS origin and service-worker hosting; private key must be a deployment secret, never committed or returned in chat.
- Explicit decision on which ETHN events, staff recipients, retention, and opt-in UX should generate pushes; current inbox's derived/reconciled events are not yet a push delivery contract.
- Approved schema migration and production authorization/grant/RLS review before storing subscription capabilities. No migration or hosted operation performed.
- A provisioned, authenticated delivery worker/scheduler and operational ownership for retries, dead letters, and key rotation. No scheduler currently provisioned per project instructions.
