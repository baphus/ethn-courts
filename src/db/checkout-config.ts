import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export function checkoutConfig(env: Record<string, string | undefined>): PoolConfig {
  try {
    const url = new URL(env.ETHN_DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === "/" || url.search || url.hash || !/^ethn_checkout(?:\.[a-zA-Z0-9_-]+)?$/.test(decodeURIComponent(url.username))) throw new Error();
    const local = ["development", "test"].includes(env.NODE_ENV ?? "") && env.ETHN_ALLOW_LOCAL_DATABASE === "1" && ["localhost", "127.0.0.1"].includes(url.hostname);
    const ca = local ? undefined : readFileSync(env.ETHN_DATABASE_CA_FILE ?? "", "utf8");
    if (!local && !ca?.trim()) throw new Error();
    return { connectionString: url.toString(), ssl: local ? false : { ca, rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, query_timeout: 15000, statement_timeout: 15000 };
  } catch {
    throw new Error("NOT_CONFIGURED");
  }
}
