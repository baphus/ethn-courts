# ETHN finance API contract

Finance, paid sales, and exports require a currently enabled Owner. Responses are private and `no-store`. Mutation routes require a valid origin and size-bounded JSON. Payment proof, phone numbers, and tracking capabilities are not exported.

## Reports

- `GET /api/ethn/admin/finance?basis=approval` defaults to the last 30 Manila days. Explicit dates are inclusive, cannot end after today, and cover at most 366 days. Cards and trend count original booking totals once on the Manila verification date of the accepted original payment. Only confirmed and completed bookings qualify, including archived bookings that still qualify. Extensions, manual sales, cancelled and refunded bookings do not count. Historical totals can change after cancellation or refund. Expenses use effective values by paid date; net profit is booking revenue minus expenses, not full accounting profit. Amount fields ending in `Cents` use integer centavos.
- Without `basis`, the receipt-date report defaults to current Manila month through today. It uses accepted payments’ receipt timestamps, falling back to verification dates only when receipt time is absent. It includes extension payments and other methods. The daily series exposes `bookingPayments`, `otherSales`, `expenses`, and `refunds` as separate decimal peso amounts. Sales corrections and external refunds use their ledger dates. Older expense corrections also use their ledger dates unless superseded by a Finance edit.
- `GET /api/ethn/admin/finance/export` requires explicit dates and accepts expense `category` and `q`. It returns itemized data only for export. Booking fields include customer name and email, approval and play dates, courts, time slots, and amounts; the rental amount is zero. Expense filters change workbook totals, not page cards or charts. Requests over 50,000 booking or expense rows reject rather than truncate; narrow the period for those exports.

- `GET /api/ethn/admin/finance?basis=cash` adds current and immediately preceding equal-length cash summaries, verified booking/extension payment method totals, and expense totals by category using ledger dates. Its daily series covers only the selected period. Amounts are decimal peso strings; expense list filters do not apply.

## Expenses and sales

- Expense list accepts dates, `page`, `limit` (max 50), `category`, and literal case-insensitive title search `q` (max 100 chars). It returns the current revision and last correction ID, category, effective amount, paid date, and optional description, vendor/payee, and notes. Existing legacy categories remain readable and filterable.
- New expenses accept title, Paddle category, positive decimal peso amount, Manila paid date, idempotency key, and optional metadata. Creation retries with the same actor, key and normalized payload return the saved result.
- Editing and permanently deleting an expense require the current revision and last correction ID. Edits establish the replacement amount and paid date and keep but supersede legacy corrections. Corrections cannot be appended after an edit. Delete removes expense and dependent corrections while retaining independent audits. Mutations and audit writes commit together. Stale writes reject with 409; uncertain results should be checked by reloading.
- Finance contains the other paid sales workflow, separate from booking payments. The Sales table filters original receipts by selected Manila dates and shows the newest 200 rows. Existing idempotent recording, dated corrections and voids remain; these do not move money. The former Paid sales page redirects to Finance.

Prepare and review migration history, effective runtime grants and RLS before using these features against an existing database. Migration execution requires separate target-specific authorization.
