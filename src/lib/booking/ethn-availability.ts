import type { Pool } from "pg";
import { parsePesos } from "./core";
import { scheduleWindows } from "./schedule";
import { manilaDateStr, manilaWallClock } from "./slots";

export async function getAvailability(pool: Pick<Pool, "connect">, requestedDate: string | null) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const settings = (await client.query("SELECT version::text, interval_minutes, minimum_minutes, anchor_minutes, horizon_days, hold_minutes, merchant, transaction_timestamp() AS now FROM ethn.settings WHERE singleton = true")).rows[0];
    if (!settings || ![30, 60].includes(settings.interval_minutes) || !Number.isInteger(settings.minimum_minutes) || settings.minimum_minutes < settings.interval_minutes || settings.minimum_minutes % settings.interval_minutes || !Number.isInteger(settings.anchor_minutes) || settings.anchor_minutes < 0 || settings.anchor_minutes >= 1440 || !Number.isSafeInteger(settings.horizon_days) || settings.horizon_days <= 0 || !Number.isSafeInteger(settings.hold_minutes) || settings.hold_minutes <= 0 || !/^[1-9]\d*$/.test(settings.version)) throw new Error("NOT_CONFIGURED");
    const now = settings.now as Date;
    const operatingDate = manilaDateStr(new Date(now.getTime() - settings.anchor_minutes * 60_000));
    const date = requestedDate ?? operatingDate;
    const validated = scheduleWindows(date, settings.anchor_minutes, "", []);
    if ("error" in validated) throw new Error("INVALID_INPUT");
    const start = new Date(manilaWallClock(date).getTime() + settings.anchor_minutes * 60_000);
    const end = new Date(start.getTime() + 86_400_000);
    const courts = (await client.query("SELECT id::text, name, description, CASE WHEN photo IS NULL THEN '0' ELSE details_version::text END AS photo_version FROM ethn.courts WHERE active ORDER BY id")).rows;
    const hours = (await client.query("SELECT court_id::text, weekday, opens::text, closes::text, hourly_rate::text FROM ethn.court_hours")).rows;
    const allocations = (await client.query("SELECT court_id::text, starts_at, ends_at, state FROM ethn.court_allocations WHERE starts_at < $2 AND ends_at > $1 AND (state IN ('pending','confirmed','completed') OR (state = 'held' AND expires_at > $3)) ORDER BY starts_at", [start, end, now])).rows;
    const methods = (await client.query('SELECT id,name,instructions,(qr IS NOT NULL) AS "qrAvailable",version::text FROM ethn.payment_methods WHERE enabled ORDER BY name,id')).rows;
    let configured = methods.length > 0;
    const result = courts.map(court => {
      const resolved = scheduleWindows(date, settings.anchor_minutes, court.id, hours);
      if ("error" in resolved) throw new Error("INVALID_SCHEDULE");
      const windows = resolved.windows.map(w => {
        if (w.rate === null) configured = false;
        else { try { parsePesos(w.rate); } catch { throw new Error("INVALID_SCHEDULE"); } }
        return { opensAt: new Date(w.opens).toISOString(), closesAt: new Date(w.closes).toISOString(), hourlyRate: w.rate };
      });
      return { id: court.id as string, name: court.name as string, description: court.description as string | null, photoVersion: court.photo_version as string, windows, occupied: allocations.filter(a => a.court_id === court.id).map(a => ({ startsAt: (a.starts_at as Date).toISOString(), endsAt: (a.ends_at as Date).toISOString(), state: a.state as string })) };
    });
    await client.query("COMMIT");
    return { settings: { version: settings.version as string, intervalMinutes: settings.interval_minutes as number, minimumMinutes: settings.minimum_minutes as number, anchorMinutes: settings.anchor_minutes as number, horizonDays: settings.horizon_days as number, holdMinutes: settings.hold_minutes as number }, serverNow: now.toISOString(), operatingDate, date, configured, message: configured ? null : "Payment or pricing is not configured.", paymentMethods: methods, merchant: typeof settings.merchant === "string" && settings.merchant.trim() ? settings.merchant : null, courts: result };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
