# ETHN goal gap review — 2026-11-21

Scope: reconciliation of current plan §§4.3–4.5 / modules 18–26 against repository artifacts and dated local check notes. This is not a full code audit or runtime acceptance. No browser, database, hosted services, credentials, packages, or agents accessed; no application code changed.

## Still missing: code work remains

1. **Web Push (module 22): absent.** Persistent inbox exists, but no `web-push`, service worker, Push API/VAPID, subscriptions or delivery implementation. The package candidate explicitly requires user approval; do not assume blanket goal permission supersedes the project's install-approval gate. Obtain approval, then implement push while preserving inbox fallback. Push events/recipients, keys and worker contract also need operator decisions/configuration. See `docs/checks/2026-11-21-push-prerequisites.md`.
2. **Extension proof-pending behavior: unresolved plan acceptance.** Plan §4.3 requires timely submitted extension proof to retain only added allocation pending staff decision, but says exact state/expiry transition must be settled before coding. The presence of extension service/UI is not enough to establish this case. Decide contract, then implement/test if absent. Also inspect correction paths for this retained requirement; do not infer completion from migration or screen presence.
3. **Cross-module finance reconciliation: not evidenced complete.** Finance UI check explicitly says exports cover applied-date booking daily aggregates and exclude sales/extensions. Sales UI check says finance integration is outside its scope; sale correction history displays original/deltas but not effective total. Reconcile verified booking + extension receipts + valid paid sales, expense totals, dated corrections, and XLSX exports per plan §4.4. Add focused test for corrected totals and date attribution.
4. **Walk-in lifecycle: partial.** Temporary hold-before-payment now has local restricted-DB coverage, but check says browser/hosted acceptance, persistent retry reconciliation, and overnight UI selection remain deferred. Plan §36/§43 also leaves acceptance unresolved. Finish only the local code gaps (retry recovery/overnight date path) and tests; UI/host acceptance is separate.
5. **Court/venue lifecycle and schedule interaction: needs integrated evidence.** Venue creation and timing-policy modules now exist; verify full edit/deactivate/conflict behavior across active allocations, Open Plays, extensions, holds, and existing hours. Do not count schema/API presence as end-to-end completion. Add/fix code only where contract/test exposes a gap.
6. **Landing/content and visual checks:** prototype-inspired identity/root/public content work is present, but no visual parity or mobile acceptance claim established here. Plan calls local desktop/mobile rendering a deferred check. This is not a reason to invent scope or claim production readiness.

## Implemented locally, not launch-proven

- Outcomes/no-show, Open Plays, sales/corrections, extensions, inbox, venue management, timing policy, and walk-in holds have artifacts in the current tree/check notes. Treat them as locally implemented slices only, not accepted production modules. Current push-prerequisite check confirms inbox specifically is not push.
- Existing staff access uses Auth-user identity; it does not provide invite/onboarding workflows. Plan §20 records this model and staff identity as a launch gate, not a reason to revive retired legacy user endpoints.
- Fresh-schema chain now extends beyond hosted evidence: 0010 was historically applied to disposable hosted project; current modules add migrations through 0026. Runtime against a DB lacking these migrations will fail. Applying any migration to existing/hosted data needs separately approved migration plan; no migration is authorized by this review.

## External/operator gates (not locally codeable)

- Explicit approval for vetted `web-push` dependency; owner/operator selection of push event/recipient policy; secure VAPID key provisioning, canonical HTTPS origin, service-worker hosting, scheduler/worker, migration/grants/RLS review, key rotation and operational ownership.
- Provision approved database schema/runtime credentials and verify least-privileged `ethn_checkout`, RLS/grants, TLS, pool/lifecycle on chosen host. Do not use production credentials or run migrations without separate authorization.
- Owner-approved actual rates, GCash instructions, contacts/policies, permanent staff identities; production host/domain and commercial eligibility; pool limits/lifecycle; scheduled outbox worker and verified mail sender; independent DB/Auth/Storage backup plus restore drill; retention policy; explicit deployment approval.
- No browser use without request-specific permission. No production readiness claim from local tests.

## Priority next actions

1. Obtain push dependency approval and extension proof-state decision; these are genuine remaining requirements, not styling polish.
2. Reconcile sales/extensions/expense corrections in finance reports/exports and write focused DB-backed tests.
3. Close walk-in retry/overnight gaps and integrated venue/timing conflict tests.
4. Run authorized local regression/type/build and requested browser checks after parent integration; keep hosted DB/migration and launch gates distinct.

Skipped full source-by-source audit and runtime/browser/DB verification by scope. Risks: parent integration may have changed files after these check notes; verify current tree before treating any item as open or complete.