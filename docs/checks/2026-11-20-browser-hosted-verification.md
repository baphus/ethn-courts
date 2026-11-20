# Browser, hosted Auth/Storage and local SMTP verification

2026-11-20. Verification only; no application fixes, external SMTP delivery, deployment or real payment transfer.

## Passed with real hosted services

Disposable project `tgvdukmhnsnsqhokbwbn`:
- CA/hostname-verified client TLS 1.3 through session pooler. `pg_stat_ssl` reflects pooler/backend leg and was not used as client TLS proof; encrypted and authorized client socket checked.
- Actual migrations 0001–0008 committed; restricted ethn_checkout login read/privilege checks passed. Schema and role retained.
- Temporary owner and staff Auth users: password sign-in, getClaims/getUser matching identity, current staff_access role and disabled-access lookup passed. Users/staff rows removed.
- Private proofs bucket retained; known PNG signed upload, observed metadata, anonymous-read denial and 300-second signed read passed.
- Repeated signed upload and hostile x-upsert attempt denied; original downloaded object bytes unchanged. Test object removed. This establishes tested endpoint behavior, not all possible Storage threats.
- Real browser through local Next app + hosted Auth/DB/Storage: login, staff queue/detail/private proof link, full test-payment approval, rejection/released pending allocation, customer-visible rejection tracking passed. Temporary test owner, receipts, bookings/items/allocations/payments/audit/outbox/idempotency records cleaned; original merchant and rates restored. No money transfer or real emails.

Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-hosted-verification/auth-storage-result.json` and `.../ethn-hosted-browser/result.json`, `admin-a11y.json`, verification scripts. Private keys/passwords never written into repository or printed. Generated application-role credential remains in user-only protected file `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-private-credentials/checkout-role.json`; user must import it into password manager and arrange secure lifecycle. Do not commit or publish it.

## Passed locally, not hosted end-to-end

Browser used actual customer component with explicitly intercepted fixture API responses:
- Occupied interval disabled; two courts with distinct ranges selected.
- Exact estimate PHP 110.51 from PHP 101.01 half-hour + PHP 120 half-hour.
- Changed authoritative total shown; acknowledgement required.
- Same-tab reload restores checkout and requires acknowledgement again; no server reservation guarantee implied.
- Code/email lookup displays rejected state and customer-safe reason.
- Full axe audit on checkout state: 0 violations, 40 passes in tested state.

Fixtures did not prove actual customer upload/submission over browser. A subsequent hosted customer-browser attempt stalled at native date-control automation before checkout; no corresponding application failure established. Server API/service/Storage tests are separate evidence, not substitute for this missing end-to-end interaction.

Local Mailpit: SMTP `127.0.0.1:1025` verify/send passed; message observed via inbox API/UI `127.0.0.1:8025`. One dummy example.invalid message retained in local inbox. No hosted/external SMTP was tested because user requested local capture instead.

## Findings — not fixed by verification

1. Initial unavailable-state browser audit reported serious alert color contrast on `.border-destructive/30`. Must reproduce/fix state-specific contrast; zero-violation checkout audit does not clear it.
2. Admin page full axe audit reports four moderate rules: nested main landmark, duplicate main, non-unique landmark and sidebar content outside landmarks. Exact targets in `admin-a11y.json`.
3. First approval browser run using 127.0.0.1 returned 403 before transaction; localhost succeeded. Origin/request-URL mismatch on development server needs investigation before assuming arbitrary host/proxy deployment works. Do not remove same-origin guard.
4. Login still contains previous-client image/copy references. Functional hosted sign-in passed, but branding and missing asset review incomplete.

## Remaining gates

- Complete real customer browser flow: date, checkout, signed receipt upload, submission, reload/expiry and mobile/keyboard checks against hosted project.
- Fix/retest accessibility findings and development-origin mismatch.
- Test intended production host, transaction-pooler connection limits, scheduler and external SMTP only if separately approved. Current session-pooler test is not serverless production pooling proof.
- Confirm real rate/GCash recipient instructions and public/server Storage project alignment before accepting real bookings.

All verification-owned browsers and Next processes closed after final tests. Hosted fixtures removed; schema/restricted role/private bucket retained as approved. No live customer data copied.
