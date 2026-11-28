import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { parsePesos } from "../booking/core";
import { saleCategories, uncategorizedSale } from "./sale-details";
import type { StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const money = (v: bigint) => `${v < BigInt(0) ? "-" : ""}${(v < BigInt(0) ? -v : v) / BigInt(100)}.${((v < BigInt(0) ? -v : v) % BigInt(100)).toString().padStart(2,"0")}`;
const actorId = (s: string | null) => { if (!s || !uuid.test(s)) throw new Error("UNAUTHENTICATED"); return s.toLowerCase(); };
const fail = (e: unknown): never => { if (e instanceof Error && /^(INVALID_INPUT|UNAUTHENTICATED|FORBIDDEN|IDEMPOTENCY_MISMATCH|CORRECTION_CONFLICT|SALE_NOT_FOUND|SALE_STALE)$/.test(e.message)) throw e; throw new Error("SALES_UNAVAILABLE", { cause: e }); };
async function role(c: PoolClient, actor: string) {
  const r = await c.query("SELECT role FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor]);
  if (!r.rows.length) throw new Error("FORBIDDEN");
  return r.rows[0].role as string;
}
function amount(value: unknown) { if (typeof value !== "string") throw new Error("INVALID_INPUT"); try { const n=parsePesos(value); if(n<=BigInt(0)) throw 0; return money(n); } catch { throw new Error("INVALID_INPUT"); } }
function exactObject(v: unknown, keys: string[]) { if (!v || typeof v!=="object" || Array.isArray(v) || Object.keys(v).sort().join(",")!==keys.slice().sort().join(",")) throw new Error("INVALID_INPUT"); return v as Record<string,unknown>; }
function saleValues(b: Record<string, unknown>, legacy = false) {
  const text = (value: unknown, max: number) => {
    if (value === null) return null;
    if (typeof value !== "string" || value.includes("\0") || value.trim().length > max) throw new Error("INVALID_INPUT");
    return value.trim() || null;
  };
  const itemName = legacy ? null : text(b.itemName, 160);
  const category = legacy ? null : saleCategories.find(value => value === b.category);
  const description = text(b.description, 160);
  if (legacy ? !description : !itemName || !category) throw new Error("INVALID_INPUT");
  if(!(b.note===null||typeof b.note==="string"&&b.note.length<=500&&!b.note.includes("\0"))||!(b.method==="cash"||b.method==="gcash")||typeof b.receivedAt!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(b.receivedAt)||!Number.isFinite(Date.parse(b.receivedAt))||new Date(b.receivedAt).toISOString()!==b.receivedAt) throw new Error("INVALID_INPUT");
  return { itemName, category, description, note: (b.note as string | null)?.trim() || null, cents: amount(b.amount), method: b.method, receivedAt: b.receivedAt };
}
const saleFields = ["itemName", "category", "description", "note", "amount", "method", "receivedAt"];
export async function createSale(pool: Db, verify: StaffVerifier, body: unknown) {
  const legacy = !!body && typeof body === "object" && !("itemName" in body) && !("category" in body);
  const b = exactObject(body, [...(legacy ? saleFields.slice(2) : saleFields), "idempotencyKey"]);
  if (typeof b.idempotencyKey !== "string" || !/^[\x21-\x7e]{1,200}$/.test(b.idempotencyKey)) throw new Error("INVALID_INPUT");
  const { itemName, category, description, note, cents, method, receivedAt } = saleValues(b, legacy);
  const actor = actorId(await verify());
  const c=await pool.connect(); let committed=false,committing=false; const ownerHash=sha(actor), fingerprint=sha(JSON.stringify({description,note,cents,method,receivedAt,...(legacy ? {} : { itemName, category })}));
  try { await c.query("BEGIN"); await role(c,actor);
    if (!legacy) await c.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'sale.create',$2,$3,NULL) ON CONFLICT DO NOTHING",[ownerHash,b.idempotencyKey,fingerprint]);
    const idem=(await c.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='sale.create' AND key=$2 FOR UPDATE",[ownerHash,b.idempotencyKey])).rows[0];
    // Pre-upgrade requests may replay an already saved sale, but cannot create one.
    if (legacy && !idem?.result) throw new Error("INVALID_INPUT");
    if(!idem||idem.fingerprint!==fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if(idem.result){committing=true;await c.query("COMMIT");committed=true;return idem.result;}
    if(Date.parse(receivedAt)>(await c.query("SELECT clock_timestamp() now")).rows[0].now.getTime()) throw new Error("INVALID_INPUT");
    const id=randomUUID(); await c.query("INSERT INTO ethn.sales(id,description,note,amount,method,received_at,created_by,item_name,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,description,note,cents,method,receivedAt,actor,itemName,category ?? null]);
    await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'sale.create',$2::jsonb)",[actor,JSON.stringify({saleId:id,amount:cents,method,receivedAt})]);
    const result=(await c.query("SELECT id,description,note,amount::text,method,received_at,created_at FROM ethn.sales WHERE id=$1",[id])).rows[0]; const saved={id,description,note,...(legacy ? {} : { itemName, category }),amount:result.amount,method,receivedAt:(result.received_at as Date).toISOString(),createdAt:(result.created_at as Date).toISOString()};
    await c.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='sale.create' AND key=$2 AND fingerprint=$3",[ownerHash,b.idempotencyKey,fingerprint,JSON.stringify(saved)]); committing=true;await c.query("COMMIT");committed=true;return saved;
  } catch(e){if(!committing)try{await c.query("ROLLBACK")}catch{}fail(e)} finally {c.release(!committed)}
}
export async function listSales(pool: Db, verify: StaffVerifier, from: string | null = null, to: string | null = null, { page = 1, limit = 20, method = "", category = "", q = "" } = {}) {
 q = q.trim();
 if (!Number.isInteger(page) || page < 1 || page > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 50 || !["", "cash", "gcash"].includes(method) || (category !== "" && category !== uncategorizedSale && !saleCategories.some(value => value === category)) || q.length > 100 || q.includes("\0")) throw new Error("INVALID_INPUT");
 const actor=actorId(await verify()),c=await pool.connect();
 const source = `FROM ethn.sales s CROSS JOIN LATERAL (
   SELECT s.amount + coalesce(sum(x.amount_delta),0) AS amount,
     CASE WHEN s.amount + coalesce(sum(x.amount_delta),0) = 0 THEN s.method
       WHEN CASE WHEN s.method='cash' THEN s.amount ELSE 0 END + coalesce(sum(x.cash_delta),0) > 0 THEN 'cash'
       ELSE 'gcash' END AS method
   FROM ethn.sale_corrections x WHERE s.revision IS NULL AND x.sale_id=s.id
 ) current_sale`;
 const filter = `s.deleted_at IS NULL AND ($1::date IS NULL OR s.received_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Manila'))
   AND ($2::date IS NULL OR s.received_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila'))
   AND ($3 = '' OR current_sale.method = $3)
   AND ($4 = '' OR strpos(lower(s.description), lower($4)) > 0 OR strpos(lower(s.note), lower($4)) > 0 OR strpos(lower(s.item_name), lower($4)) > 0)
   AND ($5 = '' OR s.category = $5 OR ($5 = 'uncategorized' AND s.category IS NULL))`;
 const params = [from, to, method, q, category];
 try {
   await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
   const r = await c.query("SELECT role FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor]);
   if (!r.rows.length) throw new Error("FORBIDDEN");
   const total = Number((await c.query(`SELECT count(*) ${source} WHERE ${filter}`, params)).rows[0].count);
   const { rows } = await c.query(`SELECT s.id,s.item_name,s.category,s.description,s.note,current_sale.amount::text,current_sale.method,s.received_at,s.created_at,s.created_by,s.revision
    ${source} WHERE ${filter} ORDER BY s.received_at DESC,s.id LIMIT $6 OFFSET $7`, [...params, limit, (page - 1) * limit]);
   await c.query("COMMIT");
   return { page, limit, total, rows: rows.map(x => ({ id:x.id,itemName:x.item_name ?? x.description,category:x.category,description:x.item_name === null ? null : x.description,note:x.note,amount:x.amount,method:x.method,receivedAt:(x.received_at as Date).toISOString(),createdAt:(x.created_at as Date).toISOString(),createdBy:x.created_by,revision:x.revision })) };
 }catch(e){try{await c.query("ROLLBACK")}catch{}fail(e)}finally{c.release()}
}
export async function changeSale(pool: Db, verify: StaffVerifier, id: string, method: "PATCH" | "DELETE", body: unknown) {
  const b = exactObject(body, method === "PATCH" ? [...saleFields, "revision"] : ["revision"]);
  if (!uuid.test(id) || !(b.revision === null || typeof b.revision === "string" && uuid.test(b.revision))) throw new Error("INVALID_INPUT");
  const values = method === "PATCH" ? saleValues(b) : null;
  const actor = actorId(await verify()), c = await pool.connect();
  let committed = false, committing = false;
  try {
    await c.query("BEGIN");
    await role(c, actor);
    const sale = (await c.query("SELECT amount::text, method, received_at, revision, deleted_at FROM ethn.sales WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!sale || sale.deleted_at !== null) throw new Error("SALE_NOT_FOUND");
    if (sale.revision !== b.revision) throw new Error("SALE_STALE");
    if (values) {
      if (Date.parse(values.receivedAt) > (await c.query("SELECT clock_timestamp() AS now")).rows[0].now.getTime()) throw new Error("INVALID_INPUT");
      await c.query(`UPDATE ethn.sales SET item_name=$2, category=$3, description=$4, note=$5, amount=$6, method=$7, received_at=$8, revision=$9 WHERE id=$1`,
        [id, values.itemName, values.category, values.description, values.note, values.cents, values.method, values.receivedAt, randomUUID()]);
    } else {
      await c.query("UPDATE ethn.sales SET deleted_at=clock_timestamp() WHERE id=$1", [id]);
    }
    await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,$2,$3::jsonb)", [actor, values ? "sale.edit" : "sale.delete", JSON.stringify({ saleId: id, previous: sale, ...(values && { amount: values.cents, method: values.method, receivedAt: values.receivedAt }) })]);
    committing = true;
    await c.query("COMMIT");
    committed = true;
    return { id };
  } catch (error) {
    if (!committing) try { await c.query("ROLLBACK"); } catch {}
    fail(error);
  } finally { c.release(!committed); }
}
