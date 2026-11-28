import type { Pool, PoolClient } from "pg";
import { addDaysManilaStr as addDays } from "../courts";
import { manilaDateStr } from "../booking/slots";
import { getAvailability } from "../booking/ethn-availability";
import { scheduleWindows } from "../booking/schedule";
import { approvedBookingSource } from "./ethn-finance";
import { getStaff, type StaffVerifier } from "./ethn-payments";
import { analyticsAverage, analyticsCents, analyticsMoney, analyticsMonth, analyticsParams, operatingMonthPeriod, validOccupancyPeriod } from "./dashboard-analytics-helpers";

/**
 * Dashboard analytics on ETHN tables. Every section is a bounded, read-only aggregate.
 * Financial figures are produced only for owners and are never part of a staff payload.
 *
 * Definitions (also shown in the UI):
 * - Reserved time: confirmed/completed booking allocations, including internal bookings.
 * - Blocked time: maintenance/private/Open Play blocks, kept separate from booking utilisation.
 * - Capacity: current opening windows for active courts; the occupancy report uses full days, legacy reports clip to now.
 * - Collections: verified original payments for confirmed or completed bookings, by Manila approval date.
 */

type Db = Pick<Pool, "connect">;
export type Range = "week" | "month";
const MAX_WINDOWS = 4000;

const pad = (n: number) => String(n).padStart(2, "0");
function invalid(): never { throw new Error("INVALID_INPUT"); }
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function weekStart(day: string) { const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); return addDays(day, -((dow + 6) % 7)); }
/** Same elapsed dates in the previous month (clamped to its length), e.g. Oct 1-9 -> Sep 1-9. */
function priorEquivalent(day: string): [string, string] {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)), d = Number(day.slice(8, 10));
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return [`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(Math.min(d, lastDayOfMonth(py, pm)))}`];
}
const check = analyticsParams;
function rangeParam(params: URLSearchParams): Range {
  const value = params.get("range") ?? "month";
  if (value !== "week" && value !== "month") invalid();
  return value;
}
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const hrs = (seconds: number) => Math.round(seconds / 360) / 10;

async function readOnly<T>(pool: Db, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
async function clock(client: PoolClient) {
  const row = (await client.query("SELECT clock_timestamp() AS now, anchor_minutes FROM ethn.settings WHERE singleton = true")).rows[0];
  if (!row || !Number.isInteger(row.anchor_minutes) || row.anchor_minutes < 0 || row.anchor_minutes >= 1440) throw new Error("NOT_CONFIGURED");
  const now = new Date(row.now), anchor = row.anchor_minutes as number;
  if (!Number.isFinite(now.getTime())) throw new Error("NOT_CONFIGURED");
  return { now, anchor, operatingDate: manilaDateStr(new Date(now.getTime() - anchor * 60_000)), calendarDate: manilaDateStr(now) };
}

type OccRow = { courtId: string; opDate: string; hourOffset: number; capacityS: number; reservedS: number; blockedS: number };
type Occupancy = { operatingDate: string; now: Date; from: string; to: string; courts: { id: string; name: string }[]; rows: OccRow[]; avgMinutes: number | null; reservationCount: number };

const OCCUPANCY_SQL = `
WITH w AS (
  SELECT t.court_id, t.op_date, t.opens, t.closes
  FROM unnest($1::bigint[], $2::date[], $3::timestamptz[], $4::timestamptz[]) AS t(court_id, op_date, opens, closes)
), b AS (
  SELECT w.court_id, w.op_date,
         floor(extract(epoch FROM (g - (w.op_date::timestamp AT TIME ZONE 'Asia/Manila'))) / 3600)::int AS hour_offset,
         GREATEST(g, w.opens) AS s, LEAST(g + interval '1 hour', w.closes) AS e
  FROM w CROSS JOIN LATERAL generate_series(date_trunc('hour', w.opens, 'Asia/Manila'), w.closes, interval '1 hour') AS g
)
SELECT b.court_id::text AS court_id, b.op_date::text AS op_date, b.hour_offset,
       sum(extract(epoch FROM (b.e - b.s)))::float8 AS capacity_s,
       sum(COALESCE(r.reserved_s, 0))::float8 AS reserved_s,
       sum(COALESCE(r.blocked_s, 0))::float8 AS blocked_s
FROM b
LEFT JOIN LATERAL (
  SELECT sum(CASE WHEN booking.status IN ('confirmed','completed') AND a.state IN ('confirmed','completed') THEN extract(epoch FROM (LEAST(a.ends_at, b.e) - GREATEST(a.starts_at, b.s))) END) AS reserved_s,
         sum(CASE WHEN a.block_id IS NOT NULL AND a.state = 'confirmed' THEN extract(epoch FROM (LEAST(a.ends_at, b.e) - GREATEST(a.starts_at, b.s))) END) AS blocked_s
  FROM ethn.court_allocations a
  LEFT JOIN ethn.booking_items i ON i.id = a.item_id
  LEFT JOIN ethn.extension_items ei ON ei.id = a.extension_item_id
  LEFT JOIN ethn.extensions e ON e.id = ei.extension_id AND e.status IN ('confirmed','completed')
  LEFT JOIN ethn.bookings booking ON booking.id = coalesce(i.booking_id, e.booking_id)
  WHERE a.court_id = b.court_id AND a.starts_at < b.e AND a.ends_at > b.s
) r ON true
WHERE b.e > b.s
GROUP BY 1, 2, 3
ORDER BY 2, 3, 1`;

async function loadOccupancy(client: PoolClient, { now, anchor, operatingDate }: Awaited<ReturnType<typeof clock>>, from: string, to: string, includeUpcoming = false): Promise<Occupancy> {
  const courts = (await client.query("SELECT id::text AS id, name FROM ethn.courts WHERE active ORDER BY id")).rows as { id: string; name: string }[];
  const empty = { operatingDate, now, from, to, courts, rows: [] as OccRow[], avgMinutes: null, reservationCount: 0 };
  if (from > to || !courts.length) return empty;
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 31) invalid();
  const hours = (await client.query("SELECT court_id::text, weekday, opens::text, closes::text, hourly_rate::text FROM ethn.court_hours")).rows;
  const ids: string[] = [], days: string[] = [], opens: string[] = [], closes: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (const court of courts) {
      const resolved = scheduleWindows(day, anchor, court.id, hours);
      if ("error" in resolved) throw new Error("INVALID_SCHEDULE");
      for (const w of resolved.windows) {
        const close = includeUpcoming ? w.closes : Math.min(w.closes, now.getTime());
        if (w.opens >= close) continue;
        if (ids.length >= MAX_WINDOWS) invalid();
        ids.push(court.id); days.push(day); opens.push(new Date(w.opens).toISOString()); closes.push(new Date(close).toISOString());
      }
    }
    if (day === to) break;
  }
  const rows = ids.length ? (await client.query(OCCUPANCY_SQL, [ids, days, opens, closes])).rows.map(r => ({ courtId: r.court_id as string, opDate: r.op_date as string, hourOffset: Number(r.hour_offset), capacityS: Number(r.capacity_s), reservedS: Number(r.reserved_s), blockedS: Number(r.blocked_s) })) : [];
  const avg = (await client.query(`SELECT avg(i.duration_minutes)::float8 AS avg_minutes, count(*)::int AS n FROM ethn.booking_items i JOIN ethn.bookings b ON b.id = i.booking_id
    WHERE b.operating_date BETWEEN $1::date AND $2::date AND b.status IN ('confirmed','completed')
      AND ($3::timestamptz IS NULL OR i.starts_at < $3::timestamptz)`, [from, to, includeUpcoming ? null : now])).rows[0];
  return { ...empty, rows, avgMinutes: avg.avg_minutes === null ? null : Number(avg.avg_minutes), reservationCount: Number(avg.n) };
}

type Sum = { cap: number; res: number; blk: number };
function bump<K>(map: Map<K, Sum>, key: K, r: OccRow) {
  const s = map.get(key) ?? { cap: 0, res: 0, blk: 0 };
  s.cap += r.capacityS; s.res += r.reservedS; s.blk += r.blockedS; map.set(key, s);
}
const weekdayIndex = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

function aggregate(o: Occupancy) {
  const total: Sum = { cap: 0, res: 0, blk: 0 };
  const byCourt = new Map<string, Sum>(), byDay = new Map<string, Sum>(), byHour = new Map<number, Sum>(), heat = new Map<string, Sum>();
  for (const r of o.rows) {
    total.cap += r.capacityS; total.res += r.reservedS; total.blk += r.blockedS;
    bump(byCourt, r.courtId, r); bump(byDay, r.opDate, r); bump(byHour, r.hourOffset, r); bump(heat, `${weekdayIndex(r.opDate)}:${r.hourOffset}`, r);
  }
  return { total, byCourt, byDay, byHour, heat };
}

function overviewPayload(range: Range | "custom", o: Occupancy, { total, byCourt, byHour, heat } = aggregate(o)) {
  const hourOffsets = [...new Set(o.rows.filter(r => r.capacityS > 0).map(r => r.hourOffset))].sort((a, b) => a - b);
  const heatmap = { hours: hourOffsets, rows: Array.from({ length: 7 }, (_, weekday) => hourOffsets.map(h => {
    const s = heat.get(`${weekday}:${h}`);
    return s && s.cap > 0 ? { percent: pct(s.res, s.cap) ?? 0, reservedHours: hrs(s.res), capacityHours: hrs(s.cap) } : null;
  })) };
  // Peak hour: busiest hour of the operating day over the range (needs at least one court-hour of capacity).
  let peak: { hourOffset: number; percent: number } | null = null;
  for (const [hourOffset, s] of byHour) if (s.cap >= 3600) { const p = pct(s.res, s.cap) ?? 0; if (!peak || p > peak.percent) peak = { hourOffset, percent: p }; }
  // Insight: completed operating days only, and only with enough data to be meaningful.
  const done = o.rows.filter(r => r.opDate < o.operatingDate);
  const doneDays = [...new Set(done.map(r => r.opDate))].sort();
  let insight: unknown = { reason: `Needs at least 7 completed operating days (${doneDays.length} so far).` };
  if (doneDays.length >= 7) {
    const hourly = new Map<number, Sum>();
    for (const r of done) bump(hourly, r.hourOffset, r);
    const usable = [...hourly].filter(([, s]) => s.cap >= 7 * 3600).map(([hourOffset, s]) => ({ hourOffset, percent: pct(s.res, s.cap) ?? 0 })).sort((a, b) => a.hourOffset - b.hourOffset);
    if (usable.length >= 2) {
      const busiest = usable.reduce((a, b) => (b.percent > a.percent ? b : a)), quietest = usable.reduce((a, b) => (b.percent < a.percent ? b : a));
      insight = { from: doneDays[0], to: doneDays[doneDays.length - 1], days: doneDays.length, busiest, quietest };
    } else insight = { reason: "Not enough opening hours in the completed days to compare hours." };
  }
  return {
    range, from: o.from, to: o.to, asOf: o.now.toISOString(), operatingDate: o.operatingDate,
    kpis: { reservedHours: hrs(total.res), capacityHours: hrs(total.cap), occupiedPercent: pct(total.res, total.cap), blockedHours: hrs(total.blk), peak, averageReservationMinutes: o.avgMinutes, reservationCount: o.reservationCount },
    courts: o.courts.map(c => { const s = byCourt.get(c.id) ?? { cap: 0, res: 0, blk: 0 }; return { id: c.id, name: c.name, percent: pct(s.res, s.cap), reservedHours: hrs(s.res), blockedHours: hrs(s.blk), capacityHours: hrs(s.cap) }; }),
    heatmap, insight,
  };
}

async function requireOwner(client: PoolClient, userId: string) {
  if (!(await client.query("SELECT 1 FROM ethn.staff_access WHERE user_id=$1 AND enabled AND role='owner'", [userId])).rows.length) throw new Error("FORBIDDEN");
}

async function approvedPaymentDays(client: PoolClient, from: string, to: string) {
  const { rows } = await client.query<{ date: string; collected: string }>(`WITH receipts AS (
    SELECT (p.verified_at AT TIME ZONE 'Asia/Manila')::date AS day, sum(p.collected_amount) AS amount
    ${approvedBookingSource} GROUP BY 1
  ) SELECT d.day::date::text AS date, coalesce(r.amount, 0)::numeric(30,2)::text AS collected
    FROM generate_series($1::date, $2::date, interval '1 day') d(day)
    LEFT JOIN receipts r ON r.day = d.day::date ORDER BY d.day`, [from, to]);
  return rows;
}

const totalPayments = (days: { collected: string }[]) => analyticsMoney(days.reduce((n, day) => n + analyticsCents(day.collected), BigInt(0)));

async function hero(pool: Db, owner: boolean, userId: string) {
  return readOnly(pool, async client => {
    const { operatingDate, calendarDate } = await clock(client);
    const [priorFrom, priorTo] = priorEquivalent(calendarDate);
    const monthStart = `${calendarDate.slice(0, 7)}-01`;
    const row = (await client.query(`WITH approvals AS (
      SELECT b.id, (p.verified_at AT TIME ZONE 'Asia/Manila')::date AS day
      ${approvedBookingSource}
    ) SELECT count(DISTINCT id) FILTER (WHERE day = $2::date)::int AS today,
      count(DISTINCT id) FILTER (WHERE day >= $3::date)::int AS current,
      count(DISTINCT id) FILTER (WHERE day <= $4::date)::int AS prior
      FROM approvals`, [priorFrom, calendarDate, monthStart, priorTo])).rows[0];
    const base = { operatingDate, calendarDate, bookings: { today: Number(row.today), month: Number(row.current), priorMonthToDate: Number(row.prior) } };
    if (!owner) return base;
    await requireOwner(client, userId);
    const month = await approvedPaymentDays(client, monthStart, calendarDate);
    const prior = await approvedPaymentDays(client, priorFrom, priorTo);
    return { ...base, collections: { today: month.at(-1)?.collected ?? "0.00", month: totalPayments(month), priorMonthToDate: totalPayments(prior) } };
  });
}

function occupancyDays({ from, to }: Occupancy, byDay: Map<string, Sum>) {
  const days: { date: string; percent: number | null; reservedHours: number; capacityHours: number }[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const s = byDay.get(day) ?? { cap: 0, res: 0 };
    days.push({ date: day, percent: pct(s.res, s.cap), reservedHours: hrs(s.res), capacityHours: hrs(s.cap) });
    if (day === to) break;
  }
  return days;
}

async function chart(client: PoolClient, time: Awaited<ReturnType<typeof clock>>, owner: boolean, userId: string, params: URLSearchParams, includeOverview = false) {
  const { calendarDate: today, operatingDate } = time;
  const month = analyticsMonth(params.get("month") ?? today.slice(0, 7), today.slice(0, 7));
  const { from: monthStart, to: monthEnd } = operatingMonthPeriod(`${month}-01`);
  const to = monthEnd < today ? monthEnd : today;
  const occupancy = await loadOccupancy(client, time, monthStart, monthEnd < operatingDate ? monthEnd : operatingDate);
  const groups = aggregate(occupancy);
  const result: Record<string, unknown> = { month, today, occupancy: { days: occupancyDays(occupancy, groups.byDay) } };
  if (includeOverview) {
    // Before the operating-day anchor, the calendar month can be one month ahead.
    const from = `${operatingDate.slice(0, 7)}-01`;
    const overview = occupancy.from === from && occupancy.to === operatingDate
      ? occupancy : await loadOccupancy(client, time, from, operatingDate);
    result.overview = overviewPayload("month", overview, overview === occupancy ? groups : undefined);
  }
  if (!owner) return result;
  await requireOwner(client, userId);
  const all = await approvedPaymentDays(client, addDays(monthStart, -6), to);
  const leadDays = all.filter(day => day.date < monthStart).length;
  const current = all.slice(leadDays);
  const daily = current.map((day, i) => {
    const index = leadDays + i;
    const window = all.slice(Math.max(0, index - 6), index + 1);
    const total = window.reduce((n, x) => n + analyticsCents(x.collected), BigInt(0));
    return { date: day.date, collected: day.collected, average: analyticsAverage(total, window.length) };
  });
  const collected = totalPayments(current);
  result.collections = { totals: { collected, averagePerDay: analyticsAverage(analyticsCents(collected), daily.length) }, daily };
  return result;
}

async function methods(pool: Db, userId: string, range: Range) {
  return readOnly(pool, async client => {
    await requireOwner(client, userId);
    const { calendarDate: today } = await clock(client);
    const from = range === "week" ? weekStart(today) : `${today.slice(0, 7)}-01`;
    const { rows: paymentMethods } = await client.query<{ id: string; name: string; amount: string }>(`WITH receipts AS (
      SELECT p.method AS id, sum(p.collected_amount) AS amount ${approvedBookingSource} GROUP BY 1
    ), methods AS (
      SELECT id FROM ethn.payment_methods WHERE enabled UNION SELECT id FROM receipts UNION SELECT 'cash'
    ) SELECT methods.id, coalesce(p.name, CASE WHEN methods.id = 'cash' THEN 'Cash' ELSE methods.id END) AS name,
      coalesce(r.amount, 0)::numeric(30,2)::text AS amount
      FROM methods LEFT JOIN receipts r USING (id) LEFT JOIN ethn.payment_methods p USING (id)
      ORDER BY (methods.id = 'cash') DESC, name, methods.id`, [from, today]);
    const collected = analyticsMoney(paymentMethods.reduce((total, method) => total + analyticsCents(method.amount), BigInt(0)));
    return { range, from, to: today, collected, paymentMethods };
  });
}

async function schedule(pool: Db) {
  return readOnly(pool, async client => {
    const { now, operatingDate } = await clock(client);
    const rows = (await client.query(`WITH parts AS (
        SELECT 'item:' || i.id::text AS id, i.booking_id, i.court_id, i.starts_at, i.ends_at FROM ethn.booking_items i JOIN ethn.bookings x ON x.id = i.booking_id WHERE x.operating_date BETWEEN $1::date AND $2::date
        UNION ALL
        SELECT 'extension:' || ei.id::text AS id, e.booking_id, ei.court_id, ei.starts_at, ei.ends_at FROM ethn.extension_items ei JOIN ethn.extensions e ON e.id = ei.extension_id JOIN ethn.bookings x ON x.id = e.booking_id WHERE e.status = 'confirmed' AND x.operating_date BETWEEN $1::date AND $2::date
      )
      SELECT p.id, b.id::text AS booking_id, b.guest_name, b.status, b.operating_date::text AS operating_date, p.starts_at, p.ends_at, c.name AS court
      FROM ethn.bookings b JOIN parts p ON p.booking_id = b.id JOIN ethn.courts c ON c.id = p.court_id
      WHERE b.status = 'confirmed' AND b.archived_at IS NULL AND b.operating_date BETWEEN $1::date AND $2::date AND p.starts_at >= $3::timestamptz
      ORDER BY p.starts_at, p.id LIMIT 301`, [operatingDate, addDays(operatingDate, 6), now])).rows;
    return { operatingDate, truncated: rows.length > 300, items: rows.slice(0, 300).map(r => ({ id: r.id as string, bookingId: r.booking_id as string, guestName: r.guest_name as string | null, status: r.status as string, operatingDate: r.operating_date as string, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(), courts: [r.court as string] })) };
  });
}

async function bookingWindow(pool: Db, params: URLSearchParams) {
  const requested = params.get("date");
  if (requested !== null && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) invalid();
  const base = await getAvailability(pool, null);
  const dates = Array.from({ length: Math.min(base.settings.horizonDays, 5) }, (_, i) => addDays(base.operatingDate, i));
  if (requested !== null && !dates.includes(requested)) invalid();
  const a = !requested || requested === base.date ? base : await getAvailability(pool, requested);
  return {
    operatingDate: base.operatingDate, date: a.date, dates, horizonDays: base.settings.horizonDays, intervalMinutes: base.settings.intervalMinutes,
    courts: a.courts.map(c => ({ id: c.id, name: c.name, windows: c.windows.map(w => ({ opensAt: w.opensAt, closesAt: w.closesAt })), occupied: c.occupied })),
  };
}

export async function ethnDashboardAnalytics(pool: Db, verify: StaffVerifier, params: URLSearchParams) {
  const actor = await getStaff(pool, verify);
  const owner = actor.role === "owner";
  switch (params.get("section")) {
    case "hero": check(params, ["section"]); return hero(pool, owner, actor.userId);
    case "chart": check(params, ["section", "month"]); return readOnly(pool, async client => chart(client, await clock(client), owner, actor.userId, params));
    case "monthly": check(params, ["section"]); return readOnly(pool, async client => chart(client, await clock(client), owner, actor.userId, params, true));
    case "occupancy": {
      check(params, ["section", "from", "to"]);
      const from = params.get("from"), to = params.get("to");
      const requested = from !== null || to !== null;
      if (requested && (from === null || to === null || !validOccupancyPeriod(from, to))) invalid();
      return readOnly(pool, async client => {
        const time = await clock(client);
        const period = from !== null && to !== null ? { from, to } : operatingMonthPeriod(time.operatingDate);
        const occupancy = await loadOccupancy(client, time, period.from, period.to, true);
        const groups = aggregate(occupancy);
        return { ...overviewPayload("custom", occupancy, groups), days: occupancyDays(occupancy, groups.byDay) };
      });
    }
    case "overview": {
      check(params, ["section", "range"]);
      const range = rangeParam(params);
      return readOnly(pool, async client => {
        const time = await clock(client);
        const { operatingDate } = time;
        const from = range === "week" ? weekStart(operatingDate) : `${operatingDate.slice(0, 7)}-01`;
        return overviewPayload(range, await loadOccupancy(client, time, from, operatingDate));
      });
    }
    case "methods": { check(params, ["section", "range"]); if (!owner) throw new Error("FORBIDDEN"); return methods(pool, actor.userId, rangeParam(params)); }
    case "schedule": check(params, ["section"]); return schedule(pool);
    case "window": check(params, ["section", "date"]); return bookingWindow(pool, params);
    default: return invalid();
  }
}
