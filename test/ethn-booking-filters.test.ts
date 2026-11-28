import test from "node:test";
import assert from "node:assert/strict";
import { parseFilters, serializeFilters } from "../src/app/admin/bookings/booking-filters";

test("booking URL filters round trip and reject invalid bounds", () => {
  assert.deepEqual(parseFilters(new URLSearchParams("status=held&status=expired")).status, []);
  assert.deepEqual(parseFilters(new URLSearchParams("status=confirmed")).status, ["confirmed"]);
  assert.deepEqual(parseFilters(new URLSearchParams("status=completed&status=cancelled&status=refunded")).status, ["refunded"]);
  const filters = parseFilters(new URLSearchParams("q=Jane&status=confirmed&status=pending&status=confirmed&archived=all&from=2026-01-01&to=2026-02-01&page=42"));
  assert.equal(filters.q, "");
  assert.deepEqual(filters.status, ["confirmed", "pending"]);
  assert.equal(new URLSearchParams(serializeFilters(filters)).has("archived"), false);
  assert.equal(new URLSearchParams(serializeFilters({ ...filters, q: "Jane" })).has("q"), false);
  assert.deepEqual(parseFilters(new URLSearchParams(serializeFilters(filters))), filters);
  assert.deepEqual(parseFilters(new URLSearchParams("status=unknown&from=2026-02-30&to=2026-01-01&page=1001")), { q: "", status: [], from: "", to: "", page: 1 });
  assert.equal(parseFilters(new URLSearchParams("from=2026-02-02&to=2026-02-01&page=0")).page, 1);
});
