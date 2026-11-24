import type { Pool, PoolClient } from "pg";
import { manilaDateStr } from "../booking/slots";
import { getAvailability } from "../booking/ethn-availability";
import { scheduleWindows } from "../booking/schedule";
import { getApprovalFinance, getFinance } from "./ethn-finance";
import { getStaff, type StaffVerifier } from "./ethn-payments";
import { analyticsAverage, analyticsCents, analyticsMonth, analyticsParams } from "./dashboard-analytics-helpers";

/**
 * Dashboard analytics on ETHN tables. Every section is a bounded, read-only aggregate.
 * Financial figures are produced only for owners and are never part of a staff payload.
 *
 * Definitions (also shown in the UI):
 * - Reserved time: customer booking allocations in pending/confirmed/completed. Held bookings are NOT reservations.
 * - Blocked time: maintenance/private/Open Play blocks, kept separate from booking utilisation.
 * - Capacity: current configured opening windows (scheduleWindows), active courts only, clipped to "now"; historical schedules may differ.
 * - Collections: getFinance totals (accepted booking/extension payments + manual sales after corrections).
 */

type Db = Pick<Pool, "connect">;
export type Range = "week" | "month";
const COLLECTIONS_SCOPE = "Verified booking and extension collections plus manual sales after corrections. Expenses excluded.";
const MAX_WINDOWS = 4000;

const pad = (n: number) => String(n).padStart(2, "0");
function invalid(): never { throw new Error("INVALID_INPUT"); }
function addDays(day: string, n: number) { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
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
  SELECT sum(CASE WHEN a.block_id IS NULL AND a.state IN ('pending','confirmed','completed') THEN extract(epoch FROM (LEAST(a.ends_at, b.e) - GREATEST(a.starts_at, b.s))) END) AS reserved_s,
         sum(CASE WHEN a.block_id IS NOT NULL AND a.state = 'confirmed' THEN extract(epoch FROM (LEAST(a.ends_at, b.e) - GREATEST(a.starts_at, b.s))) END) AS blocked_s
  FROM ethn.court_allocations a
  WHERE a.court_id = b.court_id AND a.starts_at < b.e AND a.ends_at > b.s
) r ON true
WHERE b.e > b.s
GROUP BY 1, 2, 3
ORDER BY 2, 3, 1`;

async function loadOccupancy(pool: Db, pick: (operatingDate: string) => [string, string]): Promise<Occupancy> {
  return readOnly(pool, async client => {
    const { now, anchor, operatingDate } = await clock(client);
    const [from, to] = pick(operatingDate);
    const courts = (await client.query("SELECT id::text AS id, name FROM ethn.courts WHERE active ORDER BY id")).rows as { id: string; name: string }[];
    const empty = { operatingDate, now, from, to, courts, rows: [] as OccRow[], avgMinutes: null, reservationCount: 0 };
    if (from > to || !courts.length) return empty;
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 31) invalid();
    const hours = (await client.query("SELECT court_id::text, weekday, opens::text, closes::text, hourly_rate::text FROM ethn.court_hours")).rows;
    const ids: string[] = [], days: string[] = [], opens: string[] = [], closes: string[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) for (const court of courts) {
      const resolved = scheduleWindows(day, anchor, court.id, hours);
      if ("error" in resolved) throw new Error("INVALID_SCHEDULE");
      for (const w of resolved.windows) {
        const open = new Date(w.opens).getTime(), close = Math.min(new Date(w.closes).getTime(), now.getTime());
        if (open >= close) continue; // not elapsed yet
        if (ids.length >= MAX_WINDOWS) invalid();
        ids.push(court.id); days.push(day); opens.push(new Date(open).toISOString()); closes.push(new Date(close).toISOString());
      }
    }
    const rows = ids.length ? (await client.query(OCCUPANCY_SQL, [ids, days, opens, closes])).rows.map(r => ({ courtId: r.court_id as string, opDate: r.op_date as string, hourOffset: Number(r.hour_offset), capacityS: Number(r.capacity_s), reservedS: Number(r.reserved_s), blockedS: Number(r.blocked_s) })) : [];
    const avg = (await client.query(`SELECT avg(i.duration_minutes)::float8 AS avg_minutes, count(*)::int AS n FROM ethn.booking_items i JOIN ethn.bookings b ON b.id = i.booking_id
      WHERE b.operating_date BETWEEN $1::date AND $2::date AND b.status IN ('pending','confirmed','completed') AND i.starts_at < $3::timestamptz`, [from, to, now])).rows[0];
    return { ...empty, rows, avgMinutes: avg.avg_minutes === null ? null : Number(avg.avg_minutes), reservationCount: Number(avg.n) };
  });
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

function overviewPayload(range: Range, o: Occupancy) {
  const { total, byCourt, byHour, heat } = aggregate(o);
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

async function hero(pool: Db, verify: StaffVerifier, owner: boolean) {
  const base = await readOnly(pool, async client => {
    const { operatingDate, calendarDate } = await clock(client);
    const [priorFrom, priorTo] = priorEquivalent(operatingDate);
    const row = (await client.query(`SELECT count(*) FILTER (WHERE operating_date >= $1::date)::int AS current,
      count(*) FILTER (WHERE operating_date BETWEEN $3::date AND $4::date)::int AS prior
      FROM ethn.bookings WHERE status <> 'held' AND operating_date BETWEEN $3::date AND $2::date`, [`${operatingDate.slice(0, 7)}-01`, operatingDate, priorFrom, priorTo])).rows[0];
    return { operatingDate, calendarDate, bookings: { month: Number(row.current), priorMonthToDate: Number(row.prior) } };
  });
  if (!owner) return base;
  const [priorFrom, priorTo] = priorEquivalent(base.calendarDate);
  const [today, month, prior, bookingToday, bookingMonth] = await Promise.all([
    getFinance(pool, verify, base.calendarDate, base.calendarDate),
    getFinance(pool, verify, `${base.calendarDate.slice(0, 7)}-01`, base.calendarDate),
    getFinance(pool, verify, priorFrom, priorTo),
    getApprovalFinance(pool, verify, base.calendarDate, base.calendarDate),
    getApprovalFinance(pool, verify, `${base.calendarDate.slice(0, 7)}-01`, base.calendarDate),
  ]);
  return { ...base, bookingRevenue: { todayCents: bookingToday.revenueCents, monthCents: bookingMonth.revenueCents }, collections: { today: today.totals.collected, month: month.totals.collected, priorMonthToDate: prior.totals.collected, included: COLLECTIONS_SCOPE } };
}

async function chart(pool: Db, verify: StaffVerifier, owner: boolean, params: URLSearchParams) {
  const today = await readOnly(pool, async client => (await clock(client)).calendarDate);
  const month = analyticsMonth(params.get("month") ?? today.slice(0, 7), today.slice(0, 7));
  const monthStart = `${month}-01`, monthEnd = `${month}-${pad(lastDayOfMonth(Number(month.slice(0, 4)), Number(month.slice(5))))}`;
  const to = monthEnd < today ? monthEnd : today;
  const occupancy = await loadOccupancy(pool, operatingDate => [monthStart, monthEnd < operatingDate ? monthEnd : operatingDate]);
  const byDay = aggregate(occupancy).byDay;
  const days: { date: string; percent: number | null; reservedHours: number; capacityHours: number }[] = [];
  for (let day = occupancy.from; day <= occupancy.to; day = addDays(day, 1)) { const s = byDay.get(day) ?? { cap: 0, res: 0, blk: 0 }; days.push({ date: day, percent: pct(s.res, s.cap), reservedHours: hrs(s.res), capacityHours: hrs(s.cap) }); }
  const result: Record<string, unknown> = { month, today, occupancy: { days } };
  if (!owner) return result;
  const [current, lead] = await Promise.all([getFinance(pool, verify, monthStart, to), getFinance(pool, verify, addDays(monthStart, -6), addDays(monthStart, -1))]);
  const all = [...lead.daily, ...current.daily];
  const daily = current.daily.map((d, i) => {
    const window = all.slice(Math.max(0, lead.daily.length + i - 6), lead.daily.length + i + 1);
    const total = window.reduce((n, x) => n + analyticsCents(String(x.collected)), BigInt(0));
    return { date: String(d.date), collected: String(d.collected), average: analyticsAverage(total, window.length) };
  });
  result.collections = { included: COLLECTIONS_SCOPE, totals: { collected: current.totals.collected, averagePerDay: analyticsAverage(analyticsCents(current.totals.collected), daily.length) }, daily };
  return result;
}

async function methods(pool: Db, verify: StaffVerifier, range: Range) {
  const today = await readOnly(pool, async client => (await clock(client)).calendarDate);
  const from = range === "week" ? weekStart(today) : `${today.slice(0, 7)}-01`;
  const finance = await getFinance(pool, verify, from, today);
  return { range, from, to: today, totals: { cash: finance.totals.cash, gcash: finance.totals.gcash, collected: finance.totals.collected }, components: finance.components };
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
      WHERE b.status IN ('pending','confirmed') AND b.operating_date BETWEEN $1::date AND $2::date AND p.ends_at > $3::timestamptz
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
    case "hero": check(params, ["section"]); return hero(pool, verify, owner);
    case "chart": check(params, ["section", "month"]); return chart(pool, verify, owner, params);
    case "overview": { check(params, ["section", "range"]); const range = rangeParam(params); return overviewPayload(range, await loadOccupancy(pool, od => [range === "week" ? weekStart(od) : `${od.slice(0, 7)}-01`, od])); }
    case "methods": { check(params, ["section", "range"]); if (!owner) throw new Error("FORBIDDEN"); return methods(pool, verify, rangeParam(params)); }
    case "schedule": check(params, ["section"]); return schedule(pool);
    case "window": check(params, ["section", "date"]); return bookingWindow(pool, params);
    default: return invalid();
  }
}
