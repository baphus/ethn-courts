import { defineConfig } from "drizzle-kit";

// SQL-first custom migrations only: no legacy schema, credentials or output fallback.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/ethn-migration-schema.ts",
  out: "./db/ethn-migrations",
  migrations: { schema: "ethn_migrations", table: "__drizzle_migrations" },
});
