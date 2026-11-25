# ETHN extension domain slice (integration pending)

This contract covers only `ethn.extensions`, `ethn.extension_items`, the extension ownership of `ethn.court_allocations`, and `ethn.payments.extension_id`. It is not a complete staff feature until shared read/reporting callers below are integrated.

> The extension management page and all extension write endpoints are retired. See [extension and refund retirement](ethn-extension-refund-retirement.md) for the required pre-deployment reconciliation. Historical records, allocations, and payments are retained.

## Hold (historical)

`createExtensionHold(pool, verifyStaffIdentity, body)` accepts exactly:

```json
{"bookingId":"UUID","courtId":"1","date":"YYYY-MM-DD","start":"UTC ISO instant","end":"UTC ISO instant","settingsVersion":"1","idempotencyKey":"stable retry key"}
```

Current enabled owner/staff identity is verified in the transaction. A confirmed booking whose latest original item or confirmed extension is still ongoing may extend only its own court, contiguously from current effective end, on the same operating date, within the posted schedule/rate. Hold deadline is the earlier of current `settings.hold_minutes` (default 10) and original effective end; staff must verify and confirm payment before original time ends. Current settings version and current rate determine exact price; hold expiry uses `settings.hold_minutes` (default 10). Exactly one live held/pending extension may exist per original booking. Shared court-allocation GiST exclusion arbitrates overlaps. Hold retries are actor-scoped and payload-bound.

## Confirm / expiry

`confirmExtension` requires explicit `paymentReceived: true`, full amount and staff-recorded receipt. Cash has no reference; GCash needs a reference and the merchant snapshot frozen when its hold was created; later settings edits do not silently replace that recipient. The accepted receipt is one row in `ethn.payments`, linked with `extension_id` and original `booking_id`; the original booking payment remains unchanged. Existing global accepted-reference uniqueness applies. Mutations lock staff, settings, courts, original booking, then extension/allocation; confirmation checks database wall-clock expiry after locks; late receipt is rejected and cannot occupy released inventory. Confirmation is idempotent by staff/key/payload. `expireExtension` releases only an elapsed held extension allocation. Neither operation changes the original booking or its allocation/items/payment.

## Migration / parent integration required

Fresh local test chain is migrations 0001–0017, then 0021 (other lanes 0018–0020 are deliberately not prerequisites). Apply 0021 to existing ETHN data only under separately approved migration review.

Integration owners must:

- Availability, admin calendar, hours/block collision checks, and Open Play collision checks include allocations joined via `extension_item_id` and `extension_items`, while still relying on shared exclusion for writes.
- Effective booking end/status/completion derives latest confirmed original item or confirmed extension item; expiry/rejection never extends it. Completion must also transition the extension allocation `confirmed`→`completed` and extension `confirmed`→`completed` when parent completion policy allows it.
- Booking detail exposes extension items and payments (`payments.extension_id`); finance counts accepted extension payments once using `ethn.payments` and original booking link, without double-counting legacy booking payment projections.
- Staff UI/API adds hold, full-receipt confirmation and expiry actions; no customer proof workflow is claimed by this backend slice.

Backend verification is available in `test/ethn-extensions.test.ts` using fresh 0001–0017 + 0021 schema and a restricted local login. Latest successful run: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-extensions/run-1795218003077` (server stopped; temp database data removed).

No API route/UI, shared readers, hours, availability, outcomes or finance implementation is included here. Do not advertise as complete until these integrations and the real-database verification are complete.
