# ETHN staff web push

Browser alerts connect automatically when an authenticated Owner visits Notifications on a supported, configured browser that already grants permission. A new browser or one that requires a gesture needs a single **Allow browser alerts** or **Retry browser alerts** click. Browser blocks and device opt-out are respected. Persistent inbox works either way. Use HTTPS or a supported loopback development origin. On local errors, check site permission, then use the status message to distinguish worker startup, browser subscription lookup/creation, and server binding failures.

Set `ETHN_WEB_PUSH_ENABLED=1`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the server environment. Generate VAPID keys outside this app; never commit them. `VAPID_SUBJECT` must be an operator-controlled HTTPS URL or mailto contact. No schema change is needed beyond the existing ETHN web-push migration. Browser subscriptions remain scoped to the authenticated Owner and device endpoint.

Authenticated `GET /api/ethn/admin/push` returns `{configured,publicKey,subscriptionId}` without endpoint data. `POST` accepts exactly `{endpoint,keys:{p256dh,auth}}`; `DELETE` accepts `{subscriptionId}`. Endpoints are restricted to known push-provider hosts. An endpoint already owned by another account cannot be transferred. Signing out attempts to remove the current device subscription.

Authenticated `GET /api/cron/ethn-push` requires `ETHN_PUSH_CRON_SECRET`. If push is enabled, configure the minute-by-minute job below; hosted scheduling and delivery are not verified. The endpoint skips delivery when disabled. It sends only unread payment-proof alerts for bookings still pending, created within 24 hours and after subscription creation. Claims expire after two minutes, transient failures retry with backoff up to five attempts, and provider 404/410 disables the endpoint. Delivery is best-effort and at least once, not authoritative. The payload contains only notification ID and an allowlisted internal path; the worker uses fixed text without customer, amount or proof details.

## Supabase Cron setup

1. Generate a dedicated random secret of at least 32 characters. Set it as `ETHN_PUSH_CRON_SECRET` in Vercel and redeploy with push enabled. Do not reuse `CRON_SECRET` or a Supabase key.
2. In the approved ETHN Supabase project, enable Supabase Cron (`pg_cron`) and `pg_net`. In Vault create `ethn_push_origin` (deployed HTTPS origin, no trailing slash) and `ethn_push_cron_secret` (the same dedicated value as in Vercel).
3. Run [`scripts/ethn-push-cron.sql`](../scripts/ethn-push-cron.sql) in the Supabase SQL Editor as an operator who can read Vault and manage Cron. Confirm the `ethn-push` job is active every minute. Do not also schedule push elsewhere.
4. Check that the endpoint responds successfully in Vercel logs, then submit test proof in an approved test environment and confirm push on a subscribed Owner device with the site closed. A successful cron run alone only proves the HTTP request was queued; a `200` response can also mean push is disabled.

Vault encrypts the token at rest, but [database roles may read headers while pg_net queues the request](https://supabase.com/kb/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357). Use an external scheduler instead if those roles must not be able to trigger push. Do not print queued headers or copy the token into SQL.
