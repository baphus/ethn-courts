import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, gridTimes, handoffRanges, selectRange, slots, validDate } from "../src/components/booking/ethn-selection.ts";

test("selection stays within one window and never crosses occupied slots", () => {
  const window = { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T03:00:00.000Z", hourlyRate: "100.00" };
  const grid = slots(window, [{ startsAt: "2026-01-01T01:00:00.000Z", endsAt: "2026-01-01T01:30:00.000Z", state: "pending" }], 30, Date.parse(window.opensAt));
  const first = selectRange("1", 0, window, grid, 0);
  assert.equal(selectRange("1", 0, window, grid, 1, first)?.end, "2026-01-01T01:00:00.000Z");
  assert.equal(selectRange("1", 0, window, grid, 3, first)?.start, "2026-01-01T01:30:00.000Z");
  assert.equal(selectRange("1", 1, window, grid, 1, first)?.start, "2026-01-01T00:30:00.000Z");
  assert.equal(slots(window, [], 30, Date.parse("2026-01-01T00:00:01Z"))[0].available, false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(validDate("2026-02-28"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("not-a-date"), false);
  const otherCourt = selectRange("2", 0, window, grid, 1);
  assert.equal(otherCourt?.courtId, "2");
  assert.equal(first?.courtId, "1");
  assert.deepEqual(gridTimes([{ ...window, closesAt: "2026-01-01T00:30:00.000Z" }, { ...window, opensAt: "2026-01-01T01:30:00.000Z", closesAt: "2026-01-01T02:00:00.000Z" }], 30, 0), [0, 30, 60, 90].map(minutes => Date.parse(window.opensAt) + minutes * 60000));
});

test("handoff validates both courts against fresh availability and prices", () => {
  const window = { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T03:00:00.000Z", hourlyRate: "250.00" };
  const availability = { date: "2026-01-01", settings: { intervalMinutes: 30, minimumMinutes: 60 }, courts: ["1", "2"].map(id => ({ id, windows: [window], occupied: [] })) };
  const item = { courtId: "1", start: window.opensAt, end: "2026-01-01T01:00:00.000Z" };
  const raw = JSON.stringify([item, { ...item, courtId: "2" }]);
  const query = new URLSearchParams({ date: availability.date, ranges: raw });
  const result = handoffRanges(query.get("ranges")!, query.get("date"), availability, Date.parse(window.opensAt));
  assert.deepEqual(result?.map(r => [r.courtId, r.rate]), [["1", "250.00"], ["2", "250.00"]]);
  assert.equal(handoffRanges("{", availability.date, availability, 0), null);
  assert.equal(handoffRanges(JSON.stringify([item, item]), availability.date, availability, 0), null);
  assert.equal(handoffRanges(JSON.stringify([{ ...item, start: "2026-01-01T00:15:00.000Z" }]), availability.date, availability, 0), null);
  assert.equal(handoffRanges(JSON.stringify([{ ...item, end: "2026-01-01T00:30:00.000Z" }]), availability.date, availability, 0), null);
  assert.equal(handoffRanges(raw, "2026-01-02", availability, 0), null);
  assert.equal(handoffRanges(raw, availability.date, availability, Date.parse(window.opensAt) + 1), null);
  assert.equal(handoffRanges(raw, availability.date, { ...availability, courts: [{ ...availability.courts[0], occupied: [{ startsAt: item.start, endsAt: item.end, state: "held" }] }, availability.courts[1]] }, 0), null);
  assert.equal(handoffRanges(raw, availability.date, { ...availability, courts: [{ ...availability.courts[0], windows: [{ ...window, hourlyRate: null }] }, availability.courts[1]] }, 0), null);
});

test("grid hides starts before server time, retaining exact boundary and future slots", () => {
  const window = { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T02:00:00.000Z", hourlyRate: "100.00" };
  const start = Date.parse(window.opensAt), step = 30 * 60_000;
  assert.deepEqual(gridTimes([window], 30, start + step), [start + step, start + 2 * step, start + 3 * step]);
  assert.deepEqual(gridTimes([window], 30, start + step + 1), [start + 2 * step, start + 3 * step]);
  assert.deepEqual(gridTimes([window], 30, start - 1), [start, start + step, start + 2 * step, start + 3 * step]);
  assert.deepEqual(gridTimes([window], 30, start + 4 * step), []);
});

test("selected cells trim or clear the range without crossing gaps", () => {
  const window = { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T03:00:00.000Z", hourlyRate: "100.00" };
  const grid = slots(window, [{ startsAt: "2026-01-01T02:00:00.000Z", endsAt: "2026-01-01T02:30:00.000Z", state: "pending" }], 30, Date.parse(window.opensAt));
  const first = selectRange("1", 0, window, grid, 0);
  const extended = selectRange("1", 0, window, grid, 3, first);
  assert.equal(extended?.end, "2026-01-01T02:00:00.000Z");
  const trimmed = selectRange("1", 0, window, grid, 2, extended);
  assert.equal(trimmed?.end, "2026-01-01T01:00:00.000Z");
  assert.equal(selectRange("1", 0, window, grid, 0, trimmed), undefined);
  const afterGap = selectRange("1", 0, window, grid, 5, extended);
  assert.equal(afterGap?.start, "2026-01-01T02:30:00.000Z");
  assert.equal(afterGap?.end, "2026-01-01T03:00:00.000Z");
});
