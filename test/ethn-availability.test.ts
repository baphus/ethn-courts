import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { getAvailability, getMonthAvailability } from "../src/lib/booking/ethn-availability";
import { availabilityCache } from "../src/components/booking/ethn-availability-cache";
import { retiredResponse } from "../src/lib/retired-response";

function fake(rate: string | null = null) {
  const calls: string[] = [];
  const allocationBounds: unknown[][] = [];
  const client = { release() {}, async query(sql: string, params: unknown[] = []) {
    calls.push(sql);
    if (sql.startsWith("SELECT version")) return { rows: [{ version: "1", interval_minutes: 30, minimum_minutes: 30, anchor_minutes: 420, horizon_days: 30, hold_minutes: 10, merchant: "Merchant", now: new Date("2026-11-19T20:00:00Z") }] };
    if(sql.includes('FROM ethn.payment_methods')) return {rows:[{id:'bank',name:'Bank',instructions:'Pay here',qrAvailable:false,version:'1'}]};
    if (sql.startsWith("SELECT id::text")) return { rows: [{ id: "1", name: "Court" }] };
    if (sql.includes("FROM ethn.court_hours")) return { rows: [{ court_id: "1", weekday: 4, opens: "07:00:00", closes: "03:00:00", hourly_rate: rate }] };
    if (sql.includes("FROM ethn.court_allocations")) {
      allocationBounds.push(params);
      return { rows: [
        { court_id: "1", starts_at: new Date("2026-11-19T00:00:00Z"), ends_at: new Date("2026-11-19T01:00:00Z"), state: "pending", guest_email: "private@example.com" },
        { court_id: "1", starts_at: new Date("2026-11-19T22:00:00Z"), ends_at: new Date("2026-11-20T00:00:00Z"), state: "blocked" },
      ] };
    }
    return { rows: [] };
  } };
  return { pool: { connect: async () => client } as unknown as Pick<Pool, "connect">, calls, allocationBounds };
}

test("availability exposes overnight windows and private occupancy projection without fallback rates", async () => {
  const f = fake(); const result = await getAvailability(f.pool, null);
  assert.equal(result.operatingDate, "2026-11-19");
  assert.equal(result.configured, false);
  assert.deepEqual(result.courts[0].windows, [{ opensAt: "2026-11-18T23:00:00.000Z", closesAt: "2026-11-19T19:00:00.000Z", hourlyRate: null }]);
  assert(!JSON.stringify(result).includes("private@example.com"));
  const sql = f.calls.find(s => s.includes("FROM ethn.court_allocations"))!;
  assert.match(sql, /state IN \('held','pending','confirmed','completed'\)/);
  assert.match(sql, /tstzrange\(a\.starts_at, a\.ends_at, '\[\)'\) && tstzrange\(\$1::timestamptz, \$2::timestamptz, '\[\)'\)/);
  assert.match(sql, /b\.id = COALESCE\(i\.booking_id, e\.booking_id\)/);
  assert.match(sql, /b\.archived_at IS NULL/);
  assert.match(sql, /a\.state <> 'held' OR a\.expires_at > \$3/);
  assert.equal((await getAvailability(fake("100.00").pool, null)).configured, true);
  await assert.rejects(getAvailability(fake().pool, "2026-02-30"), /INVALID_INPUT/);
});

test("month reads occupancy once and projects it across Manila operating days", async () => {
  const f = fake("100.00");
  const snapshot = await getMonthAvailability(f.pool, "2026-11");
  assert.equal(f.calls.filter(s => s.includes("FROM ethn.court_allocations")).length, 1);
  assert.deepEqual(f.allocationBounds[0].slice(0, 2), [new Date("2026-11-18T23:00:00Z"), new Date("2026-11-30T23:00:00Z")]);
  const { days, ...shared } = snapshot;
  assert.equal(days.length, 12);
  assert.deepEqual({ ...shared, ...days[0] }, await getAvailability(f.pool, "2026-11-19"));
  assert.deepEqual(days.slice(0, 3).map(day => day.courts[0].occupied.map(row => row.state)), [["pending", "blocked"], ["blocked"], []]);
  assert(!JSON.stringify(snapshot).includes("private@example.com"));
  const december = await getMonthAvailability(f.pool, "2026-12");
  assert.equal(december.days.at(-1)?.date, "2026-12-18");
  await assert.rejects(getMonthAvailability(f.pool, "2027-01"), /INVALID_INPUT/);
});

test("month cache reuses sibling days without resetting the clock or extending freshness", () => {
  let now = 100;
  const cache = availabilityCache(() => now);
  cache.put("2026-11", { serverNow: "2026-11-19T20:00:00.000Z", days: [{ date: "2026-11-19" }, { date: "2026-11-20" }] });
  now += 29_999;
  assert.equal(cache.get("2026-11-19")?.monotonic, 100);
  assert.equal(cache.get("2026-11-20")?.monotonic, 100);
  assert.equal(cache.get("2026-12-01"), undefined);
  now++;
  assert.equal(cache.get("2026-11-20"), undefined);
  cache.put("2026-11", { serverNow: "2026-11-19T20:00:31.000Z", days: [{ date: "2026-11-20" }] });
  cache.clear();
  assert.equal(cache.get("2026-11-20"), undefined);
});

test("booking date loader fetches once per fresh month and refetches after invalidation", async () => {
  const cache = availabilityCache(() => 100);
  const requests: string[] = [];
  const request: typeof fetch = async input => {
    const url = String(input);
    requests.push(url);
    const month = url.split("=")[1];
    return Response.json({ serverNow: "2026-11-19T20:00:00.000Z", days: [19, 20].map(day => ({ date: `${month}-${day}` })) });
  };
  assert.equal((await cache.load("2026-11-19", undefined, request))?.data.date, "2026-11-19");
  assert.equal((await cache.load("2026-11-20", undefined, request))?.data.date, "2026-11-20");
  await cache.load("2026-12-19", undefined, request);
  cache.clear();
  await cache.load("2026-12-20", undefined, request);
  assert.deepEqual(requests, ["/api/ethn/availability?month=2026-11", "/api/ethn/availability?month=2026-12", "/api/ethn/availability?month=2026-12"]);
});

test("retired response is uncached 410", async () => {
  const response = retiredResponse();
  assert.equal(response.status, 410); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "RETIRED" });
});
