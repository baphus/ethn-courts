import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardCache } from "../src/components/admin/dashboard/dashboard-cache.ts";

test("dashboard cache isolates owners and queries, expires at 30 seconds, and supports retry", () => {
  const owner = createDashboardCache();
  const anotherOwner = createDashboardCache();
  const month = "/api/ethn/admin/dashboard/analytics?section=overview&range=month";
  const week = month.replace("month", "week");
  owner.write(month, { count: 4 }, 1_000);
  assert.deepEqual(owner.read(month, 30_999), { count: 4 });
  assert.equal(owner.read(month, 31_000), undefined);
  assert.equal(owner.read(week, 2_000), undefined);
  assert.equal(anotherOwner.read(month, 2_000), undefined);
  owner.delete(month);
  assert.equal(owner.read(month, 2_000), undefined);
});

test("an access denial drops every filter and blocks late responses until a new session", () => {
  for (const status of [401, 403]) {
    const cache = createDashboardCache();
    const seen: number[] = [];
    const unsubscribe = cache.subscribe(() => seen.push(cache.denial()));
    cache.write("month", 1, 0);
    cache.write("week", 2, 0);
    cache.deny(503);
    assert.equal(cache.read("week", 1), 2);
    cache.deny(status);
    cache.write("week", 3, 1);
    assert.equal(cache.read("month", 2), undefined);
    assert.equal(cache.read("week", 2), undefined);
    assert.deepEqual(seen, [status]);
    unsubscribe();
    assert.equal(createDashboardCache().denial(), 0);
  }
});

test("finance writes invalidate cached reports and all list filters for the owner", () => {
  const cache = createDashboardCache();
  const seen: number[] = [];
  const unsubscribe = cache.subscribe(() => seen.push(cache.revision()));
  const urls = ["/finance?basis=cash", "/finance?basis=approval", "/expenses?page=2", "/sales?from=2026-11-01"];
  for (const url of urls) cache.write(url, { value: 1 }, 0);
  cache.invalidate();
  for (const url of urls) assert.equal(cache.read(url, 1), undefined);
  assert.deepEqual(seen, [1]);
  unsubscribe();
  cache.write(urls[0], { value: 2 }, 1);
  assert.deepEqual(cache.read(urls[0], 2), { value: 2 });
});

test("dashboard cache bounds retained query results", () => {
  const cache = createDashboardCache();
  for (let i = 0; i < 65; i++) cache.write(String(i), i, 0);
  assert.equal(cache.read("0", 1), undefined);
  assert.equal(cache.read("64", 1), 64);
});
