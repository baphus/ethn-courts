# ETHN local cutover status

This checkout is not a production deployment. The current runtime targets the fresh ETHN schema, including feature migrations beyond the historically hosted `0010` installation. A database missing those columns/tables cannot run the new pages correctly. Do not interpret a successful build as permission to migrate an existing/hosted database.

## Current local scope

Customer availability, checkout, proof submission and private tracking; staff payment and late-exception review; owner pricing/hours/staff access; dashboard/search/detail; calendar/maintenance blocks; owner audit; verified collection/expense reports and XLSX; prepaid walk-in holds; completion/no-show; information-only Open Plays; paid sales and separately dated corrections; extension holds and staff verification; persistent recipient inbox; owner court creation and timing policy. Extension evidence supplement and integrated checks have separate dated records; consult `docs/checks/` for actual evidence rather than assuming all interactions were exercised.

No cancellation, refund, reschedule, unpaid-confirmation or legacy business RPC path is restored. Corrections are immutable record corrections, not cash-return processing. Auth identities and private Storage stay within the same configured ETHN project.

## External gates

- Explicit reviewed existing-database migration plan and authorization, restricted runtime grants/RLS and TLS verification.
- Real owner-approved rates, GCash recipient instructions, venue policies/contact details and staff identities.
- Commercially eligible host/domain, bounded production pooling and lifecycle validation.
- Opt-in mail sender configuration, verified live delivery, authenticated scheduler for outbox/inbox/completion endpoints.
- Independent DB/Auth/Storage backup and restore drill; retention policy.
- VAPID key provisioning and real-device permission/delivery validation. Planned `web-push` dependency and opt-in code are now included under the user's all-permissions instruction; delivery remains disabled without configuration. Persistent inbox is the fallback; no push SLA is implied.
- Explicit launch/deployment approval. Local tests are not production-readiness evidence.

No secret belongs in this file, test output or repository. Disposable database tests must never target existing customer data. Original `paddle-culture` project remains separate and read-only.
