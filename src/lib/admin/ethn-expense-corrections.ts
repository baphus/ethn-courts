import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { manilaDateStr, manilaWallClock } from "../booking/slots";
import type { StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const discarded = new WeakSet<object>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateOK = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(manilaWallClock(s).getTime()) && manilaDateStr(manilaWallClock(s)) === s;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const actorId = (v: string | null) => { if (!v || !uuid.test(v)) throw new Error("UNAUTHENTICATED"); return v.toLowerCase(); };
const money = (v: bigint) => { const n = v < BigInt(0) ? -v : v; return `${v < BigInt(0) ? "-" : ""}${n / BigInt(100)}.${(n % BigInt(100)).toString().padStart(2, "0")}`; };
const cents = (s: string) => { const [a,b=""]=s.replace(/^-/,"").split("."); const n=BigInt(a!+b.padEnd(2,"0")); return s.startsWith("-")?-n:n; };
async function begin(pool: Db, verify: StaffVerifier) {
  const actor=actorId(await verify()), c=await pool.connect();
  try { await c.query("BEGIN"); if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor])).rows.length) throw new Error("FORBIDDEN"); return {actor,c}; }
  catch(e) { try { await c.query("ROLLBACK"); } catch {} c.release(); throw e; }
}
export async function listExpenseCorrections(pool: Db, verify: StaffVerifier, expenseId: string) {
  if (!uuid.test(expenseId)) throw new Error("INVALID_INPUT");
  const {actor,c}=await begin(pool,verify);
  try { const rows=(await c.query("SELECT c.id,c.previous_correction_id,c.amount_delta::text,c.correction_date::text,c.reason,c.created_by,c.created_at FROM ethn.expense_corrections c JOIN ethn.expenses e ON e.id=c.expense_id WHERE e.id=$1 ORDER BY c.created_at,c.id LIMIT 100",[expenseId])).rows; await c.query("COMMIT"); return rows.map(r=>({id:r.id,previousCorrectionId:r.previous_correction_id,amountDelta:r.amount_delta,correctionDate:r.correction_date,reason:r.reason,createdBy:r.created_by,createdAt:(r.created_at as Date).toISOString()})); }
  catch(e){try{await c.query("ROLLBACK")}catch{discarded.add(c)}throw e}finally{c.release(discarded.has(c))}
}
export async function correctExpense(pool: Db, verify: StaffVerifier, expenseId: string, body: unknown) {
  if (!uuid.test(expenseId)||!body||typeof body!=="object"||Array.isArray(body)) throw new Error("INVALID_INPUT");
  const b=body as Record<string,unknown>, keys=["amountDelta","reason","correctionDate","expectedPreviousCorrectionId","idempotencyKey"];
  if(Object.keys(b).length!==keys.length||Object.keys(b).some(k=>!keys.includes(k))||typeof b.amountDelta!=="string"||! /^-?\d{1,10}(?:\.\d{1,2})?$/.test(b.amountDelta)||typeof b.reason!=="string"||!b.reason.trim()||b.reason.trim().length>500||typeof b.correctionDate!=="string"||!dateOK(b.correctionDate)||!(b.expectedPreviousCorrectionId===null||typeof b.expectedPreviousCorrectionId==="string"&&uuid.test(b.expectedPreviousCorrectionId))||typeof b.idempotencyKey!=="string"||! /^[\x21-\x7e]{1,200}$/.test(b.idempotencyKey)) throw new Error("INVALID_INPUT");
  const delta=cents(b.amountDelta), reason=b.reason.trim(); if(delta===BigInt(0)||delta>BigInt("999999999999")||delta< -BigInt("999999999999")) throw new Error("INVALID_INPUT");
  const normalized={expenseId,amountDelta:money(delta),reason,correctionDate:b.correctionDate,expectedPreviousCorrectionId:b.expectedPreviousCorrectionId};
  const {actor,c}=await begin(pool,verify), oh=hash(actor), fingerprint=hash(JSON.stringify(normalized)); let committed=false, finishing=false;
  try {
    const idem=await c.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'expense.correct',$2,$3,NULL) ON CONFLICT DO NOTHING",[oh,b.idempotencyKey,fingerprint]);
    const saved=(await c.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='expense.correct' AND key=$2 FOR UPDATE",[oh,b.idempotencyKey])).rows[0];
    if(!saved||saved.fingerprint!==fingerprint) throw new Error("IDEMPOTENCY_MISMATCH");
    if(saved.result){const result=saved.result;finishing=true;await c.query("COMMIT");committed=true;return result;}
    const expense=(await c.query("SELECT amount::text FROM ethn.expenses WHERE id=$1 AND revision IS NULL FOR UPDATE",[expenseId])).rows[0]; if(!expense) throw new Error("EXPENSE_NOT_FOUND");
    const now=(await c.query("SELECT clock_timestamp() now")).rows[0].now as Date; if(b.correctionDate!==manilaDateStr(now)) throw new Error("INVALID_INPUT");
    const prior=(await c.query("SELECT id FROM ethn.expense_corrections WHERE expense_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[expenseId])).rows[0]?.id??null;
    if(prior!==(b.expectedPreviousCorrectionId as string|null)) throw new Error("STALE_CORRECTION");
    const sum=(await c.query("SELECT coalesce(sum(amount_delta),0)::numeric(30,2)::text total FROM ethn.expense_corrections WHERE expense_id=$1",[expenseId])).rows[0].total as string;
    const effective=cents(String(expense.amount))+cents(sum)+delta; if(effective<BigInt(0)||effective>BigInt("999999999999")) throw new Error("INVALID_INPUT");
    const id=randomUUID(); await c.query("INSERT INTO ethn.expense_corrections(id,expense_id,previous_correction_id,amount_delta,correction_date,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,expenseId,prior,money(delta),b.correctionDate,reason,actor]);
    await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'expense.correct',$2::jsonb)",[actor,JSON.stringify({expenseId,correctionId:id,amountDelta:money(delta),correctionDate:b.correctionDate})]);
    const result={id,expenseId,previousCorrectionId:prior,amountDelta:money(delta),reason,createdBy:actor,createdAt:(await c.query("SELECT created_at FROM ethn.expense_corrections WHERE id=$1",[id])).rows[0].created_at.toISOString()};
    await c.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='expense.correct' AND key=$2 AND fingerprint=$3",[oh,b.idempotencyKey,fingerprint,JSON.stringify(result)]);
    const completed=result;finishing=true; await c.query("COMMIT");committed=true; return completed;
  } catch(e){if(!committed)try{await c.query("ROLLBACK")}catch{discarded.add(c)} if(e instanceof Error&&/^(FORBIDDEN|INVALID_INPUT|IDEMPOTENCY_MISMATCH|STALE_CORRECTION|EXPENSE_NOT_FOUND)$/.test(e.message))throw e;if(e instanceof Error&&e.message==="FINANCE_UNAVAILABLE") throw e; throw new Error(e instanceof Error?`FINANCE_UNAVAILABLE: ${e.message}`:"FINANCE_UNAVAILABLE")}finally{c.release(committed||finishing||discarded.has(c))}
}
