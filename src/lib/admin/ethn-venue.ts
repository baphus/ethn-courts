import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function actorId(v: string | null) { if (!v || !uuid.test(v)) throw new Error("UNAUTHENTICATED"); return v.toLowerCase(); }
function validate(input: unknown): { name: string; description: string | null; idempotencyKey: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_INPUT");
  const b = input as Record<string, unknown>, names = ["name", "description", "idempotencyKey"];
  if (Object.keys(b).some(k => !names.includes(k)) || Object.keys(b).length < 2 || !Object.hasOwn(b, "name") || !Object.hasOwn(b, "idempotencyKey") || typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > 100 || !(b.description === undefined || b.description === null || typeof b.description === "string" && b.description.trim().length <= 1000) || typeof b.idempotencyKey !== "string" || !/^[\x21-\x7e]{1,200}$/.test(b.idempotencyKey)) throw new Error("INVALID_INPUT");
  return { name: b.name.trim(), description: typeof b.description === "string" && b.description.trim() ? b.description.trim() : null, idempotencyKey: b.idempotencyKey };
}
export async function listCourts(pool: Db, verify: StaffVerifier) {
  const actor = actorId(await verify()), c = await pool.connect(); let committed = false, committing = false, discard = false;
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor])).rows.length) throw new Error("FORBIDDEN");
    const rows = (await c.query("SELECT id::text,name,description,active FROM ethn.courts ORDER BY id")).rows;
    committing = true; await c.query("COMMIT"); committed = true; return rows;
  } catch (e) { if (!committing) try { await c.query("ROLLBACK"); } catch {} else discard = true; if (e instanceof Error && e.message === "FORBIDDEN") throw e; throw new Error("VENUE_UNAVAILABLE"); }
  finally { c.release(discard || !committed); }
}
export async function createCourt(pool: Db, verify: StaffVerifier, body: unknown) {
  const input = validate(body), actor = actorId(await verify()), ownerHash = hash(actor), fingerprint = hash(JSON.stringify({ name: input.name, description: input.description })), c = await pool.connect(); let committed = false, committing = false, discard = false;
  try {
    await c.query("BEGIN");
    if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor])).rows.length) throw new Error("FORBIDDEN");
    await c.query("SELECT singleton FROM ethn.settings WHERE singleton FOR UPDATE");
    await c.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'court.create',$2,$3,NULL) ON CONFLICT DO NOTHING", [ownerHash, input.idempotencyKey, fingerprint]);
    const idem = (await c.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='court.create' AND key=$2 FOR UPDATE", [ownerHash, input.idempotencyKey])).rows[0];
    if (!idem || idem.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if (idem.result) { committing = true; await c.query("COMMIT"); committed = true; return idem.result; }
    const court = (await c.query("INSERT INTO ethn.courts(name,description,active) VALUES($1,$2,false) RETURNING id::text,name,description,active", [input.name,input.description])).rows[0];
    await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'court.create',$2::jsonb)", [actor, JSON.stringify({ courtId: court.id })]);
    await c.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='court.create' AND key=$2 AND fingerprint=$3", [ownerHash,input.idempotencyKey,fingerprint,JSON.stringify(court)]);
    committing = true; await c.query("COMMIT"); committed = true; return court;
  } catch (e) {
    if (!committing) try { await c.query("ROLLBACK"); } catch {}
    if (committing) discard = true;
    if (e instanceof Error && /^(FORBIDDEN|IDEMPOTENCY_MISMATCH)$/.test(e.message)) throw e;
    if (!committing && e && typeof e === "object" && "code" in e && e.code === "23505" && "constraint" in e && e.constraint === "courts_name_key") throw new Error("NAME_COLLISION");
    throw new Error("VENUE_UNAVAILABLE");
  } finally { c.release(discard || !committed); }
}
