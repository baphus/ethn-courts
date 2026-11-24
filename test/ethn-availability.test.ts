import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { getAvailability } from "../src/lib/booking/ethn-availability";
import { retiredResponse } from "../src/lib/retired-response";

function fake(rate: string | null = null) {
  const calls: string[] = [];
  const client = { release() {}, async query(sql: string) {
    calls.push(sql);
    if (sql.startsWith("SELECT version")) return { rows: [{ version: "1", interval_minutes: 30, minimum_minutes: 30, anchor_minutes: 420, horizon_days: 30, hold_minutes: 10, merchant: "Merchant", now: new Date("2026-11-19T20:00:00Z") }] };
    if(sql.includes('FROM ethn.payment_methods')) return {rows:[{id:'bank',name:'Bank',instructions:'Pay here',qrAvailable:false,version:'1'}]};
    if (sql.startsWith("SELECT id::text")) return { rows: [{ id: "1", name: "Court" }] };
    if (sql.includes("FROM ethn.court_hours")) return { rows: [{ court_id: "1", weekday: 4, opens: "07:00:00", closes: "03:00:00", hourly_rate: rate }] };
    if (sql.includes("FROM ethn.court_allocations")) return { rows: [{ court_id: "1", starts_at: new Date("2026-11-19T00:00:00Z"), ends_at: new Date("2026-11-19T01:00:00Z"), state: "pending", guest_email: "private@example.com" }] };
    return { rows: [] };
  } };
  return { pool: { connect: async () => client } as unknown as Pick<Pool, "connect">, calls };
}

test("availability exposes overnight windows and private occupancy projection without fallback rates", async () => {
  const f = fake(); const result = await getAvailability(f.pool, null);
  assert.equal(result.operatingDate, "2026-11-19");
  assert.equal(result.configured, false);
  assert.deepEqual(result.courts[0].windows, [{ opensAt: "2026-11-18T23:00:00.000Z", closesAt: "2026-11-19T19:00:00.000Z", hourlyRate: null }]);
  assert(!JSON.stringify(result).includes("private@example.com"));
  assert(f.calls.some(s => s.includes("expires_at > $3") && s.includes("starts_at < $2 AND ends_at > $1")));
  assert.equal((await getAvailability(fake("100.00").pool, null)).configured, true);
  await assert.rejects(getAvailability(fake().pool, "2026-02-30"), /INVALID_INPUT/);
});

test("retired response is uncached 410", async () => {
  const response = retiredResponse();
  assert.equal(response.status, 410); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "RETIRED" });
});
