import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("fresh ETHN migration includes full ordered chain and court migration matches reviewed SQL", () => {
  const migrations = readMigrationFiles({ migrationsFolder: "db/ethn-migrations" });
  assert.ok(migrations.some(migration => /CREATE UNIQUE INDEX payments_unique_method_transfer/.test(migration.sql.join(""))));
  assert.ok(migrations.some(migration => /CREATE FUNCTION ethn\.queue_abandoned_booking_proofs/.test(migration.sql.join(""))));
  assert.ok(migrations.every((migration, index) => index === 0 || migration.folderMillis > migrations[index - 1].folderMillis));
  assert.equal(readFileSync('db/ethn-migrations/0002_sloppy_machine_man.sql','utf8'),readFileSync('db/ethn/0030_unified_bookings.sql','utf8'));
  const files = readdirSync("db/ethn").filter(name => /^00\d\d_.*\.sql$/.test(name) && name < "0029_").sort();
  const expected = files.map(name => `-- Source: ${name}\n${readFileSync(`db/ethn/${name}`, "utf8")}`).join("\n\n");
  assert.equal(migrations[0].sql.join(""), `-- Fresh ETHN schema through 0028. Immutable after first application.\n${expected}`);
  assert.equal(files.length, 29);
  for (const [active, reference] of [["0003_owner_only_admin", "0031_owner_only_admin"], ["0004_finance_expense_actions", "0032_finance_expense_actions"], ["0005_nonconsecutive_customer_slots", "0033_nonconsecutive_customer_slots"]]) {
    assert.equal(readFileSync(`db/ethn-migrations/${active}.sql`, "utf8"), readFileSync(`db/ethn/${reference}.sql`, "utf8"));
  }
  assert.ok(migrations[1].folderMillis > migrations[0].folderMillis);
  assert.equal(readFileSync("db/ethn-migrations/0001_court_details.sql", "utf8"), readFileSync("db/ethn/0029_court_details.sql", "utf8"));
});

test("migration env accepts only .env.local and preserves precedence when both files exist", async () => {
  const { migrationEnv } = await import("../scripts/ethn-migrations.mjs");
  const dir = mkdtempSync(join(tmpdir(), "ethn-migration-env-"));
  const directory = pathToFileURL(dir + sep);
  try {
    assert.deepEqual(migrationEnv(directory, {}), {});
    writeFileSync(join(dir, ".env.local"), "TARGET=local\n");
    assert.deepEqual(migrationEnv(directory, {}), { TARGET: "local" });
    writeFileSync(join(dir, ".env"), "TARGET=default\nOTHER=default\n");
    assert.deepEqual(migrationEnv(directory, {}), { TARGET: "local", OTHER: "default" });
    assert.deepEqual(migrationEnv(directory, { TARGET: "process" }), { TARGET: "process", OTHER: "default" });
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("migration connection uses dedicated credentials and verified TLS", async () => {
  // JS runner is also directly executable without loading runtime app configuration.
  const { migrationConfig } = await import("../scripts/ethn-migrations.mjs");
  for (const url of ["postgres://ethn_checkout@localhost/db", "postgres://owner@localhost:6543/db", "postgres://owner@remote/db?sslmode=disable", "postgres://owner@remote/db"]) {
    assert.throws(() => migrationConfig({ ETHN_MIGRATION_DATABASE_URL: url }), /Migration connection unavailable/);
  }
  assert.throws(() => migrationConfig({ DATABASE_URL: "postgres://owner@localhost/db" }), /ETHN_MIGRATION_DATABASE_URL is missing/);
  assert.equal(migrationConfig({ ETHN_MIGRATION_DATABASE_URL: "postgres://owner@localhost/db", NODE_ENV: "test", ETHN_ALLOW_LOCAL_DATABASE: "1" }).ssl, false);
});
