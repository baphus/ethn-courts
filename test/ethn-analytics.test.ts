import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ethnDashboardAnalytics } from "../src/lib/admin/ethn-analytics";
import { scheduleWindows } from "../src/lib/booking/schedule";
import type { Pool } from "pg";

const verify = async () => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
function mock(role: string, now = "2026-11-01T00:00:00Z", withOccupancy = false) {
  const queries: string[] = [];
  let released = 0;
  const pool = { connect: async () => ({ query: async (sql: string) => {
    queries.push(sql);
    if (sql.includes("SELECT role FROM")) return { rows: [{ role }] };
    if (sql.includes("anchor_minutes FROM ethn.settings")) return { rows: [{ now, anchor_minutes: 420 }] };
    if (sql.includes("count(*) FILTER")) return { rows: [{ current: 1, prior: 0 }] };
    if (sql.includes("SELECT id::text AS id, name FROM ethn.courts")) return { rows: withOccupancy ? [{ id: "1", name: "Court 1" }] : [] };
    if (sql.includes("FROM ethn.court_hours")) return { rows: [{ court_id: "1", weekday: 0, opens: "07:00", closes: "08:00", hourly_rate: "100.00" }] };
    if (sql.includes("WITH w AS")) return { rows: [{ court_id: "1", op_date: "2026-11-01", hour_offset: 7, capacity_s: 3600, reserved_s: 1800, blocked_s: 900 }] };
    if (sql.includes("avg(i.duration_minutes)")) return { rows: [{ avg_minutes: 60, n: 1 }] };
    if (sql.includes("WITH parts AS")) return { rows: [{ id: "item:1", booking_id: "booking", guest_name: null, status: "confirmed", operating_date: "2026-11-01", starts_at: now, ends_at: "2026-11-01T01:00:00Z", court: "Court 1" }] };
    if (sql.includes("SELECT 1 FROM ethn.staff_access")) return { rows: [{ '?column?': 1 }] };
    if (sql.includes("transaction_timestamp() AS now")) return { rows: [{ now }] };
    if (sql.includes("revenue AS")) return { rows: [{ date: "2026-11-01", revenue: "12500", expenses: "1000", bookings: 1 }] };
    if (sql.includes("WITH entries AS")) return { rows: [{ id: "cash", name: "Cash", amount: "0.00" }, { id: "metrobank", name: "Metrobank Transfer", amount: "125.50" }, { id: "custom", name: "Custom QR", amount: "0.00" }, { id: "gcash", name: "GCash", amount: "-0.25" }] };
    if (sql.includes("WITH days AS")) return { rows: [{ date: "2026-11-01", bookingcash: "0.00", bookinggcash: "0.00", salescash: "0.00", salesgcash: "0.00", cash: "0.00", gcash: "0.00", other:'0.00', refunds:'0.00', collected: "0.00", expenses: "0.00" }] };
    return { rows: [] };
  }, release: () => { released++; } }) } as unknown as Pick<Pool, "connect">;
  return { pool, queries, releases: () => released };
}

test("staff cannot obtain finance; strict query validation and schedule segments", async () => {
  const db = mock("staff");
  const hero = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero"));
  assert.ok(!("collections" in hero));
  await assert.rejects(ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=methods")), /FORBIDDEN/);
  await assert.rejects(ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero&section=hero")), /INVALID_INPUT/);
  await assert.rejects(ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero&extra=1")), /INVALID_INPUT/);
  await assert.rejects(ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=chart&month=2024-11")), /INVALID_INPUT/);
  const schedule = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=schedule")) as { items: { id: string; bookingId: string }[] };
  assert.deepEqual(schedule.items.map(({ id, bookingId }) => ({ id, bookingId })), [{ id: "item:1", bookingId: "booking" }]);
  const sql = db.queries.find(q => q.includes("WITH parts AS"))!;
  assert.match(sql, /WHERE b\.status = 'confirmed'/);
  assert.match(sql, /p\.starts_at >= \$3/);
  assert.match(sql, /LIMIT 301/); assert.doesNotMatch(sql, /min\(p\.starts_at\)/);
  assert.ok(!db.queries.some(q => q.includes("WITH days AS")));
  assert.ok(db.releases() > 0);
});

test("monthly dashboard counts only confirmed and completed bookings in both periods", async () => {
  const db = mock("staff");
  await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero"));
  const sql = db.queries.find(q => q.includes("AS current") && q.includes("AS prior"))!;
  assert.match(sql, /FROM ethn\.bookings WHERE status IN \('confirmed', 'completed'\) AND operating_date BETWEEN/);
});

test("owner hero uses finance and before-anchor chart remains valid", async () => {
  const db = mock("owner", "2026-10-31T17:00:00Z");
  const hero = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero"));
  assert.ok("collections" in hero);
  assert.deepEqual(hero.bookingRevenue, { todayCents: 12500, monthCents: 12500 });
  const chart = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=chart&month=2026-11"));
  assert.ok("occupancy" in chart);
});

test("dashboard returns configured method names, zero balances, and signed collections", async () => {
  const db = mock("owner", "2026-11-04T02:00:00Z");
  const result = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=methods&range=week"));
  assert.deepEqual(result, {
    range: "week", from: "2026-11-02", to: "2026-11-04", collected: "125.25",
    paymentMethods: [
      { id: "cash", name: "Cash", amount: "0.00" },
      { id: "metrobank", name: "Metrobank Transfer", amount: "125.50" },
      { id: "custom", name: "Custom QR", amount: "0.00" },
      { id: "gcash", name: "GCash", amount: "-0.25" },
    ],
  });
});

test("overview separates booking and block utilization over elapsed capacity", async () => {
  const db = mock("staff", "2026-11-01T02:00:00Z", true);
  const result = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=overview&range=month")) as { kpis: { occupiedPercent: number; reservedHours: number; blockedHours: number; capacityHours: number } };
  assert.equal(result.kpis.occupiedPercent, 50);
  assert.equal(result.kpis.reservedHours, 0.5);
  assert.equal(result.kpis.blockedHours, 0.3);
  assert.equal(result.kpis.capacityHours, 1);
  const sql = db.queries.find(q => q.includes("WITH w AS"))!;
  assert.match(sql, /a\.block_id IS NULL AND a\.state IN \('pending','confirmed','completed'\)/);
  assert.match(sql, /a\.block_id IS NOT NULL AND a\.state = 'confirmed'/);
  assert.doesNotMatch(sql, /'held'/);
});

test("opening windows preserve one-hour and overnight actual duration", () => {
  const hours = [{ court_id: "1", weekday: 0, opens: "23:00", closes: "00:00", hourly_rate: "1.00" }];
  const result = scheduleWindows("2026-11-01", 420, "1", hours);
  assert.ok("windows" in result);
  assert.equal(result.windows[0].closes - result.windows[0].opens, 3_600_000);
});
