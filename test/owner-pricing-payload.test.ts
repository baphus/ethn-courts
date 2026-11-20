import { test } from "node:test";
import assert from "node:assert/strict";
import { settingsPayload } from "../src/app/admin/settings/pricing-payload";

test("settings payload preserves exact rates, all IDs, and blank disables checkout", () => {
  assert.deepEqual(settingsPayload({ version: "9", merchant: "  ", courts: [{ id: "1", name: " Court ", hours: [{ id: "2", hourlyRate: "9999999999.99" }, { id: "3", hourlyRate: "" }] }] }), { version: "9", merchant: null, courts: [{ id: "1", name: "Court", rates: [{ hoursId: "2", hourlyRate: "9999999999.99" }, { hoursId: "3", hourlyRate: null }] }] });
});
