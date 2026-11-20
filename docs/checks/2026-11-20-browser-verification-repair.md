# Verification findings repaired and retested

2026-11-20. Supersedes open findings 1–4 and incomplete customer-browser coverage in `2026-11-20-browser-hosted-verification.md` for the states tested below. Not deployment approval.

## Repairs

- Shared origin guard for four guest checkout mutations and staff decision route. Reproduction showed Next 16.4.5 development server rebuilt request.url with localhost while browser Origin/Host were 127.0.0.1. Narrow HTTP-localhost/loopback-Host correction accepts matching loopback origin; ignores forwarded host/proto, keeps cross-origin rejection, and leaves HTTPS/production origin behavior unchanged. Missing-Origin policy unchanged. Focused tests and actual HTTP reached auth/config guard for valid origins, 403 for hostile forwarded-origin request.
- Public unavailable alert contrast corrected. Full axe: 0 violations/37 passes in tested public states across desktop, 360px, light/dark.
- Nested/duplicate main and sidebar landmark defects corrected. Authenticated admin axe rerun: 0 violations/36 passes.
- Login uses ETHN text identity/staff copy, removed previous-client images; link contrast corrected. Full axe: 0 violations/36 passes across tested desktop/mobile light and mobile dark. Keyboard focus and labels checked. Screenshots not manually visually reviewed; audit results do not prove all visual/accessibility states.

## Real browser + hosted services

Private-command verification used local Next server accessed through **127.0.0.1** plus real disposable Supabase Auth, database and private Storage:
1. Actual customer selects available interval and creates authoritative checkout.
2. Customer fills guest/reference data, signs and uploads known tiny PNG through real browser SDK/private Storage, submits successfully to pending state. No actual money transfer.
3. Temporary owner signs in through real hosted Auth and current `ethn.staff_access`.
4. Staff opens attached private receipt link and approves full TEST ONLY payment; database booking/allocation confirmed.
5. Separate test booking rejected; pending allocation released and customer-safe reason recorded.
6. Real tracking page displays rejected state and reason.
7. Authenticated admin full axe: 0 violations.

Final run exit 0, no failure. Browser and owned Next process closed. Temporary users/staff rows/receipt objects/bookings/items/allocations/payment/audit/outbox/idempotency fixtures removed; original merchant/rates restored. Schema, restricted role and private bucket retained as approved. One earlier held browser fixture escaped initial harness cleanup; exact ID/state/test-marker guard verified it had no guest/proof/payment and removed it transactionally. Harness now discovers this-run marked checkouts before cleanup, including failures before checkout-ID registration.

Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-hosted-browser/result.json` and `admin-a11y.json`; harness `.../ethn-hosted-verification/browser-approval.mjs`. Private-command output confirms all stages and cleanup; it does not print tokens/passwords. Remembered private inputs forgotten after run.

## Final regression checks

All exit 0:
- `npm test`: 304 total, 302 passed, 0 failed, 2 conditional database tests skipped in default run. Prior explicit real-database acceptance executed these two separately.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- `npm audit --omit=dev --json`: zero reported production vulnerabilities.

Logs: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-verification-repair-final`.

Original paddle-culture repository remains clean. No remote, commit or deployment created.

## Remaining launch boundaries

- SMTP verified only against local Mailpit 127.0.0.1:1025, inbox at :8025; no external SMTP deliverability test requested/performed.
- Hosted connection tested session pooler, not production serverless transaction-pool lifecycle/load. Production host/domain/commercial eligibility, pool limits and scheduler remain unresolved.
- Real venue rates and GCash recipient instructions remain configuration/owner approval gates; temporary test amounts/account labels restored after verification.
- Full customer expired-hold/reload/banking-app-return flow against hosted service and all responsive states not exhaustively exercised. Existing local/database expiry/replay tests and prior browser fixture reload checks are separate evidence.
- Four previously identified moderate development-only Drizzle/esbuild dependency findings remain; no forced downgrade/override applied.
- Protected generated restricted-role credential remains outside repository under user-only ACL; import into password manager and arrange secure retention/removal. Never publish it.
- Broader SRS modules not part of this verified core—extensions, Open Plays, sales, push, owner/settings/staff management and walk-in operations—remain separate work.
