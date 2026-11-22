# Hosted ETHN migration preflight

Date: 2026-11-22. User authorized pending ETHN migrations on same configured hosted Supabase database. Legacy `supabase/` and `drizzle/` excluded.

## Result

No pending migration identified across 29 current `db/ethn/*.sql` files, including both `0026_contact_settings.sql` and `0026_expense_corrections.sql`. No scripts rerun and no schema/data writes performed during this preflight.

Earlier in this session, `0026_contact_settings.sql` was committed separately. Actual restricted runtime connection verified contact-column reads under RLS and effective contact UPDATE grants; settings version stayed unchanged and contact fields remained null.

## Evidence

- Read-only owner catalog inspection, transaction rolled back, exit 0: 24 tables, 211 columns, 93 policies, 67 indexes. Extracted CREATE TABLE, first ADD COLUMN per statement, CREATE POLICY and CREATE INDEX fingerprints had no missing objects across all 29 files.
- All 24 ETHN tables have RLS enabled.
- Separate actual `ethn_checkout` connection, effective privilege inspection, exit 0: 406 SELECT/INSERT/UPDATE/DELETE/USAGE table, column and sequence grant checks from current migration GRANT statements; no missing privileges.
- First grant-check parser attempt exited 1 with PostgreSQL 22023; corrected statement-bounded parsing and reran successfully. No writes in either attempt.
- Prior hosted upgrade evidence: `2026-11-22-hosted-schema-upgrade.md` records ordered application through `0028_web_push.sql` before contact migration existed.

## Limits

Object-existence fingerprints and effective grants are not an exact fresh-schema diff: not every column definition, constraint, policy expression or index definition was compared. No migration ledger was created. Numeric prefixes alone are ambiguous because two independent files use `0026`. Do not replay non-idempotent scripts to establish execution history.

No browser, application behavior tests, hosted write-path tests, backup, or fresh-database rehearsal performed for this read-only preflight. This is schema inventory evidence, not production-readiness approval.
