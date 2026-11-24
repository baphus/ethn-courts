import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { manilaDateStr, manilaWallClock } from "../booking/slots";
import { addDaysManilaStr } from "../courts";
import type { StaffVerifier } from "./ethn-payments";
import { expenseCategories as categories, newExpenseCategories } from "./finance-filters";

type Db = Pick<Pool, "connect">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
      expense_ledger AS (SELECT paid_date AS day,amount FROM ethn.expenses UNION ALL SELECT x.correction_date,x.amount_delta FROM ethn.expense_corrections x JOIN ethn.expenses e ON e.id=x.expense_id WHERE e.revision IS NULL),
      costs AS (SELECT day,sum(amount) expenses FROM expense_ledger WHERE day BETWEEN $1 AND $2 GROUP BY day)
      SELECT days.day::text date,coalesce(collections.cash,0)::numeric(30,2)::text bookingCash,coalesce(collections.gcash,0)::numeric(30,2)::text bookingGCash,coalesce(sales_totals.cash,0)::numeric(30,2)::text salesCash,coalesce(sales_totals.gcash,0)::numeric(30,2)::text salesGCash,(coalesce(collections.cash,0)+coalesce(sales_totals.cash,0))::numeric(30,2)::text cash,(coalesce(collections.gcash,0)+coalesce(sales_totals.gcash,0))::numeric(30,2)::text gcash,
        coalesce(collections.other,0)::numeric(30,2)::text other,coalesce(refunds.amount,0)::numeric(30,2)::text refunds,
        ((coalesce(collections.cash,0)+coalesce(sales_totals.cash,0))+(coalesce(collections.gcash,0)+coalesce(sales_totals.gcash,0))+coalesce(collections.other,0))::numeric(30,2)::text collected,coalesce(costs.expenses,0)::numeric(30,2)::text expenses
      FROM days LEFT JOIN collections USING(day) LEFT JOIN sales_totals USING(day) LEFT JOIN costs USING(day) LEFT JOIN refunds USING(day) ORDER BY days.day`, [a,b]);
    const sum = (field: string) => rows.reduce<bigint>((n, r) => n + BigInt(String(r[field]).replace(".", "")), BigInt(0));
    const cash=sum("cash"),gcash=sum("gcash"),other=sum('other'),refunds=sum('refunds'),expenses=sum("expenses"),collected=cash+gcash+other;
    const components={bookingAndExtensionCollections:peso(sum('bookingcash')+sum('bookinggcash')+other),manualSalesAfterCorrections:peso(sum('salescash')+sum('salesgcash'))};
    await c.query("COMMIT");
    return { from:a,to:b,components,scope:"Gross accepted collections include all payment methods. Reporting uses actual receipt time when recorded, otherwise verification time; fallback is not an actual receipt timestamp. Net subtracts recorded external refunds and expenses. Archive does not change totals.",totals:{cash:peso(cash),gcash:peso(gcash),other:peso(other),refunds:peso(refunds),collected:peso(collected),expenses:peso(expenses),net:peso(collected-refunds-expenses)},daily:rows.map((r: Record<string, unknown>)=>({date:r.date,bookingPayments:peso(BigInt(String(r.bookingcash).replace(".", ""))+BigInt(String(r.bookinggcash).replace(".", ""))+BigInt(String(r.other).replace(".", ""))),otherSales:peso(BigInt(String(r.salescash).replace(".", ""))+BigInt(String(r.salesgcash).replace(".", ""))),cash:r.cash,gcash:r.gcash,other:r.other,refunds:r.refunds,collected:r.collected,expenses:r.expenses,net:peso(BigInt(String(r.collected).replace(".",""))-BigInt(String(r.refunds).replace(".",""))-BigInt(String(r.expenses).replace(".","")))})) };
  } catch(e) { try { await c.query("ROLLBACK"); } catch {} throw e; }
  finally { c.release(); }
}
const approvedBookingSource = `FROM ethn.payments p JOIN ethn.bookings b ON b.id=p.booking_id
        WHERE p.status='accepted' AND p.extension_id IS NULL AND b.status IN ('confirmed','completed')
          AND p.verified_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Manila')
          AND p.verified_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila')`;

export async function getApprovalFinance(pool: Db, verify: StaffVerifier, from: string | null, to: string | null) {
  const actor = actorId(await verify());
  const c = await pool.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [actor])).rows.length) throw new Error("FORBIDDEN");
    const today = manilaDateStr((await c.query("SELECT transaction_timestamp() AS now")).rows[0].now);
    const [a, b] = from === null && to === null ? [addDaysManilaStr(today, -29), today] : range(from, to, today);
    const { rows } = await c.query(`WITH days AS (SELECT d::date AS day FROM generate_series($1::date,$2::date,interval '1 day') d),
      revenue AS (
        SELECT (p.verified_at AT TIME ZONE 'Asia/Manila')::date AS day, sum(b.total) AS amount, count(*)::int AS bookings
        ${approvedBookingSource}
        GROUP BY 1
      ), costs AS (
        SELECT e.paid_date AS day, sum(e.amount + coalesce((SELECT sum(x.amount_delta) FROM ethn.expense_corrections x WHERE x.expense_id=e.id AND e.revision IS NULL),0)) AS amount
        FROM ethn.expenses e WHERE e.paid_date BETWEEN $1 AND $2 GROUP BY 1
      )
      SELECT days.day::text AS date, (coalesce(revenue.amount,0)*100)::numeric(30,0)::text AS revenue,
        (coalesce(costs.amount,0)*100)::numeric(30,0)::text AS expenses, coalesce(revenue.bookings,0) AS bookings
      FROM days LEFT JOIN revenue USING(day) LEFT JOIN costs USING(day) ORDER BY days.day`, [a,b]);
    const checked = (value: bigint) => {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) throw new Error("FINANCE_UNAVAILABLE");
      return n;
    };
    let revenue = BigInt(0), expenses = BigInt(0), bookings = 0;
    const days = rows.map(row => {
      const r = BigInt(row.revenue), e = BigInt(row.expenses);
      revenue += r; expenses += e; bookings += row.bookings;
      return { date: row.date as string, revenueCents: checked(r), expenseCents: checked(e), profitCents: checked(r-e), bookings: row.bookings as number };
    });
    const report = { from: a, to: b, days, revenueCents: checked(revenue), expenseCents: checked(expenses), profitCents: checked(revenue-expenses), bookings, profitMargin: revenue ? Number(revenue-expenses)/Number(revenue)*100 : null, averageRevenueCents: bookings ? Math.round(Number(revenue)/bookings) : null };
    await c.query("COMMIT");
    return report;
  } catch (error) { try { await c.query("ROLLBACK"); } catch {} throw error; }
  finally { c.release(); }
}

const expenseFilter = "paid_date BETWEEN $1 AND $2 AND ($3 = '' OR category = $3) AND ($4 = '' OR strpos(lower(title), lower($4)) > 0)";

export async function listExpenses(pool: Db, verify: StaffVerifier, from: string | null, to: string | null, page: number, limit: number, category = "", q = "") {
  q = q.trim();
  if (q.length > 100 || q.includes("\0") || (category && !categories.some(value => value === category))) throw new Error("INVALID_INPUT");

  const actor=actorId(await verify()); await owner(pool,actor); if(!Number.isInteger(page)||page<1||page>1000||!Number.isInteger(limit)||limit<1||limit>50) throw new Error("INVALID_INPUT");
  const c=await pool.connect();
  try { await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); if(!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'",[actor])).rows.length) throw new Error("FORBIDDEN"); const now=(await c.query("SELECT transaction_timestamp() now")).rows[0].now as Date,[a,b]=range(from,to,manilaDateStr(now)); const total=Number((await c.query(`SELECT count(*)::int n FROM ethn.expenses WHERE ${expenseFilter}`,[a,b,category,q])).rows[0].n); const rows=(await c.query(`SELECT id,title,category,amount::text,paid_date::text,created_at,description,vendor,notes,revision,(SELECT c.id FROM ethn.expense_corrections c WHERE c.expense_id=ethn.expenses.id ORDER BY c.created_at DESC,c.id DESC LIMIT 1) AS last_correction_id,(amount+COALESCE((SELECT sum(c.amount_delta) FROM ethn.expense_corrections c WHERE c.expense_id=ethn.expenses.id AND ethn.expenses.revision IS NULL),0))::numeric(30,2)::text AS effective_amount FROM ethn.expenses WHERE ${expenseFilter} ORDER BY paid_date DESC,created_at DESC,id DESC LIMIT $5 OFFSET $6`,[a,b,category,q,limit,(page-1)*limit])).rows; await c.query("COMMIT"); return {from:a,to:b,page,limit,total,rows:rows.map(r=>({id:r.id,title:r.title,category:r.category,amount:r.amount,effectiveAmount:r.effective_amount,lastCorrectionId:r.last_correction_id,revision:r.revision,description:r.description,vendor:r.vendor,notes:r.notes,paidDate:r.paid_date,createdAt:(r.created_at as Date).toISOString()}))}; }
  catch(e){try{await c.query("ROLLBACK")}catch{}throw e} finally{c.release()}
}
export async function addExpense(pool: Db, verify: StaffVerifier, body: unknown) {
  if(!body||typeof body!=="object"||Array.isArray(body)) throw new Error("INVALID_INPUT"); const b=body as Record<string,unknown>,keys=["title","category","amount","paidDate","idempotencyKey","description","vendor","notes"]; if(Object.keys(b).some(k=>!keys.includes(k))) throw new Error("INVALID_INPUT");
  if(typeof b.title!=="string"||!b.title.trim()||b.title.trim().length>100||typeof b.category!=="string"||!(newExpenseCategories as readonly string[]).includes(b.category)||typeof b.amount!=="string"||!/^\d{1,10}(?:\.\d{1,2})?$/.test(b.amount)||typeof b.paidDate!=="string"||!validDate(b.paidDate)||typeof b.idempotencyKey!=="string"||! /^[\x21-\x7e]{1,200}$/.test(b.idempotencyKey)) throw new Error("INVALID_INPUT");
  const [description,vendor,notes]=expenseMetadata(b);
  const [whole, fraction = ""] = b.amount.split("."), cents=BigInt(whole+fraction.padEnd(2,"0")); if(cents<=BigInt(0)) throw new Error("INVALID_INPUT"); const amount=peso(cents), title=b.title.trim(),category=b.category,paidDate=b.paidDate,actor=actorId(await verify()); await owner(pool,actor);
  const c=await pool.connect(),ownerHash=hash(actor),fingerprint=hash(JSON.stringify({title,category,amount,paidDate,...(description||vendor||notes ? {description,vendor,notes} : {})})); let commit=false,discard=false;
  try { await c.query("BEGIN"); if(!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor])).rows.length) throw new Error("FORBIDDEN"); await c.query("INSERT INTO ethn.idempotency(owner_hash,operation,key,fingerprint,result) VALUES($1,'expense.create',$2,$3,NULL) ON CONFLICT DO NOTHING",[ownerHash,b.idempotencyKey,fingerprint]); const idem=(await c.query("SELECT fingerprint,result FROM ethn.idempotency WHERE owner_hash=$1 AND operation='expense.create' AND key=$2 FOR UPDATE",[ownerHash,b.idempotencyKey])).rows[0]; if(!idem||idem.fingerprint!==fingerprint) throw new Error("IDEMPOTENCY_MISMATCH"); if(idem.result){commit=true;await c.query("COMMIT");return idem.result;} const now=(await c.query("SELECT clock_timestamp() AS now")).rows[0].now as Date; if(paidDate>manilaDateStr(now)) throw new Error("INVALID_INPUT"); const id=randomUUID(); const saved:{id:string;title:string;category:string;amount:string;paidDate:string;createdAt:string|null}={id,title,category,amount,paidDate,createdAt:null}; await c.query("INSERT INTO ethn.expenses(id,title,category,amount,paid_date,created_by,description,vendor,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,title,category,amount,paidDate,actor,description,vendor,notes]); await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'expense.create',$2::jsonb)",[actor,JSON.stringify({expenseId:id,category,amount})]); const result=(await c.query("SELECT created_at FROM ethn.expenses WHERE id=$1",[id])).rows[0]; saved.createdAt=(result.created_at as Date).toISOString(); await c.query("UPDATE ethn.idempotency SET result=$4::jsonb WHERE owner_hash=$1 AND operation='expense.create' AND key=$2 AND fingerprint=$3",[ownerHash,b.idempotencyKey,fingerprint,JSON.stringify(saved)]); commit=true; await c.query("COMMIT"); return saved; }
  catch(e){if(commit)discard=true;else try{await c.query("ROLLBACK")}catch{discard=true;} if(e instanceof Error&&/^(FORBIDDEN|IDEMPOTENCY_MISMATCH|INVALID_INPUT)$/.test(e.message))throw e; throw new Error("FINANCE_UNAVAILABLE");} finally{c.release(discard)}
}

function expenseMetadata(body: Record<string, unknown>) {
  return ([['description', 2000], ['vendor', 160], ['notes', 2000]] as const).map(([key, max]) => {
    const value = body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error('INVALID_INPUT');
    return value.trim() || null;
  });
}

export async function changeExpense(pool: Db, verify: StaffVerifier, id: string, operation: 'edit' | 'delete', body: unknown) {
  if (!uuid.test(id) || !body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_INPUT');
  const b = body as Record<string, unknown>;
  const keys = operation === 'edit' ? ['revision','lastCorrectionId','title','category','amount','paidDate','description','vendor','notes'] : ['revision','lastCorrectionId'];
  if (Object.keys(b).some(key => !keys.includes(key)) || ![b.revision,b.lastCorrectionId].every(value => value === null || typeof value === 'string' && uuid.test(value))) throw new Error('INVALID_INPUT');
  const actor = actorId(await verify());
  const c = await pool.connect();
  let discard = false;
  try {
    await c.query('BEGIN');
    if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE",[actor])).rowCount) throw new Error('FORBIDDEN');
    const old = (await c.query('SELECT category,amount::text,paid_date::text,revision FROM ethn.expenses WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if (!old) throw new Error('EXPENSE_NOT_FOUND');
    const correction = (await c.query('SELECT id FROM ethn.expense_corrections WHERE expense_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[id])).rows[0]?.id ?? null;
    if (old.revision !== b.revision || correction !== b.lastCorrectionId) throw new Error('STALE_CORRECTION');
    if (operation === 'edit') {
      if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 100 || b.title.includes('\0') || typeof b.category !== 'string' || (b.category !== old.category && !newExpenseCategories.some(category => category === b.category)) || typeof b.amount !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(b.amount) || typeof b.paidDate !== 'string' || !validDate(b.paidDate)) throw new Error('INVALID_INPUT');
      const today = manilaDateStr((await c.query('SELECT clock_timestamp() AS now')).rows[0].now);
      if (b.paidDate > today) throw new Error('INVALID_INPUT');
      await c.query('UPDATE ethn.expenses SET title=$2,category=$3,amount=$4,paid_date=$5,description=$6,vendor=$7,notes=$8,revision=$9 WHERE id=$1',[id,b.title.trim(),b.category,b.amount,b.paidDate,...expenseMetadata(b),randomUUID()]);
    } else {
      await c.query('DELETE FROM ethn.expenses WHERE id=$1',[id]);
    }
    await c.query('INSERT INTO ethn.audit(actor,action,detail) VALUES($1,$2,$3::jsonb)',[actor,`expense.${operation}`,JSON.stringify({ expenseId:id, previous:old, lastCorrectionId:correction, ...(operation==='edit'?{ amount:b.amount,category:b.category,paidDate:b.paidDate }:{}) })]);
    await c.query('COMMIT');
    return { id };
  } catch (error) {
    try { await c.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { c.release(discard); }
}

export async function getFinanceExport(pool: Db, verify: StaffVerifier, from: string | null, to: string | null, category: string, q: string) {
  const actor = actorId(await verify());
  q = q.trim();
  if (!from || !to || q.length > 100 || q.includes('\0') || (category && !categories.some(value => value === category))) throw new Error('INVALID_INPUT');
  const c = await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (!(await c.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'",[actor])).rowCount) throw new Error('FORBIDDEN');
    const today = manilaDateStr((await c.query('SELECT transaction_timestamp() AS now')).rows[0].now);
    const [a,b] = range(from,to,today);
    const bookings = (await c.query(`SELECT (p.verified_at AT TIME ZONE 'Asia/Manila')::date::text AS approved,
      coalesce(b.guest_name,'') AS customer,coalesce(b.guest_email,'') AS email,b.operating_date::text AS "playDate",b.total::text AS amount,
      coalesce((SELECT string_agg(k.name,', ' ORDER BY i.starts_at,i.id) FROM ethn.booking_items i JOIN ethn.courts k ON k.id=i.court_id WHERE i.booking_id=b.id),'') AS courts,
      coalesce((SELECT string_agg(to_char(i.starts_at AT TIME ZONE 'Asia/Manila','HH24:MI') || '–' || to_char(i.ends_at AT TIME ZONE 'Asia/Manila','HH24:MI'),', ' ORDER BY i.starts_at,i.id) FROM ethn.booking_items i WHERE i.booking_id=b.id),'') AS slots
      ${approvedBookingSource} ORDER BY p.verified_at,b.id LIMIT 50001`,[a,b])).rows;
    const expenses = (await c.query(`SELECT title,category,paid_date::text AS "paidDate",
      (amount+coalesce((SELECT sum(x.amount_delta) FROM ethn.expense_corrections x WHERE x.expense_id=e.id AND e.revision IS NULL),0))::numeric(30,2)::text AS amount
      FROM ethn.expenses e WHERE ${expenseFilter} ORDER BY paid_date DESC,created_at DESC,id DESC LIMIT 50001`,[a,b,category,q])).rows;
    if (bookings.length > 50000 || expenses.length > 50000) throw new Error('INVALID_INPUT');
    const cents = (amount: string) => {
      const value = Number(amount.replace('.',''));
      if (!Number.isSafeInteger(value)) throw new Error('FINANCE_UNAVAILABLE');
      return value;
    };
    await c.query('COMMIT');
    return {
      from:a,to:b,generated:today,
      bookings: bookings.map(({amount,...row}) => ({ ...row, approved: String(row.approved), customer: String(row.customer), email: String(row.email), courts: String(row.courts), slots: String(row.slots), playDate: String(row.playDate), courtCents: cents(amount), rentalCents:0,totalCents:cents(amount) })),
      expenses: expenses.map(row => ({ title:String(row.title),category:String(row.category),paidDate:String(row.paidDate),amountCentavos:cents(row.amount) })),
    };
  } catch (error) { try { await c.query('ROLLBACK'); } catch {} throw error; }
  finally { c.release(); }
}
