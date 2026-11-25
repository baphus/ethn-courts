import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedDate, addDays, bookingDate, gridSlotCount, gridTimes, handoffRanges, toggleSlot, slotDate, slotEndDate, slots, validDate } from "../src/components/booking/ethn-selection.ts";
import { manilaDateStr } from "../src/lib/booking/slots.ts";

test("grid slot counts use the checkout interval and never guess for legacy data", () => {
  assert.equal(gridSlotCount(0, 60), 0);
  assert.equal(gridSlotCount(30, 30), 1);
  assert.equal(gridSlotCount(180, 60), 3);
  assert.equal(gridSlotCount(180, 30), 6);
  assert.equal(gridSlotCount(360, 60), 6);
  assert.equal(gridSlotCount(45, 30), undefined);
  assert.equal(gridSlotCount(180), undefined);
});

test("landing default date rolls over at Manila midnight and matches the returned schedule", () => {
  const before = manilaDateStr(new Date("2026-11-19T15:59:59Z"));
  const after = manilaDateStr(new Date("2026-11-19T16:00:00Z"));
  assert.equal(before, "2026-11-19");
  assert.equal(acceptedDate(after, "2026-11-20", false), "2026-11-20");
});

test("booking date requires an accepted explicit date and displays Manila overnight dates", () => {
  assert.equal(acceptedDate(undefined, "2026-11-19", false), "");
  assert.equal(acceptedDate("2026-11-19", "2026-11-19", false), "2026-11-19");
  assert.equal(acceptedDate("2026-11-19", "2026-11-19", true), "");
  assert.equal(acceptedDate("2026-11-20", "2026-11-19", false), "");
  assert.equal(acceptedDate("2026-02-30", "2026-02-30", false), "");
  assert.match(bookingDate("2026-11-19"), /Thursday.*November.*19.*2026/);
  assert.notEqual(slotDate(Date.parse("2026-11-19T15:30:00Z")), slotDate(Date.parse("2026-11-19T16:30:00Z")));
});

test("day navigation crosses month and year boundaries in both directions", () => {
  assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
});

test("time rows show an end date only when they cross Manila midnight", () => {
  const start = Date.parse("2026-11-24T15:00:00Z");
  assert.equal(slotEndDate(start, Date.parse("2026-11-24T15:59:00Z")), "");
  assert.equal(slotEndDate(start, Date.parse("2026-11-24T16:00:00Z")), "Wed, Nov 25");
  assert.equal(slotEndDate(Date.parse("2026-11-24T16:00:00Z"), Date.parse("2026-11-24T17:00:00Z")), "");
});

test("selection stays within one window and never crosses occupied slots", () => {
  const window = { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T03:00:00.000Z", hourlyRate: "100.00" };
  const grid = slots(window, [{ startsAt: "2026-01-01T01:00:00.000Z", endsAt: "2026-01-01T01:30:00.000Z", state: "pending" }], 30, Date.parse(window.opensAt));
  assert.equal(grid[2].available, false);
  assert.equal(slots(window, [], 30, Date.parse("2026-01-01T00:00:01Z"))[0].available, false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(validDate("2026-02-28"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("not-a-date"), false);
  assert.deepEqual(gridTimes([{ ...window, closesAt: "2026-01-01T00:30:00.000Z" }, { ...window, opensAt: "2026-01-01T01:30:00.000Z", closesAt: "2026-01-01T02:00:00.000Z" }], 30, 0), [0, 30, 60, 90].map(minutes => Date.parse(window.opensAt) + minutes * 60000));
});

test("handoff validates both courts against fresh availability and prices", () => {
  const window = { opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T03:00:00.000Z", hourlyRate: "250.00" };
  const availability = { date: "2026-01-01", settings: { intervalMinutes: 30, minimumMinutes: 60 }, courts: ["1", "2"].map(id => ({ id, windows: [window], occupied: [] })) };
  const item = { courtId: "1", start: window.opensAt, end: "2026-01-01T01:00:00.000Z" };
  const raw = JSON.stringify([item, { ...item, courtId: "2" }, { ...item, start: "2026-01-01T02:00:00.000Z", end: window.closesAt }]);
  const query = new URLSearchParams({ date: availability.date, ranges: raw });
  const result = handoffRanges(query.get("ranges")!, query.get("date"), availability, Date.parse(window.opensAt));
  assert.deepEqual(result?.map(r => [r.courtId, r.rate]), [["1", "250.00"], ["2", "250.00"], ["1", "250.00"]]);
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

test("cells toggle independently, merging only selected neighbors in the same window", () => {
  const time = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();
  const toggle = (ranges: Parameters<typeof toggleSlot>[0], minutes: number, court = "1", window = 0) =>
    toggleSlot(ranges, court, window, "100.00", time(minutes), time(minutes + 30));
  const separate = toggle(toggle([], 0), 60);
  assert.deepEqual(separate.map(r => [r.start, r.end]), [[time(0), time(30)], [time(60), time(90)]]);
  const joined = toggle(separate, 30);
  assert.deepEqual(joined.map(r => [r.start, r.end]), [[time(0), time(90)]]);
  assert.deepEqual(toggle(joined, 30), separate);
  assert.deepEqual(toggle(toggle(separate, 0), 60), []);
  assert.equal(toggle(joined, 90, "1", 1).length, 2);
  assert.equal(toggle(joined, 30, "2").length, 2);
});
