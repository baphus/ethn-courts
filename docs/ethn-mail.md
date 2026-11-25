# ETHN customer booking mail

ETHN sends plain-text updates for payment proof received, booking confirmed, booking not confirmed, cancellation and recorded refund. Emails include the original court schedule in Manila time, venue address and contact link; confirmations include directions. Online updates use the existing private tracking link or code-and-email lookup. Staff can provide an optional guest email on new internal bookings; those updates link to venue contact instead of private tracking. No email is sent to staff-booked guests without an address, and archiving never sends an update.

Cancellation does not record a refund. A refund notice reports staff's record of an external refund, not an in-app transfer. Cancellation/refund staff notes, payment references and payment proofs are not included. No historical notifications are backfilled.

Apply `db/ethn/0006_outbox_access.sql` after migrations 0001–0005. Mail is disabled by default. To opt in, set `ETHN_MAIL_ENABLED=1`, `ETHN_MAIL_FROM` to the ETHN sender email, and `ETHN_APP_URL` to the HTTPS ETHN origin. Configure the existing server-only SMTP or Gmail transport separately; do not use legacy branding settings as ETHN sender or origin.

For `npm run dev` with Mailpit, use `ETHN_MAIL_FROM=bookings@example.test`, `ETHN_APP_URL=http://localhost:3000` (match your dev port), `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, and `SMTP_SECURE=false`. Leave SMTP credentials blank and restart Next.js after editing `.env.local`. HTTP origins are allowed only for loopback in development.

Submission, payment review, internal creation, cancellation and refund schedule a booking-scoped best-effort drain after the response. `after()` is not a delivery guarantee. An authenticated backstop is available but not scheduled automatically. Configure `CRON_SECRET` and an external scheduler that sends `Authorization: Bearer <CRON_SECRET>` to `GET /api/cron/ethn-outbox`; never put the secret in the URL or logs. For manual use: `curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/ethn-outbox"`. Confirm scheduler eligibility and pricing for the chosen free host before relying on it.

Each request selects at most five due bookings and claims at most ten rows per booking. This bounds work, not wall-clock time: mail transport may block. Concurrent calls use the worker's locked claims, but delivery is at least once, not exactly once. Future retries wait until due; abandoned claims are eligible after 15 minutes.
