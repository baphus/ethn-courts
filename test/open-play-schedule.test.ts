import test from "node:test";
import assert from "node:assert/strict";
import { formatCountdown, getSchedule, type OpenPlay } from "../src/app/open-plays/schedule";

const now = Date.parse("2026-11-26T10:00:00.000Z");
const minute = 60_000;
const event = (id: string, start: number, end: number, fee: string | null = "0"): OpenPlay => ({
  id, title: id, startsAt: new Date(now + start * minute).toISOString(), endsAt: new Date(now + end * minute).toISOString(),
  fee, description: "", courtNames: ["Court 1"], courtIds: ["1"], version: 1,
});

test("the next session rolls into live at start and leaves at end without a reload", () => {
  const events = [event("first", 0, 60), event("second", 60, 120, null)];
  const before = getSchedule(events, now - 1);
  assert.equal(before.upcoming[0].id, "first");
  assert.equal(before.nextChange, now);
  const started = getSchedule(events, now);
  assert.equal(started.upcoming[0].id, "second");
  assert.equal(started.live[0].id, "first");
  assert.equal(started.nextChange, now + 60 * minute);
  const after = getSchedule(events, now + 120 * minute);
  assert.deepEqual(after.upcoming, []);
  assert.deepEqual(after.live, []);
  assert.deepEqual(after.past.map(e => e.id), ["first"]);
});

test("history is limited to the latest five venue sessions by end time", () => {
  const events = Array.from({ length: 6 }, (_, i) => event(String(i), -20 + i, -1 - i));
  assert.deepEqual(getSchedule(events, now).past.map(e => e.id), ["0", "1", "2", "3", "4"]);
});

test("countdown shows days, hours, and minutes without showing zero at the start boundary", () => {
  assert.equal(formatCountdown((1440 + 60 + 2) * minute), "Starts in 1 day 1 hour 2 minutes");
  assert.equal(formatCountdown(minute), "Starts in 1 minute");
  assert.equal(formatCountdown(minute - 1), "Starts in less than a minute");
});
