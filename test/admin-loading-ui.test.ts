import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("bookings and finance keep labels visible while loading values", () => {
  const bookings = source("app/admin/bookings/bookings-view.tsx");
  assert.match(bookings, /<div role="region" aria-label="Booking results table" tabIndex=\{0\} className="overflow-x-auto[^"]*"><table/);
  assert.match(bookings, /<thead[^\n]+<tbody[^\n]+aria-busy=\{loading\}[^\n]+<Skeleton/);
  assert.doesNotMatch(bookings, /\(loading \|\| !!result\?\.rows\.length\) &&/);
  assert.doesNotMatch(bookings, /LoadingAnimation/);
  assert.match(source("app/admin/finance/loading.tsx"), /<ReportStats\s*\/>/);
  const finance = source("app/admin/finance/finance.tsx");
  assert.match(finance, /loading \? <ReportStats\s*\/>/);
  assert.match(finance, /<thead[^\n]+<tbody aria-busy=\{listLoading\}[^\n]+Loading expenses/);
  assert.match(finance, /useDashboardResource<Expenses>/);
  assert.match(source("app/admin/finance/cash-activity.tsx"), /useDashboardResource<CashReport>/);
  assert.match(source("app/admin/finance/sales.tsx"), /useDashboardResource<Sale\[\]>/);
  const stats = source("app/admin/finance/report-stats.tsx");
  for (const label of ["Booking Revenue", "Expenses", "Net Profit", "Booking Count"]) {
    assert.match(stats, new RegExp(`label: "${label}", value: report \\? [^\n]+: placeholder`));
  }
});
