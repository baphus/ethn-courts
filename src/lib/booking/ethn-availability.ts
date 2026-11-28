import type { Pool } from "pg";
import { parsePesos } from "./core";
import { scheduleWindows } from "./schedule";
import { manilaDateStr, manilaWallClock } from "./slots";

const DAY = 86_400_000;

async function readAvailability(pool: Pick<Pool, "connect">, requestedDate: string | null, month?: string) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const settings = (await client.query("SELECT version::text, interval_minutes, minimum_minutes, anchor_minutes, horizon_days, hold_minutes, merchant, transaction_timestamp() AS now FROM ethn.settings WHERE singleton = true")).rows[0];
    if (!settings || ![30, 60].includes(settings.interval_minutes) || !Number.isInteger(settings.minimum_minutes) || settings.minimum_minutes < settings.interval_minutes || settings.minimum_minutes % settings.interval_minutes || !Number.isInteger(settings.anchor_minutes) || settings.anchor_minutes < 0 || settings.anchor_minutes >= 1440 || !Number.isSafeInteger(settings.horizon_days) || settings.horizon_days <= 0 || !Number.isSafeInteger(settings.hold_minutes) || settings.hold_minutes <= 0 || !/^[1-9]\d*$/.test(settings.version)) throw new Error("NOT_CONFIGURED");
    const now = settings.now as Date;
    const operatingDate = manilaDateStr(new Date(now.getTime() - settings.anchor_minutes * 60_000));
    const first = month === undefined ? requestedDate ?? operatingDate : `${month}-01`;
    if ("error" in scheduleWindows(first, settings.anchor_minutes, "", [])) throw new Error("INVALID_INPUT");
    let dates = [first];
    if (month !== undefined) {
      const midnight = manilaWallClock(first).getTime();
      const maxDate = manilaDateStr(new Date(manilaWallClock(operatingDate).getTime() + (settings.horizon_days - 1) * DAY));
      dates = Array.from({ length: 31 }, (_, i) => manilaDateStr(new Date(midnight + i * DAY)))
        .filter(date => date.startsWith(`${month}-`) && date >= operatingDate && date <= maxDate);
    }
    if (!dates.length) throw new Error("INVALID_INPUT");
    const anchor = settings.anchor_minutes * 60_000;
    const start = new Date(manilaWallClock(dates[0]).getTime() + anchor);
    const end = new Date(manilaWallClock(dates[dates.length - 1]).getTime() + anchor + DAY);
    const courts = (await client.query("SELECT id::text, name, description, CASE WHEN photo IS NULL THEN '0' ELSE details_version::text END AS photo_version FROM ethn.courts WHERE active ORDER BY id")).rows;
    const hours = (await client.query("SELECT court_id::text, weekday, opens::text, closes::text, hourly_rate::text FROM ethn.court_hours")).rows;
    const allocations = (await client.query(`SELECT court_id::text, starts_at, ends_at, state FROM ethn.court_allocations
      WHERE state IN ('held','pending','confirmed','completed')
        AND tstzrange(starts_at, ends_at, '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
        AND (state <> 'held' OR expires_at > $3)
      ORDER BY starts_at`, [start, end, now])).rows;
    const methods = (await client.query('SELECT id,name,instructions,(qr IS NOT NULL) AS "qrAvailable",version::text FROM ethn.payment_methods WHERE enabled ORDER BY name,id')).rows;
    const days = dates.map(date => {
      const dayStart = manilaWallClock(date).getTime() + anchor;
      let configured = methods.length > 0;
      const result = courts.map(court => {
        const resolved = scheduleWindows(date, settings.anchor_minutes, court.id, hours);
        if ("error" in resolved) throw new Error("INVALID_SCHEDULE");
        const windows = resolved.windows.map(w => {
          if (w.rate === null) configured = false;
          else { try { parsePesos(w.rate); } catch { throw new Error("INVALID_SCHEDULE"); } }
          return { opensAt: new Date(w.opens).toISOString(), closesAt: new Date(w.closes).toISOString(), hourlyRate: w.rate };
        });
        const occupied = allocations.filter(a => a.court_id === court.id && +a.starts_at < dayStart + DAY && +a.ends_at > dayStart)
          .map(a => ({ startsAt: (a.starts_at as Date).toISOString(), endsAt: (a.ends_at as Date).toISOString(), state: a.state as string }));
        return { id: court.id as string, name: court.name as string, description: court.description as string | null, photoVersion: court.photo_version as string, windows, occupied };
      });
      return { date, configured, message: configured ? null : "Payment or pricing is not configured.", courts: result };
    });
    await client.query("COMMIT");
    return { settings: { version: settings.version as string, intervalMinutes: settings.interval_minutes as number, minimumMinutes: settings.minimum_minutes as number, anchorMinutes: settings.anchor_minutes as number, horizonDays: settings.horizon_days as number, holdMinutes: settings.hold_minutes as number }, serverNow: now.toISOString(), operatingDate, paymentMethods: methods, merchant: typeof settings.merchant === "string" && settings.merchant.trim() ? settings.merchant : null, days };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

export async function getAvailability(pool: Pick<Pool, "connect">, date: string | null) {
  const { days, ...shared } = await readAvailability(pool, date);
  return { ...shared, ...days[0] };
}

export function getMonthAvailability(pool: Pick<Pool, "connect">, month: string) {
  return readAvailability(pool, null, month);
}
