import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getDailyOccupancy, occupancyStarts } from "../src/lib/admin/occupancy";
import type { Db } from "../src/db/client";

test("business day spans 7 AM Manila through next-day 6 AM across year boundary", () => {
  const starts = occupancyStarts("2026-12-31");
  assert.equal(starts.length, 24);
  assert.equal(starts[0], "2026-12-30T23:00:00.000Z");
  assert.equal(starts[23], "2026-12-31T22:00:00.000Z");
});

test("daily data includes occupied inactive courts, holds, closed hours and full booking ranges", async () => {
  const starts = occupancyStarts("2026-12-31");
  const tables: Record<string, Record<string, unknown>[]> = {
    courts: [{ id: "a", name: "A", status: "active" }, { id: "b", name: "B", status: "inactive" }, { id: "c", name: "C", status: "inactive" }],
    booking_slots: [
      { booking_id: "booking", court_id: "b", slot_start: starts[0], state: "approved" },
      { booking_id: "booking", court_id: "b", slot_start: "2027-01-01T23:00:00.000Z", state: "approved" },
    ],
    bookings: [{ id: "booking", full_name: "Customer", tracking_code: "ABCDE", status: "Approved" }],
    holds: [{ court_id: "a", slot_start: starts[1], expires_at: "9999-01-01T00:00:00.000Z" }, { court_id: "a", slot_start: starts[2], expires_at: "2000-01-01T00:00:00.000Z" }],
    operating_hours: [], closures: [],
  };
  const db = { from(table: string) {
    let rows = [...tables[table]!];
    const query = {
      select() { return query; }, order() { return query; }, or() { return query; },
      in(key: string, values: unknown[]) { rows = rows.filter((r) => values.includes(r[key])); return query; },
      gte(key: string, value: string) { rows = rows.filter((r) => String(r[key]) >= value); return query; },
      gt(key: string, value: string) { rows = rows.filter((r) => String(r[key]) > value); return query; },
      lt(key: string, value: string) { rows = rows.filter((r) => String(r[key]) < value); return query; },
      range(from: number, to: number) { rows = rows.slice(from, to + 1); return query; },
      then(resolve: (result: { data: typeof rows; error: null }) => unknown) { return Promise.resolve(resolve({ data: rows, error: null })); },
    };
    return query;
  } } as unknown as Db;
  const data = await getDailyOccupancy(db, "2026-12-31");
  assert.deepEqual(data.courts.map((c) => c.id), ["a", "b"]);
  assert.equal(data.courts[0]!.cells[1]!.state, "Hold");
  assert.equal(data.courts[0]!.cells[2]!.state, "Closed");
  assert.equal(data.courts[1]!.cells[0]!.state, "Approved");
  assert.equal(data.courts[1]!.cells[0]!.booking!.name, "Customer");
  assert.equal(data.courts[1]!.cells[0]!.booking!.starts.length, 2);
});
