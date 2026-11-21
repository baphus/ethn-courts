# ETHN manual sales contract

Scope: paid manual non-booking sales only. Sales are not inventory/POS, and cannot reference or collect a booking. Staff can create sales and list own sales; owners can list all sales and append corrections. Correction authority is checked from enabled `ethn.staff_access` inside each transaction.

`db/ethn/0020_sales.sql` extends the fresh chain after `0019` (independent `0018`/`0019` migrations stay untouched). Do not apply this fresh-chain migration to existing data without an approved migration plan.

## Data and operations

- `ethn.sales` stores positive `numeric(12,2)` amount, `cash|gcash`, actual `received_at` instant, description (1–160 chars), optional note (max 500), staff actor, and immutable creation time. Timestamp is canonical UTC ISO milliseconds, may not exceed current time by over five minutes.
- Create requires exact JSON `{description,note,amount,method,receivedAt,idempotencyKey}`. Money parses as bounded integer centavos; no floating-point arithmetic. Idempotency key is actor scoped; exact retry returns original result, changed payload conflicts. Audit and result commit with sale.
- Corrections append to `ethn.sale_corrections`: positive replacement amount/method or `amount:null,method:null` to void; reason required. Request `{amount,method,reason,expectedCorrectionId,idempotencyKey}`. `expectedCorrectionId` is current correction ID or null for original; stale concurrent requests conflict, so only one wins. Replacement method may change independently; amount and method must both be null for a void or both be present for replacement. Original sale is never updated. Each correction is dated at database creation time, links previous correction, records signed amount/cash/GCash deltas and audit atomically. Exact retry is idempotent.
- A correction records a data correction, not cash movement. Void does not claim refund or cash returned. If actual cash was returned, it happened outside this app; no refund processing is provided. Corrections affect finance only on their correction date, never rewrite historical collection dates.
- List DTO exposes correction chain. Staff see own entries only and no staff identity; owners see all and creator IDs. Details/notes are operational sale data; no customer identity field exists.
- SQL grants/RLS permit only role-mediated server reads/inserts; checkout role has no UPDATE/DELETE on sales or corrections. Runtime role checks remain mandatory because checkout DB role is shared.

API/UI and finance report integration are intentionally deferred for parent integration. Finance must count original sale collections by `received_at`, and correction signed deltas by `created_at`, separately from booking collections and expenses; no net-profit representation.
