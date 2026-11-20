# Development availability 503 — diagnosed and corrected

Request reported `/api/ethn/availability` 503 while `npm run dev` served homepage. Actual response was `{"error":"NOT_CONFIGURED"}`. Repository contained only blank `.env.example`; required active ETHN database environment was absent.

Created user-only ACL-protected, Git-ignored `.env.local` after approval. Used existing restricted ETHN role credential from protected external file, verified CA path and same-project public Auth/server Storage configuration supplied through private entry. No owner database credential placed in runtime environment. Keys/URL values never printed or committed. Updated `.env.example` to list actual active ETHN variables rather than only legacy names.

Verified by starting isolated Next development process that loads `.env.local` and requesting real hosted availability: **HTTP 200**, two courts, `configured=false`, `Payment or pricing is not configured.` Server stopped afterward. This is expected safe state while actual venue rate/GCash recipient instructions are pending. These missing business values disable paid checkout but do not cause missing-database 503.

Restart existing `npm run dev` after changing configuration. Browser/public environment values are picked up by new Next process. File excluded by `git check-ignore --no-index .env.local`; no remote configured and source project unchanged.

Production request remains blocked, not completed: user keeps free-only constraint. Research identified Netlify/OpenNext Cloudflare candidates, but no host selected/deployed, commercial eligibility/runtime/pooling/SMTP/quotas not fully verified. Render Free explicitly unsuitable for production and blocks SMTP ports. Vercel Hobby restriction cannot be bypassed. No scheduler provisioned; no actual venue rates/payment details invented.
