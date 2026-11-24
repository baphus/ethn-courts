import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Pool } from "pg";
import { createCheckout } from "../src/lib/booking/checkout";

const input = { ownerToken: "123e4567-e89b-42d3-a456-426614174000", idempotencyKey: "key", date: "2026-11-20", ranges: [{ courtId: "1", start: "2026-11-20T00:00:00.000Z", end: "2026-11-20T00:30:00.000Z" }], displayedTotal: "50.51", displayedVersion: "1" };
function fake(options: { replay?: unknown; mismatch?: boolean; incomplete?: boolean; merchant?: string | null; rate?: string | null; fail?: string; failSecondAllocation?: boolean; failRollback?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  let fingerprint = "", released = false, discarded = false, allocations = 0;
  const client = { release(discard?: boolean) { released = true; discarded = !!discard; }, async query(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    if (sql.startsWith("INSERT INTO ethn.court_allocations")) allocations++;
    if (options.failRollback && sql === "ROLLBACK") throw new Error("rollback failure");
    if (options.failSecondAllocation && allocations === 2 && sql.startsWith("INSERT INTO ethn.court_allocations")) throw Object.assign(new Error("second allocation failure"), { code: "23P01" });
    if (options.fail && sql.includes(options.fail)) throw Object.assign(new Error("failure"), options.fail === "INSERT INTO ethn.court_allocations" ? { code: "23P01" } : {});
    if (sql.startsWith("INSERT INTO ethn.idempotency")) { fingerprint = params[2] as string; return { rows: options.replay || options.incomplete ? [] : [{ key: "key" }] }; }
    if (sql.startsWith("SELECT fingerprint")) return { rows: [{ fingerprint: options.mismatch ? "other" : fingerprint, result: options.replay ?? null }] };
    if (sql.startsWith("SELECT version")) return { rows: [{ version: "1", interval_minutes: 30, minimum_minutes: 30, anchor_minutes: 420, horizon_days: 30, hold_minutes: 10, merchant: options.merchant === undefined ? "merchant" : options.merchant }] };
    if (sql.includes('FROM ethn.payment_methods')) return {rows: options.merchant === null || options.merchant === '' ? [] : [{id:'bank',name:'Bank',instructions:'Pay here',qrAvailable:false,version:'1'}]};
    if (sql.startsWith("SELECT id::text")) return { rows: [{ id: "1", active: true }, { id: "2", active: true }] };
    if (sql.startsWith("SELECT court_id::text")) return { rows: [{ court_id: "1", weekday: 5, opens: "07:00:00", closes: "03:00:00", hourly_rate: options.rate === undefined ? "101.01" : options.rate }, { court_id: "2", weekday: 5, opens: "07:00:00", closes: "03:00:00", hourly_rate: "120.00" }] };
    if (sql.startsWith("SELECT DISTINCT")) return { rows: [{ id: "123e4567-e89b-42d3-a456-426614174001" }] };
    if (sql.startsWith("SELECT clock_timestamp() AS")) return { rows: [{ now: new Date("2026-11-19T23:00:00.000Z") }] };
    if (sql.startsWith("UPDATE ethn.bookings")) return { rows: [{ id: "123e4567-e89b-42d3-a456-426614174001" }] };
    if (sql.startsWith("SELECT clock_timestamp() +")) return { rows: [{ expires_at: new Date("2026-11-19T23:10:00.000Z") }] };
    return { rows: [] };
  } };
  return { pool: { connect: async () => client } as unknown as Pick<Pool, "connect">, calls, released: () => released, discarded: () => discarded };
}

test("checkout freezes exact price, deadline and expires whole overlapping booking", async () => {
  const f = fake(); const result = await createCheckout(f.pool, input);
  assert.equal(result.total, "50.51"); assert.equal(result.items[0].rate, "101.01"); assert.equal(result.expiresAt, "2026-11-19T23:10:00.000Z"); assert.equal(result.priceChanged, false);
  assert.doesNotThrow(() => JSON.stringify(result));
  const expiry = f.calls.find(c => c.sql.startsWith("UPDATE ethn.court_allocations SET state"))!;
  assert.match(expiry.sql, /booking_id = ANY/); assert.deepEqual(expiry.params, [["123e4567-e89b-42d3-a456-426614174001"]]);
  const booking = f.calls.find(c => c.sql.startsWith("INSERT INTO ethn.bookings"))!;
  assert.equal(booking.params[4], "50.51"); assert.equal(booking.params[5], true); assert.equal(booking.params[6], "merchant");
  assert(!JSON.stringify(f.calls).includes(input.ownerToken)); assert(f.released());
});
test("completed result replays before settings and expiry", async () => {
  const f = fake({ replay: { checkoutId: "old" } }); assert.deepEqual(await createCheckout(f.pool, input), { checkoutId: "old" });
  assert(!f.calls.some(c => c.sql.startsWith("SELECT version"))); assert(f.released());
});
test("mismatch and incomplete keys roll back", async () => {
  for (const options of [{ mismatch: true }, { incomplete: true }]) { const f = fake(options); await assert.rejects(createCheckout(f.pool, input), /IDEMPOTENCY_/); assert(f.calls.some(c => c.sql === "ROLLBACK")); }
});
test("missing merchant and rate fail closed", async () => {
  for (const options of [{ merchant: null }, { rate: null }]) { const f = fake(options); await assert.rejects(createCheckout(f.pool, input), /NOT_CONFIGURED|INVALID_RATE/); assert(f.calls.some(c => c.sql === "ROLLBACK")); }
});
test("exclusion rolls back and commit uncertainty releases without retry", async () => {
  const f = fake({ fail: "INSERT INTO ethn.court_allocations" }); await assert.rejects(createCheckout(f.pool, input), /SLOT_TAKEN/); assert(f.calls.some(c => c.sql === "ROLLBACK")); assert(f.released());
  const g = fake({ fail: "COMMIT" }); await assert.rejects(createCheckout(g.pool, input), /failure/); assert(!g.calls.some(c => c.sql === "ROLLBACK")); assert(g.released()); assert(g.discarded());
  const h = fake({ fail: "INSERT INTO ethn.bookings", failRollback: true }); await assert.rejects(createCheckout(h.pool, input), /^Error: failure$/); assert(h.released()); assert(h.discarded());
  const replay = fake({ replay: { checkoutId: "old" }, fail: "COMMIT" }); await assert.rejects(createCheckout(replay.pool, input), /failure/); assert(replay.discarded());
});

const twoCourts = { ...input, displayedTotal: "170.51", ranges: [input.ranges[0], { courtId: "2", start: "2026-11-20T01:00:00.000Z", end: "2026-11-20T02:00:00.000Z" }] };
test("two courts freeze separate items and follow lock and write order", async () => {
  const f = fake(); const result = await createCheckout(f.pool, twoCourts);
  assert.deepEqual(result.items.map((i: { courtId: string; rate: string; amount: string; minutes: number }) => [i.courtId, i.rate, i.amount, i.minutes]), [["1", "101.01", "50.51", 30], ["2", "120.00", "120.00", 60]]);
  assert.equal(result.total, "170.51"); assert(!f.discarded());
  const items = f.calls.filter(c => c.sql.startsWith("INSERT INTO ethn.booking_items"));
  const allocations = f.calls.filter(c => c.sql.startsWith("INSERT INTO ethn.court_allocations"));
  assert.deepEqual(items.map(c => [c.params[2], c.params[5], c.params[6], c.params[7]]), [["1", "101.01", 30, "50.51"], ["2", "120.00", 60, "120.00"]]);
  assert.deepEqual(allocations.map(c => [c.params[1], c.params[2]]), items.map(c => [c.params[0], c.params[2]]));
  const at = (prefix: string) => f.calls.findIndex(c => c.sql.startsWith(prefix));
  const order = ["INSERT INTO ethn.idempotency", "SELECT fingerprint", "SELECT version", "SELECT id::text", "SELECT DISTINCT", "SELECT id FROM ethn.bookings", "SELECT clock_timestamp() AS", "UPDATE ethn.bookings", "UPDATE ethn.court_allocations SET state", "INSERT INTO ethn.bookings", "UPDATE ethn.idempotency SET result", "COMMIT"].map(at);
  assert(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])));
  assert.match(f.calls[at("SELECT id::text")].sql, /ORDER BY id FOR UPDATE/);
  const candidate = f.calls[at("SELECT DISTINCT")]; assert.deepEqual(candidate.params, [["1", "2"], twoCourts.ranges.map(r => r.start), twoCourts.ranges.map(r => r.end)]);
  assert(!JSON.stringify(f.calls).includes(input.ownerToken));
  assert.match(f.calls[at("INSERT INTO ethn.idempotency")].params[0] as string, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(f.calls[at("UPDATE ethn.idempotency SET result")].params[3] as string), result);
});
test("second allocation failure rolls back without completed result", async () => {
  const f = fake({ failSecondAllocation: true }); await assert.rejects(createCheckout(f.pool, twoCourts), /SLOT_TAKEN/);
  assert.equal(f.calls.filter(c => c.sql.startsWith("INSERT INTO ethn.court_allocations")).length, 2);
  assert(f.calls.some(c => c.sql === "ROLLBACK")); assert(!f.calls.some(c => c.sql === "COMMIT" || c.sql.startsWith("UPDATE ethn.idempotency SET result")));
  assert(f.released()); assert(!f.discarded());
});
test("changed estimate or version requires acknowledgement", async () => {
  for (const changed of [{ displayedTotal: "1.00" }, { displayedVersion: "2" }]) {
    const f = fake(); const result = await createCheckout(f.pool, { ...input, ...changed });
    assert.equal(result.priceChanged, true); assert.equal(result.acknowledgementRequired, true);
    assert.equal(f.calls.find(c => c.sql.startsWith("INSERT INTO ethn.bookings"))!.params[5], false);
  }
});
test("replay returns exact frozen result without new deadline", async () => {
  const original = await createCheckout(fake().pool, twoCourts);
  const f = fake({ replay: original }); assert.deepEqual(await createCheckout(f.pool, twoCourts), original);
  assert(!f.calls.some(c => c.sql.startsWith("SELECT clock_timestamp"))); assert(!f.discarded());
});
