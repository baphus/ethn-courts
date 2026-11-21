# Extension evidence integration — 2026-11-21

Implemented staff extension proof reservation, upload signing, submission, approval, rejection and private proof read routes, with strict request schemas and existing origin/private response helpers. Staff booking extension view includes evidence upload and pending review; claims are not represented as collected payments. Pending review does not expire in the UI. Read projection preserves extension history and returns attached proof availability, claim fields and proof ID without object paths.

Validation: `npx --no-install tsc --noEmit` failed on generated `.next/types/validator.ts` route map mismatches and `test/ethn-integrated-workflows.test.ts` variables used before declaration. No owned source errors were reported in that run. Backend was still being finalized; typecheck is not evidence of service correctness. HTTP/static tests delegated to parent; backend writer owns database service tests.

Not checked: browser, hosted services, actual proof uploads, database migrations or live storage. Signed upload uses PUT with MIME and `x-upsert: false`; cross-origin storage configuration and actual storage behavior require authorized integration verification. Retry metadata exists only in component memory and is lost on reload; refresh booking and reconcile before collecting again. Private proof links expire after five minutes.
