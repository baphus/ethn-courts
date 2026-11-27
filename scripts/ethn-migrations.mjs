import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const folder = fileURLToPath(new URL("../db/ethn-migrations/", import.meta.url));
const migrations = readMigrationFiles({ migrationsFolder: folder });
export function assertFreshTarget(schemas, roles) {
  if (schemas.includes("ethn") || schemas.includes("ethn_migrations")) throw new Error("Fresh migration requires absent ethn and ethn_migrations schemas; no data is deleted automatically.");
  if (!["anon", "authenticated", "ethn_checkout"].every(name => roles.some(role => role.rolname === name))) throw new Error("Provision anon, authenticated and restricted ethn_checkout roles first.");
  const runtime = roles.find(role => role.rolname === "ethn_checkout");
  if (!runtime.rolcanlogin || runtime.rolsuper || runtime.rolbypassrls || runtime.rolcreaterole || runtime.rolcreatedb || runtime.memberships) throw new Error("ethn_checkout must be a dedicated restricted login without elevated role memberships.");
}
export function migrationConfig(env) {
  try {
    if (!env.ETHN_MIGRATION_DATABASE_URL) throw new Error("MISSING_MIGRATION_URL");
    const url = new URL(env.ETHN_MIGRATION_DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.hostname || url.pathname === "/" || url.search || url.hash || url.port === "6543" || decodeURIComponent(url.username).startsWith("ethn_checkout")) throw new Error();
    const local = ["development", "test"].includes(env.NODE_ENV) && env.ETHN_ALLOW_LOCAL_DATABASE === "1" && ["localhost", "127.0.0.1"].includes(url.hostname);
    const ca = local ? undefined : readFileSync(env.ETHN_DATABASE_CA_FILE ?? "", "utf8");
    if (!local && !ca?.trim()) throw new Error();
    return { connectionString: url.toString(), ssl: local ? false : { ca, rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 10000 };
  } catch (error) {
    if (error instanceof Error && error.message === "MISSING_MIGRATION_URL") throw new Error("ETHN_MIGRATION_DATABASE_URL is missing. Set migration-owner connection in .env.local, not runtime credentials.");
    throw new Error("Migration connection unavailable. Set dedicated ETHN_MIGRATION_DATABASE_URL and verified ETHN_DATABASE_CA_FILE; never use runtime/legacy credentials or transaction pooler.");
  }
}

function optionalEnvFile(path) {
  try { return parseEnv(readFileSync(path, "utf8")); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}

/** @param {Record<string, string | undefined>} [env] */
export function migrationEnv(directory = new URL("../", import.meta.url), env = process.env) {
  return { ...optionalEnvFile(new URL(".env", directory)), ...optionalEnvFile(new URL(".env.local", directory)), ...env };
}

async function main() {
  const action = process.argv[2];
  if (!["status", "migrate"].includes(action)) throw new Error("Use status or migrate.");
  const pool = new Pool(migrationConfig(migrationEnv()));
  const c = await pool.connect();
  try {
    if (!(await c.query("SELECT pg_try_advisory_lock(692873421) AS locked")).rows[0].locked) throw new Error("Another ETHN migration is running.");
    const exists = (await c.query("SELECT to_regclass('ethn_migrations.__drizzle_migrations') IS NOT NULL AS present")).rows[0].present;
    const rows = exists ? (await c.query("SELECT hash,created_at FROM ethn_migrations.__drizzle_migrations ORDER BY created_at")).rows : [];
    // Drizzle tracks timestamps; check hashes too so edits/history gaps cannot silently pass.
    if (rows.length > migrations.length || rows.some((row, i) => row.hash !== migrations[i].hash || String(row.created_at) !== String(migrations[i].folderMillis))) throw new Error("ETHN migration history mismatch; stop and review.");
    if (action === "status") {
      console.log(JSON.stringify({ applied: rows.length, pending: migrations.length - rows.length, freshSetupRequired: rows.length === 0 })); return;
    }
    if (!rows.length) {
      const schemas = (await c.query("SELECT nspname FROM pg_namespace WHERE nspname IN ('ethn','ethn_migrations')")).rows.map(row => row.nspname);
      const roles = (await c.query("SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb, EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships FROM pg_roles WHERE rolname IN ('anon','authenticated','ethn_checkout')")).rows;
      assertFreshTarget(schemas, roles);
    }
    await migrate(drizzle(c), { migrationsFolder: folder, migrationsSchema: "ethn_migrations", migrationsTable: "__drizzle_migrations" });
    console.log(`Applied ${migrations.length - rows.length} ETHN migrations.`);
  } finally { c.release(true); await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const safe = ["ETHN_MIGRATION_DATABASE_URL is missing.", "Migration connection unavailable.", "Fresh migration requires", "Provision anon,", "ethn_checkout must", "Another ETHN migration", "ETHN migration history mismatch;", "Use status or migrate."];
    const connectionErrors = {
      ENOTFOUND: "Database hostname could not be resolved (ENOTFOUND). Copy the exact host from your database Connect panel; check DNS/network or use a supported session connection on port 5432.",
      ECONNREFUSED: "Database connection refused (ECONNREFUSED). Check host, port and database availability.",
      ENETUNREACH: "Database network unreachable (ENETUNREACH). Direct Supabase connections may require IPv6; use a supported session connection on port 5432 if needed.",
      "28P01": "Database authentication failed (28P01). Check migration-owner username and password.",
    };
    if (error?.code === "P0001" && error.message === "ETHN_OWNER_ROSTER_REVIEW_REQUIRED") {
      console.error("ETHN Owner roster review required. No pending schema changes committed. See docs/ethn-drizzle-migrations.md.");
    } else {
      console.error(connectionErrors[error?.code] ?? (error instanceof Error && safe.some(prefix => error.message.startsWith(prefix)) ? error.message : "ETHN migration command failed. Check connection, permissions and migration SQL; raw errors suppressed to protect credentials. See docs/ethn-drizzle-migrations.md."));
    }
    process.exitCode = 1;
  });
}
