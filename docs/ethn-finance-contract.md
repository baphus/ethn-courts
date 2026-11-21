# ETHN finance API contract

Owner-only, private `no-store` endpoints. Shared checkout DB role is not authorization; each request verifies current enabled owner identity. Amounts are decimal peso strings, never floating-point values.

## Meaning

`GET /api/ethn/admin/finance?from=YYYY-MM-DD&to=YYYY-MM-DD` returns inclusive Manila calendar days, capped at 366 days and not later than today. Omit both dates for current Manila month through today; provide both or neither. `daily` zero-fills every day. `cash` and `gcash` count only accepted payments using `collected_amount` and `received_at` Manila date. Pending, rejected, exception records and booking charges are excluded. Current report also includes accepted extension receipts from the same payment ledger, original paid manual sales by receipt date, and signed sale corrections by their creation date. Expenses include original paid-date amounts plus signed corrections on their correction date. Corrections are record corrections, not actual cash movement or refund processing. Totals are net recorded collections minus expenses, not accounting profit/revenue.

Response: `{from,to,scope,components:{bookingAndExtensionCollections,manualSalesAfterCorrections},totals:{cash,gcash,collected,expenses,net},daily:[{date,cash,gcash,collected,expenses,net}]}`. Each amount has two decimal places; negative net is valid.

## Expenses

`GET /api/ethn/admin/expenses?from=...&to=...&page=1&limit=50` returns `{from,to,page,limit,total,rows}` sorted by paid date descending, then creation time and ID descending. `limit` caps at 50. `rows` expose only `{id,title,category,amount,effectiveAmount,lastCorrectionId,paidDate,createdAt}`.

`POST /api/ethn/admin/expenses` accepts exactly `{title,category,amount,paidDate,idempotencyKey}`. Title trims to 1–100 characters; allowed categories: `Other`, `Utilities`, `Maintenance`, `Supplies`, `Staff`; amount must be positive numeric(12,2); paidDate is a real Manila date no later than today; idempotency key is printable ASCII, 1–200 chars. Entries are immutable. Retries with same actor/key/payload return saved result; changed payload conflicts. Every first insert creates one `expense.create` audit row in same transaction. No edit/delete exists. Owner-only append-only corrections use `/api/ethn/admin/expenses/[id]/corrections`; reason and optimistic prior correction ID are required, zero effective amount is allowed, original is retained, and correction date must be current Manila date. See `0026_expense_corrections.sql`.

Errors: 401 unauthenticated, 403 not owner, 400 invalid input, 409 idempotency conflict, 503 unavailable. API reveals no customer data or private payment proof.

## Setup boundary

`db/ethn/0017_expenses.sql` is for fresh ETHN chain and separately reviewed existing ETHN upgrade only. Do not apply against hosted data without approved migration plan. It grants restricted select/insert only for expenses; no updates/deletes. Verify effective grants, RLS, grants on idempotency and audit sequences, and restricted login behavior before use.
