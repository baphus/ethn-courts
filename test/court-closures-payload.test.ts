import assert from "node:assert/strict";
import test from "node:test";
import { closurePayload } from "../src/app/admin/courts/use-court-closures";

const courts = [{ id: "1", name: "Court 1", active: true }, { id: "2", name: "Court 2", active: true }, { id: "3", name: "Court 3", active: false }];
const input = { courtIds: ["1", "2"], kind: "maintenance" as const, reason: " Floor repair ", startDate: "2026-12-01", startTime: "23:00", endDate: "2026-12-02", endTime: "01:00" };

test("closure payload preserves selected courts and converts overnight Manila times", () => {
  assert.deepEqual(closurePayload(input, courts), { courtIds: ["1", "2"], kind: "maintenance", reason: "Floor repair", startsAt: "2026-12-01T15:00:00.000Z", endsAt: "2026-12-01T17:00:00.000Z" });
});

test("closure payload rejects inactive courts, backwards ranges and blank reasons", () => {
  assert.throws(() => closurePayload({ ...input, courtIds: ["3"] }, courts), /active court/);
  assert.throws(() => closurePayload({ ...input, endDate: input.startDate }, courts), /End must be after start/);
  assert.throws(() => closurePayload({ ...input, reason: " " }, courts), /Enter a reason/);
});
