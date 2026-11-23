import type { Pool } from "pg";
import type { StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
export const courtColumns = "id::text,name,description,active,details_version::text AS version,CASE WHEN photo IS NULL THEN '0' ELSE details_version::text END AS \"photoVersion\"";

export function validateCourtDetails(id: string, input: { name: unknown; description: unknown; version: unknown }) {
  if (!/^[1-9]\d{0,18}$/.test(id) || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100 || typeof input.description !== "string" || input.description.trim().length > 1000 || typeof input.version !== "string" || !/^\d{1,19}$/.test(input.version)) throw new Error("INVALID_INPUT");
  return { name: input.name.trim(), description: input.description.trim() || null, version: input.version };
}

export async function updateCourtDetails(pool: Db, verify: StaffVerifier, id: string, body: { name: unknown; description: unknown; version: unknown }, photo?: Buffer) {
  const input = validateCourtDetails(id, body);
  const actor = await verify();
  if (!actor) throw new Error("UNAUTHENTICATED");
  const c = await pool.connect(); let committing = false, committed = false;
  try {
    await c.query("BEGIN");
    if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    const previousSettingsVersion = (await c.query("SELECT version::text FROM ethn.settings WHERE singleton FOR UPDATE")).rows[0].version;
    const current = (await c.query("SELECT details_version::text AS version FROM ethn.courts WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!current) throw new Error("COURT_NOT_FOUND");
    if (current.version !== input.version) throw new Error("STALE_VERSION");
    const row = (await c.query(`UPDATE ethn.courts SET name=$2,description=$3,photo=CASE WHEN $4::bytea IS NULL THEN photo ELSE $4 END WHERE id=$1 RETURNING ${courtColumns}`, [id, input.name, input.description, photo ?? null])).rows[0];
    const settingsVersion = (await c.query("UPDATE ethn.settings SET version=version+1 WHERE singleton RETURNING version::text")).rows[0].version;
    await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'court.details',$2::jsonb)", [actor, JSON.stringify({ courtId: id, photoReplaced: photo !== undefined })]);
    committing = true; await c.query("COMMIT"); committed = true;
    return { ...row, previousSettingsVersion, settingsVersion };
  } catch (error) {
    if (!committing) try { await c.query("ROLLBACK"); } catch {}
    if (error instanceof Error && /^(FORBIDDEN|COURT_NOT_FOUND|STALE_VERSION)$/.test(error.message)) throw error;
    if (!committing && error && typeof error === "object" && "code" in error && error.code === "23505") throw new Error("NAME_COLLISION");
    throw new Error("VENUE_UNAVAILABLE");
  } finally { c.release(!committed); }
}

