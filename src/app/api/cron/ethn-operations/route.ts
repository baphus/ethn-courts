import { expireExtensionHolds } from '@/lib/booking/extension-expiry';
import { lockBookingAlertOwners } from '@/lib/booking/ethn-booking-alerts';
import { getCheckoutPool } from "@/db/checkout-client";
import { cancelPastPendingBookings, completeDueBookingsFromCron } from "@/lib/admin/ethn-outcomes";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isCronAuthorized(request)) {
    return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const pool = getCheckoutPool();
    const c = await pool.connect();
    let cancelled: number, discard = false, committing = false;
    try {
      await c.query('BEGIN');
      const owners = await lockBookingAlertOwners(c);
      await c.query('SELECT id FROM ethn.courts ORDER BY id FOR UPDATE');
      await expireExtensionHolds(c);
      cancelled = await cancelPastPendingBookings(c, owners);
      committing = true;
      await c.query('COMMIT');
    } catch (error) {
      if (committing) discard = true;
      else try { await c.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally { c.release(discard); }
    const result = await completeDueBookingsFromCron(pool);
    return Response.json({ ok: true, completed: result.completed.length, cancelled }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
