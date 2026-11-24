import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { manilaDateStr, manilaWallClock } from "../booking/slots";
import type { StaffVerifier } from "./ethn-payments";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categories = ["Other", "Utilities", "Maintenance", "Supplies", "Staff"] as const;
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(manilaWallClock(s).getTime()) && manilaDateStr(manilaWallClock(s)) === s;
const peso = (v: bigint) => { const amount = v < BigInt(0) ? -v : v; return `${v < BigInt(0) ? "-" : ""}${amount / BigInt(100)}.${(amount % BigInt(100)).toString().padStart(2, "0")}`; };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function actorId(v: string | null) { if (!v || !uuid.test(v)) throw new Error("UNAUTHENTICATED"); return v.toLowerCase(); }
function range(from: string | null, to: string | null, today: string) {
  if ((from === null) !== (to === null)) throw new Error("INVALID_INPUT");
  const a = from ?? `${today.slice(0, 8)}01`, b = to ?? today;
  if (!validDate(a) || !validDate(b) || a > b || b > today || (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000 >= 366) throw new Error("INVALID_INPUT");
  return [a, b] as const;
}
async function owner(pool: Db, actor: string) {
  const c = await pool.connect();
  try { if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor])).rows.length) throw new Error("FORBIDDEN"); }
  finally { c.release(); }
}
export async function getFinance(pool: Db, verify: StaffVerifier, from: string | null, to: string | null) {
  const actor = actorId(await verify()); await owner(pool, actor);
  const c = await pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor])).rows.length) throw new Error("FORBIDDEN");
    const now = (await c.query("SELECT transaction_timestamp() AS now")).rows[0].now as Date;
    const today = manilaDateStr(now), [a,b] = range(from,to,today);
    const { rows } = await c.query(`WITH days AS (SELECT d::date AS day FROM generate_series($1::date,$2::date,interval '1 day') d),
      collections AS (SELECT (coalesce(p.received_at,p.verified_at) AT TIME ZONE 'Asia/Manila')::date AS day,
        sum(p.collected_amount) FILTER (WHERE p.method='cash') cash,
        sum(p.collected_amount) FILTER (WHERE p.method='gcash') gcash,
        sum(p.collected_amount) FILTER (WHERE p.method NOT IN ('cash','gcash')) other
        FROM ethn.payments p WHERE p.status='accepted' AND coalesce(p.received_at,p.verified_at) >= ($1::date::timestamp AT TIME ZONE 'Asia/Manila') AND coalesce(p.received_at,p.verified_at) < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') GROUP BY 1),
      refunds AS (SELECT (recorded_at AT TIME ZONE 'Asia/Manila')::date AS day,sum(amount) AS amount FROM ethn.booking_refunds WHERE recorded_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Manila') AND recorded_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila') GROUP BY 1),
      sales_ledger AS (SELECT (received_at AT TIME ZONE 'Asia/Manila')::date AS day, CASE WHEN method='cash' THEN amount ELSE 0 END cash,CASE WHEN method='gcash' THEN amount ELSE 0 END gcash FROM ethn.sales UNION ALL SELECT (created_at AT TIME ZONE 'Asia/Manila')::date,cash_delta,gcash_delta FROM ethn.sale_corrections),
      sales_totals AS (SELECT day,sum(cash) cash,sum(gcash) gcash FROM sales_ledger WHERE day BETWEEN $1 AND $2 GROUP BY day),
      expense_ledger AS (SELECT paid_date AS day,amount FROM ethn.expenses UNION ALL SELECT correction_date,amount_delta FROM ethn.expense_corrections),
      costs AS (SELECT day,sum(amount) expenses FROM expense_ledger WHERE day BETWEEN $1 AND $2 GROUP BY day)
      SELECT days.day::text date,coalesce(collections.cash,0)::numeric(30,2)::text bookingCash,coalesce(collections.gcash,0)::numeric(30,2)::text bookingGCash,coalesce(sales_totals.cash,0)::numeric(30,2)::text salesCash,coalesce(sales_totals.gcash,0)::numeric(30,2)::text salesGCash,(coalesce(collections.cash,0)+coalesce(sales_totals.cash,0))::numeric(30,2)::text cash,(coalesce(collections.gcash,0)+coalesce(sales_totals.gcash,0))::numeric(30,2)::text gcash,
        coalesce(collections.other,0)::numeric(30,2)::text other,coalesce(refunds.amount,0)::numeric(30,2)::text refunds,
        ((coalesce(collections.cash,0)+coalesce(sales_totals.cash,0))+(coalesce(collections.gcash,0)+coalesce(sales_totals.gcash,0))+coalesce(collections.other,0))::numeric(30,2)::text collected,coalesce(costs.expenses,0)::numeric(30,2)::text expenses
      FROM days LEFT JOIN collections USING(day) LEFT JOIN sales_totals USING(day) LEFT JOIN costs USING(day) LEFT JOIN refunds USING(day) ORDER BY days.day`, [a,b]);
    const sum = (field: string) => rows.reduce<bigint>((n, r) => n + BigInt(String(r[field]).replace(".", "")), BigInt(0));
    const cash=sum("cash"),gcash=sum("gcash"),other=sum('other'),refunds=sum('refunds'),expenses=sum("expenses"),collected=cash+gcash+other;
    const components={bookingAndExtensionCollections:peso(sum('bookingcash')+sum('bookinggcash')+other),manualSalesAfterCorrections:peso(sum('salescash')+sum('salesgcash'))};
    await c.query("COMMIT");
    return { from:a,to:b,components,scope:"Gross accepted collections include all payment methods. Reporting uses actual receipt time when recorded, otherwise verification time; fallback is not an actual receipt timestamp. Net subtracts recorded external refunds and expenses. Archive does not change totals.",totals:{cash:peso(cash),gcash:peso(gcash),other:peso(other),refunds:peso(refunds),collected:peso(collected),expenses:peso(expenses),net:peso(collected-refunds-expenses)},daily:rows.map((r: Record<string, unknown>)=>({date:r.date,cash:r.cash,gcash:r.gcash,other:r.other,refunds:r.refunds,collected:r.collected,expenses:r.expenses,net:peso(BigInt(String(r.collected).replace(".",""))-BigInt(String(r.refunds).replace(".",""))-BigInt(String(r.expenses).replace(".","")))})) };
  } catch(e) { try { await c.query("ROLLBACK"); } catch {} throw e; }
  finally { c.release(); }
}
export async function listExpenses(pool: Db, verify: StaffVerifier, from: string | null, to: string | null, page: number, limit: number) {
  const actor=actorId(await verify()); await owner(pool,actor); if(!Number.isInteger(page)||page<1||page>1000||!Number.isInteger(limit)||limit<1||limit>50) throw new Error("INVALID_INPUT");
  const c=await pool.connect();
  try { await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); if(!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'",[actor])).rows.length) throw new Error("FORBIDDEN"); const now=(await c.query("SELECT transaction_timestamp() now")).rows[0].now as Date,[a,b]=range(from,to,manilaDateStr(now)); const total=Number((await c.query("SELECT count(*)::int n FROM ethn.expenses WHERE paid_date BETWEEN $1 AND $2",[a,b])).rows[0].n); const rows=(await c.query("SELECT id,title,category,amount::text,paid_date::text,created_at,(SELECT c.id FROM ethn.expense_corrections c WHERE c.expense_id=ethn.expenses.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1) AS last_correction_id,(amount+COALESCE((SELECT sum(c.amount_delta) FROM ethn.expense_corrections c WHERE c.expense_id=ethn.expenses.id),0))::numeric(30,2)::text AS effective_amount FROM ethn.expenses WHERE paid_date BETWEEN $1 AND $2 ORDER BY paid_date DESC,created_at DESC,id DESC LIMIT $3 OFFSET $4",[a,b,limit,(page-1)*limit])).rows; await c.query("COMMIT"); return {from:a,to:b,page,limit,total,rows:rows.map(r=>({id:r.id,title:r.title,category:r.category,amount:r.amount,effectiveAmount:r.effective_amount,lastCorrectionId:r.last_correction_id,paidDate:r.paid_date,createdAt:(r.created_at as Date).toISOString()}))}; }
  catch(e){try{await c.query("ROLLBACK")}catch{}throw e} finally{c.release()}
}
export async function addExpense(pool: Db, verify: StaffVerifier, body: unknown) {
  if(!body||typeof body!=="object"||Array.isArray(body)) throw new Error("INVALID_INPUT"); const b=body as Record<string,unknown>,keys=["title","category","amount","paidDate","idempotencyKey"]; if(Object.keys(b).length!==keys.length||Object.keys(b).some(k=>!keys.includes(k))) throw new Error("INVALID_INPUT");
  if(typeof b.title!=="string"||!b.title.trim()||b.title.trim().length>100||typeof b.category!=="string"||!(categories as readonly string[]).includes(b.category)||typeof b.amount!=="string"||!/^\d{1,10}(?:\.\d{1,2})?$/.test(b.amount)||typeof b.paidDate!=="string"||!validDate(b.paidDate)||typeof b.idempotencyKey!=="string"||! /^[\x21-\x7e]{1,200}$/.test(b.idempotencyKey)) throw new Error("INVALID_INPUT");
  const [whole, fraction = ""] = b.amount.split("."), cents=BigInt(whole+fraction.padEnd(2,"0")); if(cents<=BigInt(0)) throw new Error("INVALID_INPUT"); const amount=peso(cents), title=b.title.trim(),category=b.category,paidDate=b.paidDate,actor=actorId(await verify()); await owner(pool,actor);
  const c=await pool.connect(),ownerHash=hash(actor),fingerprint=hash(JSON.stringify({title,category,amount,paidDate})); let commit=false,discard=false;
  try { await c.query("BEGIN"); if(!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor])).rows.length) throw new Error("FORBIDDEN"); await c.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'expense.create',$2,$3,NULL) ON CONFLICT DO NOTHING",[ownerHash,b.idempotencyKey,fingerprint]); const idem=(await c.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='expense.create' AND key=$2 FOR UPDATE",[ownerHash,b.idempotencyKey])).rows[0]; if(!idem||idem.fingerprint!==fingerprint) throw new Error("IDEMPOTENCY_MISMATCH"); if(idem.result){commit=true;await c.query("COMMIT");return idem.result;} const now=(await c.query("SELECT clock_timestamp() AS now")).rows[0].now as Date; if(paidDate>manilaDateStr(now)) throw new Error("INVALID_INPUT"); const id=randomUUID(); const saved:{id:string;title:string;category:string;amount:string;paidDate:string;createdAt:string|null}={id,title,category,amount,paidDate,createdAt:null}; await c.query("INSERT INTO ethn.expenses(id,title,category,amount,paid_date,created_by) VALUES($1,$2,$3,$4,$5,$6)",[id,title,category,amount,paidDate,actor]); await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'expense.create',$2::jsonb)",[actor,JSON.stringify({expenseId:id,category,amount})]); const result=(await c.query("SELECT created_at FROM ethn.expenses WHERE id=$1",[id])).rows[0]; saved.createdAt=(result.created_at as Date).toISOString(); await c.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='expense.create' AND key=$2 AND fingerprint=$3",[ownerHash,b.idempotencyKey,fingerprint,JSON.stringify(saved)]); commit=true; await c.query("COMMIT"); return saved; }
  catch(e){if(commit)discard=true;else try{await c.query("ROLLBACK")}catch{discard=true;} if(e instanceof Error&&/^(FORBIDDEN|IDEMPOTENCY_MISMATCH|INVALID_INPUT)$/.test(e.message))throw e; throw new Error("FINANCE_UNAVAILABLE");} finally{c.release(discard)}
}
