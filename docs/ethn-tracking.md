# ETHN tracking

Apply `db/ethn/0005_tracking_access.sql` after migrations 0001–0004. POST `/api/checkout/track` accepts either `{ "token": "…" }` or `{ "code": "…", "email": "…" }`; do not put credentials in URLs. The checkout rate limit is shared, per process, and is not a distributed brute-force defense.

Late payment claims produce no tracking credentials and cannot be looked up publicly. Tracking displays reservation and payment statuses independently; a submitted payment is not necessarily accepted.

The private `/checkout/track/[token]` page can display the original attached payment screenshot on demand. Its same-origin proof route rechecks the tracking token and booking/proof ownership and serves the image without caching or exposing a storage URL. Code-and-email lookup and the tracking JSON API do not expose the screenshot. Anyone with the private tracking link or QR can view it; do not share the link.
