import assert from "node:assert/strict";
import test from "node:test";
import { courtDetailsVersion, withCourtSchedule } from "../src/app/admin/courts/court-edit-save";
import type { Snapshot } from "../src/app/admin/settings/pricing-payload";

const snapshot = { version: "7", courts: [{ id: "1", name: "Court 1", active: true, hours: [] }, { id: "2", name: "Court 2", active: true, hours: [] }] } as unknown as Snapshot;

test("a per-court save leaves other courts and the original snapshot unchanged", () => {
  const next = withCourtSchedule(snapshot, "1", { active: false });
  assert.equal(next.courts[0].active, false);
  assert.equal(snapshot.courts[0].active, true);
  assert.deepEqual(next.courts[1], snapshot.courts[1]);
});

test("details save only advances the matching schedule version", () => {
  assert.equal(courtDetailsVersion(snapshot, { previousSettingsVersion: "7", settingsVersion: "8" }), "8");
  assert.equal(courtDetailsVersion(snapshot, { previousSettingsVersion: "8", settingsVersion: "9" }), null);
});
