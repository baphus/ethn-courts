import type { Pool, PoolClient } from "pg";
import { getStaff, type StaffVerifier } from "./ethn-payments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keys = (v: unknown, names: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));

type Role = "owner" | "staff";
type Access = { user_id: string; role: Role; enabled: boolean };
export type TargetLookup = (userId: string) => Promise<boolean>;

const current = (row: Pick<Access, "user_id" | "enabled">) => ({ userId: row.user_id, enabled: row.enabled });

function validate(body: unknown) {
  if (!keys(body, ["userId", "enabled"]) || typeof body.userId !== "string" || !uuid.test(body.userId) || typeof body.enabled !== "boolean") throw new Error("INVALID_INPUT");
  return { userId: body.userId.toLowerCase(), enabled: body.enabled };
}

async function identity(verify: StaffVerifier) {
  const actor = await verify();
  if (!actor || !uuid.test(actor)) throw new Error("UNAUTHENTICATED");
  return actor.toLowerCase();
}

export async function listOwners(pool: Pick<Pool, "connect">, verify: StaffVerifier) {
  const actor = await identity(verify), client = await pool.connect();
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); transaction = true;
    if (!(await client.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor])).rows.length) throw new Error("FORBIDDEN");
    const rows = (await client.query("SELECT user_id::text, enabled FROM ethn.staff_access WHERE role='owner' ORDER BY user_id")).rows as Pick<Access, "user_id" | "enabled">[];
    committing = true; await client.query("COMMIT"); return { owners: rows.map(current) };
  } catch (error) {
    if (committing) discard = true; else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    if (error instanceof Error && error.message === "FORBIDDEN") throw error;
    throw new Error("STAFF_UNAVAILABLE");
  } finally { client.release(discard); }
}

// Lock order is staff rows (ascending) before settings. Existing writers take their
// own staff row before settings, so this avoids the settings-first deadlock.
// shortcut: a row inserted after the locking scan is locked after settings and can
// deadlock with a pricing edit racing that new account; PostgreSQL aborts one side
// safely and the single retry below re-reads state. Revisit if inserts get frequent.
async function write(pool: Pick<Pool, "connect">, actor: string, input: { userId: string; enabled: boolean }) {
  const client: PoolClient = await pool.connect();
  let transaction = false, committing = false, discard = false;
  try {
    await client.query("BEGIN"); transaction = true;
    await client.query("SELECT user_id FROM ethn.staff_access ORDER BY user_id FOR UPDATE");
    if (!(await client.query("SELECT version::text FROM ethn.settings WHERE singleton FOR UPDATE")).rows.length) throw new Error("SETTINGS_UNAVAILABLE");
    // A membership insert serialized behind this lock may have committed after the
    // locking scan, so compute from a fresh snapshot taken under the settings mutex.
    const rows = (await client.query("SELECT user_id::text, role, enabled FROM ethn.staff_access ORDER BY user_id")).rows as Access[];
    const actorRow = rows.find(row => row.user_id === actor);
    if (!actorRow?.enabled || actorRow.role !== "owner") throw new Error("FORBIDDEN");
    const existing = rows.find(row => row.user_id === input.userId);
    if (!input.enabled && existing?.role !== "owner") throw new Error("TARGET_NOT_FOUND");
    const next: Access = { user_id: input.userId, role: "owner", enabled: input.enabled };
    const result = existing ? rows.map(row => row.user_id === input.userId ? next : row) : [...rows, next];
    if (!result.some(row => row.enabled && row.role === "owner")) throw new Error("LAST_OWNER");
    if (existing && existing.role === next.role && existing.enabled === next.enabled) {
      committing = true; await client.query("COMMIT"); return current(next);
    }
    await client.query("INSERT INTO ethn.staff_access(user_id,role,enabled) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role, enabled=EXCLUDED.enabled", [next.user_id, next.role, next.enabled]);
    await client.query("INSERT INTO ethn.audit(actor,action,detail) VALUES ($1,'staff.update',$2::jsonb)", [actor, JSON.stringify({ userId: next.user_id, oldRole: existing?.role ?? null, oldEnabled: existing?.enabled ?? null, newRole: next.role, newEnabled: next.enabled })]);
    committing = true; await client.query("COMMIT"); return current(next);
  } catch (error) {
    if (committing) discard = true; else if (transaction) { try { await client.query("ROLLBACK"); } catch { discard = true; } }
    throw error;
  } finally { client.release(discard); }
}

export async function putOwnerAccess(pool: Pick<Pool, "connect">, verify: StaffVerifier, targetExists: TargetLookup, body: unknown) {
  const input = validate(body), actor = await identity(verify);
  if ((await getStaff(pool, async () => actor)).role !== "owner") throw new Error("FORBIDDEN");
  let exists: boolean;
  try { exists = await targetExists(input.userId); } catch { throw new Error("STAFF_UNAVAILABLE"); }
  if (!exists) throw new Error("TARGET_NOT_FOUND");
  for (let attempt = 0; ; attempt++) {
    try { return await write(pool, actor, input); }
    catch (error) {
      if (attempt === 0 && error && typeof error === "object" && "code" in error && error.code === "40P01") continue;
      if (error instanceof Error && /^(FORBIDDEN|LAST_OWNER|TARGET_NOT_FOUND|SETTINGS_UNAVAILABLE)$/.test(error.message)) throw error;
      throw new Error("STAFF_UNAVAILABLE");
    }
  }
}
