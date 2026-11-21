import { expireExtensionHolds } from '@/lib/booking/extension-expiry';
import { getCheckoutPool } from "@/db/checkout-client";
import { completeDueBookingsFromCron } from "@/lib/admin/ethn-outcomes";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isCronAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const pool=getCheckoutPool();
    const c=await pool.connect();let discard=false;try{await c.query('BEGIN');await c.query('SELECT id FROM ethn.courts ORDER BY id FOR UPDATE');await expireExtensionHolds(c);await c.query('COMMIT');}catch(e){try{await c.query('ROLLBACK');}catch{discard=true;}throw e;}finally{c.release(discard);}
    const result = await completeDueBookingsFromCron(pool);
    return Response.json({ ok: true, completed: result.completed.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
