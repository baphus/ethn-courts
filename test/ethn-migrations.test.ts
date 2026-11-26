import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("fresh ETHN migration includes full ordered chain and court migration matches reviewed SQL", () => {
  const migrations = readMigrationFiles({ migrationsFolder: "db/ethn-migrations" });
  assert.equal(migrations.length, 8);
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

test("migration connection uses dedicated credentials and verified TLS", async () => {
  // JS runner is also directly executable without loading runtime app configuration.
  const { migrationConfig } = await import("../scripts/ethn-migrations.mjs");
  for (const url of ["postgres://ethn_checkout@localhost/db", "postgres://owner@localhost:6543/db", "postgres://owner@remote/db?sslmode=disable", "postgres://owner@remote/db"]) {
    assert.throws(() => migrationConfig({ ETHN_MIGRATION_DATABASE_URL: url }), /Migration connection unavailable/);
  }
  assert.throws(() => migrationConfig({ DATABASE_URL: "postgres://owner@localhost/db" }), /ETHN_MIGRATION_DATABASE_URL is missing/);
  assert.equal(migrationConfig({ ETHN_MIGRATION_DATABASE_URL: "postgres://owner@localhost/db", NODE_ENV: "test", ETHN_ALLOW_LOCAL_DATABASE: "1" }).ssl, false);
});
