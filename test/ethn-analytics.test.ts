import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ethnDashboardAnalytics } from "../src/lib/admin/ethn-analytics";
import type { ChartData, HeroStatsData } from "../src/app/admin/dashboard-analytics-types";
import { scheduleWindows } from "../src/lib/booking/schedule";
import type { Pool } from "pg";

const verify = async () => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
function mock(role: string, now = "2026-11-01T00:00:00Z", withOccupancy = false) {
  const queries: string[] = [];
  let released = 0;
  const pool = { connect: async () => ({ query: async (sql: string, args?: string[]) => {
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
    if (sql.includes("WITH receipts AS") && sql.includes("methods AS")) return { rows: [{ id: "cash", name: "Cash", amount: "0.00" }, { id: "metrobank", name: "Metrobank Transfer", amount: "125.50" }, { id: "custom", name: "Custom QR", amount: "0.00" }, { id: "gcash", name: "GCash", amount: "0.25" }] };
    if (sql.includes("WITH receipts AS")) {
      return { rows: ["2026-10-31", "2026-11-01"].filter(date => args && date >= args[0] && date <= args[1]).map(date => ({ date, collected: "100.00" })) };
    }
    return { rows: [] };
  }, release: () => { released++; } }) } as unknown as Pick<Pool, "connect">;
  return { pool, queries, releases: () => released };
}

test("staff cannot obtain finance; strict query validation and schedule segments", async () => {
  const db = mock("staff");
  const hero = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero"));
  assert.ok(!("collections" in hero));
  assert.ok(!("bookingCollections" in hero));
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
  assert.ok(!db.queries.some(q => q.includes("WITH receipts AS")));
  assert.ok(db.releases() > 0);
});

test("monthly dashboard counts only confirmed and completed bookings in both periods", async () => {
  const db = mock("staff");
  await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero"));
  const sql = db.queries.find(q => q.includes("AS current") && q.includes("AS prior"))!;
  assert.match(sql, /FROM ethn\.bookings WHERE status IN \('confirmed', 'completed'\) AND operating_date BETWEEN/);
});

test("owner dashboard uses the same approved original payments for hero and chart", async () => {
  const db = mock("owner", "2026-10-31T17:00:00Z");
  const hero = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=hero")) as HeroStatsData;
  assert.equal(hero.collections?.today, "100.00");
  assert.equal(hero.collections?.month, "100.00");
  assert.equal(db.queries.filter(q => q.includes("WITH receipts AS")).length, 2);
  const chart = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=chart&month=2026-11")) as ChartData;
  assert.ok("occupancy" in chart);
  assert.equal(chart.collections?.totals.collected, "100.00");
  assert.deepEqual(chart.collections?.daily.map(day => day.date), ["2026-11-01"]);
  const sql = db.queries.filter(q => q.includes("WITH receipts AS"));
  assert.equal(sql.length, 3);
  for (const query of sql) {
    assert.match(query, /p\.status='accepted' AND p\.extension_id IS NULL AND b\.status IN \('confirmed','completed'\)/);
    assert.match(query, /p\.verified_at >= .*Asia\/Manila/);
    assert.doesNotMatch(query, /received_at|ethn\.sales/);
  }
});

test("dashboard returns configured method names, zero balances, and approved collections", async () => {
  const db = mock("owner", "2026-11-04T02:00:00Z");
  const result = await ethnDashboardAnalytics(db.pool, verify, new URLSearchParams("section=methods&range=week"));
  const sql = db.queries.find(query => query.includes("WITH receipts AS"))!;
  assert.match(sql, /p\.status='accepted' AND p\.extension_id IS NULL AND b\.status IN \('confirmed','completed'\)/);
  assert.match(sql, /p\.verified_at >= .*Asia\/Manila/);
  assert.doesNotMatch(sql, /received_at|ethn\.sales/);
  assert.deepEqual(result, {
    range: "week", from: "2026-11-02", to: "2026-11-04", collected: "125.75",
    paymentMethods: [
      { id: "cash", name: "Cash", amount: "0.00" },
      { id: "metrobank", name: "Metrobank Transfer", amount: "125.50" },
      { id: "custom", name: "Custom QR", amount: "0.00" },
      { id: "gcash", name: "GCash", amount: "0.25" },
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
  assert.match(sql, /booking\.status IN \('confirmed','completed'\) AND a\.state IN \('confirmed','completed'\)/);
  assert.match(sql, /a\.block_id IS NOT NULL AND a\.state = 'confirmed'/);
  assert.doesNotMatch(sql, /'held'|'pending'/);
});

test("opening windows preserve one-hour and overnight actual duration", () => {
  const hours = [{ court_id: "1", weekday: 0, opens: "23:00", closes: "00:00", hourly_rate: "1.00" }];
  const result = scheduleWindows("2026-11-01", 420, "1", hours);
  assert.ok("windows" in result);
  assert.equal(result.windows[0].closes - result.windows[0].opens, 3_600_000);
});
