# ETHN tracking

Apply `db/ethn/0005_tracking_access.sql` after migrations 0001–0004. POST `/api/checkout/track` accepts either `{ "token": "…" }` or `{ "code": "…", "email": "…" }`; do not put credentials in URLs. The checkout rate limit is shared, per process, and is not a distributed brute-force defense.

Late payment claims produce no tracking credentials and cannot be looked up publicly. Staff review is future work. Tracking displays reservation and payment statuses independently; a submitted payment is not necessarily accepted.
