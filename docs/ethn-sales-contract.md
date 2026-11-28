# ETHN manual sales contract

Paid non-booking sales only. All reads and writes require a currently enabled Owner. Mutations require a valid origin and bounded JSON; no operation moves money or issues a refund.

- `GET /api/ethn/admin/sales` lists active sales with Manila receipt dates, payment method, category and literal search filters. It returns paginated rows and each row’s `revision` (null before its first edit).
- `POST /api/ethn/admin/sales` accepts `{itemName,category,description,note,amount,method,receivedAt,idempotencyKey}`. Amount is a positive decimal peso string; method is `cash` or `gcash`; `receivedAt` is a canonical UTC ISO timestamp and cannot be in the future. Exact retries with the same actor and key return the original result.
- `PATCH /api/ethn/admin/sales/[id]` accepts the same sale fields, with `revision` instead of `idempotencyKey`. It updates the sale and supersedes any historical corrections for reporting. `DELETE` accepts only `{revision}` and removes the sale from lists, finance totals and exports while retaining its database record and history. Both operations audit atomically; stale edits reject with 409 and missing or deleted sales return 404.
- `POST /api/ethn/admin/sales/[id]/corrections` is retired (410). Existing corrections remain dated ledger entries until their sale is edited or deleted. The Sales table shows the effective amount and payment method, including historical corrections.

Apply `0017_sales_crud.sql` through the approved ETHN migration process before deployment. Editing or deleting a sale can change historical finance totals.
