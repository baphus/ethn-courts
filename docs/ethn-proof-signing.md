# ETHN proof signing boundary

`signReservedProof` accepts an owner token, checkout ID and reservation ID; it signs only the path stored for a live, acknowledged checkout and rechecks after the Storage call. `proofStorage` is a server-only Supabase adapter using the `proofs` bucket. Set `ETHN_STORAGE_URL` and `ETHN_STORAGE_SERVICE_ROLE_KEY` on the server; missing credentials fail closed. No route is wired to this service.

The returned `expiresAt` is the checkout deadline, not the signed upload URL's independent two-hour lifetime. A post-signing check cannot revoke an already issued signature or guarantee that an upload finishes before checkout expiry; future submission must enforce the database deadline. `upsert: false` does not establish hostile-overwrite protection without a hosted Storage test. Never log signed URLs or tokens.
