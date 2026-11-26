import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { getStaff, type StaffVerifier } from './ethn-payments';

type Db = Pick<Pool, 'connect'>;
export const methodId = /^[a-z][a-z0-9_-]{0,63}$/;
export async function listPaymentMethods(pool: Db, verify?: StaffVerifier) {
  if (verify) await getStaff(pool, verify);
  const c = await pool.connect();
  try {
    const { rows } = await c.query(`SELECT id,name,instructions,enabled,(qr IS NOT NULL) AS "qrAvailable",version::text FROM ethn.payment_methods ${verify ? '' : 'WHERE enabled'} ORDER BY name,id`);
    return { methods: rows };
  } finally { c.release(); }
}
export async function savePaymentMethod(pool: Db, verify: StaffVerifier, body: unknown, qr?: Buffer | null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_INPUT');
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(k => !['id','name','instructions','enabled'].includes(k))) throw new Error('INVALID_INPUT');
  const id = b.id ?? `method-${randomUUID()}`;
  if (typeof id !== 'string' || !methodId.test(id) || id === 'cash' || typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 100 || typeof b.instructions !== 'string' || b.instructions.length > 4000 || typeof b.enabled !== 'boolean' || (qr && qr.length > 1048576)) throw new Error('INVALID_INPUT');
  const actor = await getStaff(pool, verify), c = await pool.connect();
  let committing = false, discard = false;
  try {
    await c.query('BEGIN');
    if (!(await c.query("SELECT user_id FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner' FOR UPDATE", [actor.userId])).rowCount) throw new Error('FORBIDDEN');
    await c.query(`INSERT INTO ethn.payment_methods(id,name,instructions,enabled,qr) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,instructions=excluded.instructions,enabled=excluded.enabled,qr=CASE WHEN $6 THEN excluded.qr WHEN excluded.instructions = ethn.payment_methods.instructions AND excluded.name = ethn.payment_methods.name THEN ethn.payment_methods.qr ELSE NULL END,version=ethn.payment_methods.version+1,updated_at=clock_timestamp()`, [id,b.name.trim(),b.instructions.trim(),b.enabled,qr ?? null,qr !== undefined]);
    await c.query('INSERT INTO ethn.payment_method_qr_versions(method_id,version,qr) SELECT id,version,qr FROM ethn.payment_methods WHERE id=$1 AND qr IS NOT NULL ON CONFLICT DO NOTHING',[id]);
    await c.query("INSERT INTO ethn.audit(actor,action,detail) VALUES($1,'payment_method.save',$2::jsonb)", [actor.userId,JSON.stringify({id,qrUpdated:!!qr})]);
    committing = true; await c.query('COMMIT'); return { id };
  } catch (e) { if (committing) discard = true; else try { await c.query('ROLLBACK'); } catch { discard = true; } throw e; }
  finally { c.release(discard ? new Error('discard transaction') : undefined); }
}
export async function paymentMethodQr(pool: Db, id: string, verify?: StaffVerifier, version?: string) {
  if (!methodId.test(id)) throw new Error('INVALID_INPUT');
  if (verify) await getStaff(pool, verify);
  const c = await pool.connect();
  try {
    if (version !== undefined) {
      if (!/^[1-9]\d{0,18}$/.test(version)) throw new Error('INVALID_INPUT');
      return (await c.query('SELECT qr FROM ethn.payment_method_qr_versions WHERE method_id=$1 AND version=$2',[id,version])).rows[0]?.qr as Buffer | undefined;
    }
    return (await c.query(`SELECT qr FROM ethn.payment_methods WHERE id=$1 ${verify ? '' : 'AND enabled'}`, [id])).rows[0]?.qr as Buffer | undefined;
  }
  finally { c.release(); }
}
