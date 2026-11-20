import test from "node:test";
import assert from "node:assert/strict";
import { settingsPayload, updateMerchant, updateCourtName, updateRate, type Snapshot } from "../src/app/admin/settings/pricing-payload";

test("queued edits preserve both court names, merchant and all rates in payload", () => {
  const initial: Snapshot = { version: "1", merchant: null, intervalMinutes: 30, minimumMinutes: 30, anchorMinutes: 0, horizonDays: 30, holdMinutes: 10, courts: [0, 1].map(ci => ({ id: String(ci), name: `Court ${ci + 1}`, active: true, hours: Array.from({ length: 7 }, (_, hi) => ({ id: `${ci}-${hi}`, weekday: hi, opens: "08:00", closes: "09:00", hourlyRate: null })) })) };
  const updates = [updateCourtName(0, "TEST A"), updateCourtName(1, "TEST B"), updateMerchant("TEST updated"), ...initial.courts.flatMap((c, ci) => c.hours.map((_, hi) => updateRate(ci, hi, "200")))];
  const result = updates.reduce<Snapshot | null>((state, update) => update(state), initial);
  assert.ok(result);
  const payload = settingsPayload(result);
  assert.equal(payload.merchant, "TEST updated");
  assert.deepEqual(payload.courts.map(c => c.name), ["TEST A", "TEST B"]);
  assert.deepEqual(payload.courts.flatMap(c => c.rates.map(r => r.hourlyRate)), Array(14).fill("200"));
  assert.equal(updateCourtName(0, "x")(null), null);
});
