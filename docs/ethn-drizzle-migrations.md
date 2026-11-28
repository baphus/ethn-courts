# ETHN Drizzle-managed migrations (fresh database)

## Scope

Use a new ETHN database/project, or a separately backed-up and explicitly approved reset. Tooling never wipes data. Existing `ethn` or `ethn_migrations` schemas without matching history are refused, not adopted. The previous baseline-only setup was replaced before any database adoption was executed; do not reuse any independently recorded old baseline history.

Drizzle manages SQL-first custom migrations in `db/ethn-migrations/`:

1. `0000_fresh_ethn.sql`: full ordered ETHN schema/access chain through 0028, including both 0026 files.
2. `0001_court_details.sql`: court descriptions/photo/version upgrade (old 0029).
3. `0002_sloppy_machine_man.sql`: configurable payment instructions/versioned QR images, optional actual payment evidence, direct internal booking compatibility, refund/cancellation outcomes and archive metadata (reference `db/ethn/0030_unified_bookings.sql`). Generated filename retained from installed CLI.

4. `0003_owner_only_admin.sql`: promotes enabled Staff to Owner, records each promotion in audit history, and prohibits enabled non-Owner memberships.
5. `0004_finance_expense_actions.sql`: adds expense metadata and revisions, and permits audited Owner edits/deletes through the active service.
6. `0005_nonconsecutive_customer_slots.sql`: permits multiple non-overlapping booking items per court. Apply before deploying customer checkout with separated time blocks; the allocation exclusion constraint stays in place.
7. `0006_ambiguous_maximus.sql`: historical pending-cancellation guard change. Retain in migration history; automatic pending cancellation is retired.
8. `0007_fine_sugar_man.sql`: adds customer-hosted Open Play listings and a view of eligible booking schedules. Apply before deploying changes to booking tracking and Open Plays.
9. `0008_owner_access_cutover.sql`: blocks migration if an enabled Owner was promoted by `0003` and has no later audited regrant. Keeps the existing database constraint that prohibits enabled non-Owners.

Separate history: `ethn_migrations.__drizzle_migrations`. Legacy `drizzle/`, `drizzle.config.ts`, `src/db/schema.ts` and `supabase/` are not used. Never run default drizzle-kit push/migrate against ETHN. ETHN custom schema is deliberately empty; never use push with it. Runtime remains server-side SQL, not ORM queries. Old db/ethn files remain reference/fresh-test fixtures; do not run both chains on the same database.

Apply `0009_productive_moondragon.sql` before deploying optional Reclub links. It allows blank links on booking-backed listings and adds an optional link to staff-created listings.

Before applying `0010_unique_payment_transfer.sql`, check historical references through authorized private access: `SELECT method, lower(btrim(accepted_reference)), count(*) FROM ethn.payments WHERE accepted_reference IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;`. Reconcile conflicts without deleting payment history.

Apply `0011_flowery_dexter_bennett.sql` before deploying sale item names and categories. Existing sales retain their original description and appear as Uncategorized. No sale amounts, corrections, or reporting calculations change.

Apply `0012_mean_longshot.sql` before deploying permanent booking deletion. This owner-only action erases the booking, extensions, finance records, and linked history; it does not refund payment or notify the customer. Future slots reopen on commit. An anonymous block preserves a slot already in progress until its original end. Private proof access through the app ends on commit; existing signed URLs may work until removal or expiry. Proof files are removed after the response, with retries and a final sweep through `/api/cron/ethn-deleted-proofs` (requires `CRON_SECRET` and ETHN Storage credentials).

Apply `0013_protect_booking_finance_and_prune_proofs.sql` before deploying the updated deletion and proof-cleanup code. It prevents permanent deletion if any accepted payment or recorded refund exists. Use archive for eligible terminal bookings with money history. The existing daily proof job also queues up to 25 still-unattached reservations per run once their checkout has been expired for 90 days. Attached evidence is excluded; late evidence must be submitted within that window or reconciled with the venue. The job retries failed Storage removals.

Apply `0014_allow_audited_paid_booking_deletion.sql` before enabling Delete for all bookings. It allows owners to remove payments and refunds along with bookings, which can change historical finance reports. It does not issue refunds. The existing deletion reason, detached audit entry, current-slot protection, and proof cleanup remain. The migration itself does not delete records.

Apply `0015_notification_dismissal.sql` before deploying the updated inbox. Deleting a notification dismisses it from that recipient’s list and unread count without deleting the original event or booking.

Apply `0016_open_play_host.sql` before deploying the updated staff Open Plays page. Existing venue sessions have no Host until an Owner adds one. Public listings do not expose it.

Apply `0017_sales_crud.sql` before deploying Sales edit/delete. It adds revisions and soft deletion; the migration itself does not change any sale or correction amounts. `0018_certain_riptide.sql` revokes runtime insertion of new sale corrections without changing correction history.

Keep the exact mixed line endings in `0000_fresh_ethn.sql`: deployed migration history hashes those bytes. Later migration SQL uses LF.

## Prerequisites

1. Confirm target project identity and backup/restore plan. Prefer new database over deleting existing data. No reset command is provided.
2. Use migration-owner account capable of creating schemas, tables, functions, grants and btree_gist extension. Provision roles before migrating: `anon`, `authenticated` and `ethn_checkout`. Supabase already supplies anon/authenticated; never replace its roles. Plain PostgreSQL can use NOLOGIN anon/authenticated placeholder roles.
3. Provision `ethn_checkout` separately as LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE, with no role memberships and secure password. Do not store password in SQL/repository. Migration runner verifies these attributes and refuses runtime credentials as migration owner.
4. Set dedicated `ETHN_MIGRATION_DATABASE_URL` securely in process environment. Use direct PostgreSQL connection, not transaction pooler port 6543. Set `ETHN_DATABASE_CA_FILE` to verified remote CA file. URL query overrides are rejected. No runtime/legacy credential fallback. npm commands load .env then .env.local; process environment takes precedence.
5. Disposable loopback exception only: NODE_ENV=test and ETHN_ALLOW_LOCAL_DATABASE=1 permit non-TLS localhost/127.0.0.1.

## Apply

Run from repository root after approving target and migration:

```sh
npm run db:status
npm run db:migrate
npm run db:status
```

Fresh expected result: applied=15, pending=0. Do not deploy the new Finance code ahead of its schema migration. Unified Bookings upgrade has only disposable-local verification; review backups, existing held-checkout cutover and target schema history before authorizing application to existing data. Repeat migrate reports Applied 0. The runner serializes its own executions with advisory lock and checks history hashes/timestamps before applying pending SQL. No auto-reset, baseline stamping or auto-retry. Drizzle can create its history schema/table before running migration transaction; if an interrupted/failed first attempt leaves empty history schema, inspect before removing only that empty schema under separate approval. Never drop ETHN data to silence an error.

Verify effective grants/RLS with restricted login and test owner access, booking availability and picture replacement. Fresh SQL seeds courts/settings but does not provision actual Auth users or owner access, proof Storage, GCash instructions, live rates, mail or scheduler. Configure separately. Browser Auth and private Storage must target same ETHN Supabase project. Moving to another Supabase project requires updating Auth/Storage environment and provisioning private proof bucket/policies; SQL migrations do not move identities, proofs or old bookings.

## Owner roster review

Applied migration `0003` is immutable. Its historical behavior was to promote enabled Staff. The pending migrations run in one transaction: if `0003` and `0008` are both pending, the review gate rolls back any promotions before they can confer access. Stop admin writes for the cutover and confirm a restorable backup first.

- **If `0003` is pending on an existing target:** review the enabled Staff roster and have an authorized operator disable those memberships before migrating. Verify at least one enabled Owner remains. Do not delete membership rows or Auth accounts. If no enabled Owner exists, stop and arrange approved Owner recovery before proceeding; setup does not reopen.
- **If `0003` already ran:** use its `owner.cutover` audit records to identify promoted accounts. Disable their Owner access. If an account should retain access, explicitly regrant it through Owner access management after revocation; the subsequent `staff.update` audit establishes review. If a promoted account is the only enabled Owner, stop and arrange approved recovery or a separately verified Owner before revoking it. Verify the roster before retrying. Do not insert synthetic audit records to bypass the gate.

## Future custom migrations

```sh
npm run db:generate -- --name=descriptive_change
```

Edit generated SQL, test disposable DB, commit SQL and generated metadata, then run approved migrate command. Use SQL-first for grants, RLS, functions and triggers. Schema-diff generation is not configured. Never modify applied migrations. Do not bypass runner with raw drizzle-kit migrate.
