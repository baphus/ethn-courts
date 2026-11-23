import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";

type SetupPool = Pick<Pool, "connect">;
export type OwnerAccountCreator = (email: string, password: string) => Promise<string>;
const closedQuery = "SELECT EXISTS (SELECT 1 FROM ethn.staff_access) OR EXISTS (SELECT 1 FROM ethn.audit WHERE action='owner.bootstrap') AS closed";

export function checkSetupKey(expected: string | undefined, supplied: unknown) {
  if (!expected || expected.length < 32) throw new Error("SETUP_UNAVAILABLE");
  if (typeof supplied !== "string" || supplied.length > 512) throw new Error("INVALID_SETUP_KEY");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(expected), digest(supplied))) throw new Error("INVALID_SETUP_KEY");
}

export async function firstOwnerAvailable(pool: SetupPool): Promise<boolean> {
  const client = await pool.connect();
  try { return !(await client.query(closedQuery)).rows[0].closed; }
  finally { client.release(); }
}

export async function createFirstOwner(pool: SetupPool, createAccount: OwnerAccountCreator, expectedKey: string | undefined, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_INPUT");
  const input = body as Record<string, unknown>;
  checkSetupKey(expectedKey, input.setupKey);
  if (Object.keys(input).sort().join(",") !== "email,password,setupKey" || typeof input.email !== "string" || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128) throw new Error("INVALID_INPUT");
  const client = await pool.connect();
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    // Same lock order as staff management; settings serializes even an empty staff table.
    await client.query("SELECT user_id FROM ethn.staff_access ORDER BY user_id FOR UPDATE");
    if (!(await client.query("SELECT version::text FROM ethn.settings WHERE singleton FOR UPDATE")).rows.length) throw new Error("SETUP_UNAVAILABLE");
    if ((await client.query(closedQuery)).rows[0].closed) throw new Error("SETUP_CLOSED");
    const userId = await createAccount(input.email.toLowerCase(), input.password);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("ACCOUNT_UNAVAILABLE");
    await client.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,'owner',true)", [userId]);
    await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES ($1,'owner.bootstrap','{}'::jsonb)", [userId]);
    committing = true; await client.query("COMMIT");
    return { created: true as const };
  } catch (error) {
    if (committing) discard = true;
    else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    // Auth and SQL cannot share a transaction. Never delete an account after an ambiguous commit.
    if (error instanceof Error && ["SETUP_CLOSED", "ACCOUNT_UNAVAILABLE"].includes(error.message)) throw error;
    throw new Error("SETUP_UNAVAILABLE");
  } finally { client.release(discard); }
}
