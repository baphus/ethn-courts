# Hosted ETHN schema upgrade 0010 → 0028

Date: 2026-11-22. Local branch `master` @ `1b2b8e5`. Authorized by the owner in-session
(migration credentials supplied privately; not stored).

## Why

The hosted `ethn` schema was at `0010`. The runtime in this repository queries objects
added by `0011`–`0028` (court blocks, extensions, extension proofs, sales, expenses and
corrections, notifications, push, booking outcomes, court descriptions, timing grants), so
every admin page answered `503 Service unavailable` and the public availability route
failed on the missing `ethn.court_blocks`.

Read-only inspection before the change: 12 tables, 37 policies, `ethn.settings.version` 29,
`ethn.bookings` row count 0. No booking or payment data existed, so nothing could be lost.

## Rehearsal

A disposable PostgreSQL 17 cluster was built in two ways: `0001`–`0010` then `0011`–`0028`,
and a fresh `0001`–`0028`. The two databases ended with identical inventories — 24 tables,
208 columns, 93 policies, 23 table grants, 442 column grants, 330 constraints — and read
probes against every new object succeeded. Evidence from that rehearsal is in the session
log; the cluster was removed afterwards.

## Applied

`db/ethn/0011_staff_access.sql` through `0028_web_push.sql`, in filename order, inside one
transaction, using the owner (migration) login. On any error the transaction rolled back.

- Backup written before the change: `ethn` schema dump (custom format) in the session temp
  directory, outside the repository.
- Before: 12 tables, 37 policies, `settings.version` 29, timing 30/30/420/30/10.
- After: 24 tables, 93 policies, 208 columns, `settings.version` 29, timing unchanged.
- New objects readable through the restricted `ethn_checkout` login under RLS: `court_blocks`,
  `extensions`, `extension_items`, `extension_proofs`, `sales`, `sale_corrections`, `expenses`,
  `expense_corrections`, `notifications`, `push_subscriptions`, `push_deliveries`,
  `bookings.no_show`/`walk_in_actor`, `courts.description`.

## Post-check

- `GET /api/ethn/availability` → `200`, `configured: false` (rates and GCash instructions are
  still unset, so paid checkout remains disabled by design).
- `GET /api/ethn/admin/dashboard` without a session → `401`, not `503`.
- `ethn.staff_access` retains one owner row; no data rows were added or changed.

## Not covered

No browser pass was authorised for this fix and no write path was exercised against hosted.
Court rates, official GCash instructions and live mail remain launch gates, so booking
confirmation is still correctly unavailable.
