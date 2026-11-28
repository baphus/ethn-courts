import type { Pool } from "pg";
import { manilaDateStr, manilaWallClock } from "@/lib/booking/slots";
import type { StaffVerifier } from "./ethn-payments";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = ["checkout", "booking.submit", "proof.reserve", "payment.approve", "payment.reject", "exception.review", "hours.update", "settings.update", "calendar.block.create", "calendar.block.release", "walkin.create", "staff.update", "walkin.hold", "sale.create", "sale.correct", "sale.edit", "sale.delete", "expense.create", "expense.correct", "expense.edit", "expense.delete", "owner.cutover", "open_play.create", "open_play.update", "open_play.remove", "extension.hold", "extension.confirm", "extension.proof.submit", "extension.proof.late", "extension.proof.approve", "extension.proof.reject", "booking_completed", "booking_no_show_changed", "court.create", "timing.update", "booking.delete"] as const;
const customerActions = new Set(["checkout", "booking.submit", "proof.reserve"]);
const labels: Record<string, string> = { "booking.delete": "Booking permanently deleted", checkout: "Booking checkout", "booking.submit": "Booking submitted", "proof.reserve": "Payment proof reserved", "payment.approve": "Payment approved", "payment.reject": "Payment rejected", "exception.review": "Payment exception reviewed", "hours.update": "Court hours updated", "settings.update": "Settings updated", "calendar.block.create": "Calendar block created", "calendar.block.release": "Calendar block released", "walkin.create": "Walk-in booking created", "staff.update": "Staff access updated" };
Object.assign(labels, {'walkin.hold':'Walk-in held','sale.create':'Paid sale recorded','sale.correct':'Sale record corrected','sale.edit':'Sale edited','sale.delete':'Sale deleted','expense.create':'Paid expense recorded','expense.correct':'Expense record corrected','expense.edit':'Expense edited','expense.delete':'Expense deleted','owner.cutover':'Staff promoted to Owner','open_play.create':'Open Play created','open_play.update':'Open Play updated','open_play.remove':'Open Play removed','extension.hold':'Extension held','extension.confirm':'Extension confirmed','extension.proof.submit':'Extension evidence submitted','extension.proof.late':'Late extension evidence recorded','extension.proof.approve':'Extension payment approved','extension.proof.reject':'Extension evidence rejected',booking_completed:'Booking completed',booking_no_show_changed:'Attendance outcome corrected','court.create':'Court created','timing.update':'Timing policy updated'});
const versions = (v: unknown): v is string => typeof v === "string" && /^\d{1,20}$/.test(v);
const courtId = (v: unknown): v is string => typeof v === "string" && /^\d{1,12}$/.test(v);
const canonUuid = (v: unknown): v is string => typeof v === "string" && uuid.test(v);
const iso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function project(action: string, value: unknown): Record<string, unknown> {
  const d = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  const put = (key: string, valid: (v: unknown) => boolean) => { if (valid(d[key])) out[key] = d[key]; };
  if (action === "checkout") { put("total", v => typeof v === "string" && /^\d{1,12}(?:\.\d{1,2})?$/.test(v)); put("settingsVersion", versions); }
  if (action === "booking.submit") put("outcome", v => v === "pending" || v === "payment_exception");
  if (action === "hours.update" || action === "settings.update") {
    put("oldVersion", versions); put("newVersion", versions);
    if (Array.isArray(d.courtIds) && d.courtIds.length <= 100 && d.courtIds.every(courtId)) out.courtIds = d.courtIds;
  }
  if (action === "calendar.block.create" || action === "calendar.block.release") { put("blockId", canonUuid); put("courtId", courtId); if (action.endsWith("create")) put("kind", v => v === "maintenance" || v === "private"); }
  if (action === "walkin.create") { put("courtId", courtId); put("startsAt", iso); put("endsAt", iso); }
  if (action === "staff.update" || action === "owner.cutover") { put("userId", canonUuid); put("oldRole", v => v === null || v === "owner" || v === "staff"); put("newRole", v => v === null || v === "owner" || v === "staff"); put("oldEnabled", v => v === null || typeof v === "boolean"); put("newEnabled", v => v === null || typeof v === "boolean"); }
  if (action === "expense.edit" || action === "expense.delete") put("expenseId", canonUuid);
  if (action === "sale.edit" || action === "sale.delete") put("saleId", canonUuid);
  if (action === "booking.delete") { put("bookingId", canonUuid); put("reason", v => typeof v === "string" && v.length <= 500); }
  return out;
}
export function projectEthnAuditRow(row: Record<string, unknown>, staffActors: Set<string>) {
  const rawAction = typeof row.action === "string" ? row.action : "";
  const known = (actions as readonly string[]).includes(rawAction);
  const action = known ? rawAction : "unknown";
  const actor = typeof row.actor === "string" ? row.actor : "";
  const staffId = staffActors.has(actor) && uuid.test(actor) ? actor : null;
  const actorLabel = staffId ? "Staff" : customerActions.has(action) ? "Customer" : "System";
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(String(row.created_at)).toISOString();
  const summary: Record<string,string> = { checkout:"Booking checkout created", "booking.submit":"Booking submitted", "proof.reserve":"Payment proof reserved", "payment.approve":"Payment approved", "payment.reject":"Payment rejected", "exception.review":"Payment exception reviewed", "hours.update":"Court hours updated", "settings.update":"Settings updated", "calendar.block.create":"Calendar block created", "calendar.block.release":"Calendar block released", "walkin.create":"Walk-in booking created", "staff.update":"Staff access updated" };
  return { id: String(row.id), occurredAt: createdAt, action, label: labels[action] ?? "Activity", actorLabel, actorId: staffId, bookingId: typeof row.booking_id === "string" ? row.booking_id : null, summary: summary[action] ?? labels[action] ?? "Recorded activity", detail: known ? project(action, row.detail) : {} };
}
function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) throw new Error("INVALID_INPUT");
  const instant = manilaWallClock(value);
  if (!Number.isFinite(instant.getTime()) || manilaDateStr(instant) !== value) throw new Error("INVALID_INPUT");
  return new Date(instant.getTime());
}
function numberParam(v: string | null, fallback: number, max: number) {
  if (v === null) return fallback;
  if (!/^[1-9]\d{0,5}$/.test(v) || Number(v) > max) throw new Error("INVALID_INPUT");
  return Number(v);
}
export async function getEthnAuditRead(pool: Pick<Pool,"connect">, verify: StaffVerifier, url: URL) {
  const identity = await verify();
  if (!identity || !uuid.test(identity)) throw new Error("UNAUTHENTICATED");
  const params = url.searchParams, allowed = new Set(["from","to","action","q","page","limit"]);
  for (const key of new Set(params.keys())) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error("INVALID_INPUT");
  const fromText = params.get("from"), toText = params.get("to"), actionFilter = params.get("action"), q = params.get("q");
  if ([fromText,toText,actionFilter,q].some(v => v !== null && v.length === 0)) throw new Error("INVALID_INPUT");
  if (actionFilter !== null && !(actions as readonly string[]).includes(actionFilter)) throw new Error("INVALID_INPUT");
  if (q !== null && (q.length > 36 || !/^[\x21-\x7e]+$/.test(q) || (!uuid.test(q) && !(actions as readonly string[]).includes(q)))) throw new Error("INVALID_INPUT");
  const page = numberParam(params.get("page"), 1, 1000), limit = numberParam(params.get("limit"), 20, 50);
  const from = fromText ? date(fromText) : null, to = toText ? date(toText) : null;
  if (from && to && (to.getTime() < from.getTime() || (to.getTime()-from.getTime())/86400000 > 92)) throw new Error("INVALID_INPUT");
  const client = await pool.connect(); let tx = false, discard = false, committing = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); tx = true;
    const owner = await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [identity]);
    if (!owner.rows.length) throw new Error("FORBIDDEN");
    const staff = await client.query("SELECT user_id::text AS id FROM ethn.staff_access WHERE role IN ('owner','staff')");
    const staffActors = new Set(staff.rows.map(r => r.id as string));
    const where = ["($1::timestamptz IS NULL OR created_at >= $1)", "($2::timestamptz IS NULL OR created_at < $2)", "($3::text IS NULL OR action=$3)", "($4::uuid IS NULL OR booking_id=$4::uuid)", "($5::text IS NULL OR action=$5)"];
    const values = [from?.toISOString() ?? null, to ? new Date(to.getTime()+86400000).toISOString() : null, actionFilter, q && uuid.test(q) ? q : null, q && !uuid.test(q) ? q : null];
    const filter = where.join(" AND ");
    const total = Number((await client.query(`SELECT count(*)::text AS total FROM ethn.audit WHERE ${filter}`, values)).rows[0].total);
    const rows = (await client.query(`SELECT id::text,booking_id::text,actor,action,detail,created_at FROM ethn.audit WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT $6 OFFSET $7`, [...values,limit,(page-1)*limit])).rows.map(r => projectEthnAuditRow(r, staffActors));
    committing = true; await client.query("COMMIT"); tx = false;
    return { rows, page, limit, total, actions: [...actions] };
  } catch (error) { if (committing) discard=true; else if (tx) try { await client.query("ROLLBACK"); } catch { discard=true; } if (error instanceof Error && ["UNAUTHENTICATED","FORBIDDEN","INVALID_INPUT"].includes(error.message)) throw error; throw new Error("AUDIT_UNAVAILABLE"); }
  finally { client.release(discard); }
}
export const ethnAuditDateForTest = date;
