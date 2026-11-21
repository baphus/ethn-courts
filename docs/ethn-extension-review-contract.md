# Extension proof review contract

This is a supplement to `db/ethn/0021_extensions.sql`; apply `0027_extension_review.sql` only after approved migration review. It changes no cash-extension APIs or services.

`src/lib/admin/ethn-extension-review.ts` exports:

- `reserveExtensionProof(pool, verify, { extensionId, mimeType, byteSize, key })` → `{ extensionId, proofId, objectPath, mimeType, byteSize, state: "reserved", expiresAt }`.
- `signExtensionProof(pool, verify, { extensionId, proofId }, storage)` → `{ signedUrl, token, path, expiresAt }`. `storage` uses `proofStorage` shape (`inspect(path)` and `sign(path)`).
- `submitExtensionProof(pool, verify, { extensionId, proofId, key, claimedReference, claimedAmount }, storage)` → `{ extensionId, bookingId, proofId, paymentId, status, total, expiresAt }`. Client must upload first using signed reservation. Server inspects private object MIME and byte count.
- `approveExtensionProof(pool, verify, { extensionId, key, receivedAt, amount, acceptedReference })` → `{ extensionId, bookingId, status: "confirmed", total }`.
- `rejectExtensionProof(pool, verify, { extensionId, key, reason })` → `{ extensionId, bookingId, status: "rejected" }`.

All mutations persist idempotency result with actor, operation, key and canonical request fingerprint. Replays return original result; key reuse with changed fields is rejected. UI must present claimed amount/reference as unverified claims, never accepted payment. Timely submission transitions extension and its own allocation to pending; approve confirms only that allocation, reject releases only that allocation. A late submission records an `exception` payment and proof, expires the extension and never reacquires allocation. Original booking row, payment and allocation remain unchanged. Completion must not finalize parent booking while an extension is pending review.
