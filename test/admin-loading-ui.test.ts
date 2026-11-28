import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("legacy booking detail links open the bookings list modal", () => {
  const legacy = source("app/admin/bookings/[id]/page.tsx");
  const bookings = source("app/admin/bookings/bookings-view.tsx");
  assert.match(legacy, /redirect\(`\/admin\/bookings\?booking=\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(bookings, /const linkedBooking = useSearchParams\(\)\.get\("booking"\)/);
  assert.match(bookings, /const selected = selectedRow \?\? linkedBooking/);
  assert.match(bookings, /<BookingDetail key=\{selected\} id=\{selected\}/);
  assert.match(bookings, /url\.searchParams\.delete\("booking"\)/);
});

test("booking menu offers payment decisions and confirms permanent deletion with a reason", () => {
  const bookings = source("app/admin/bookings/bookings-view.tsx");
  assert.doesNotMatch(bookings, /window\.prompt\(|> Complete</);
  assert.match(bookings, /openBooking\(row\.id, "approve"\)/);
  assert.match(bookings, /openBooking\(row\.id, "reject"\)/);
  assert.match(bookings, /disabled=\{!row.canRefund\}/);
  assert.match(bookings, /onDelete=\{\(\) => reviewDelete\(selected\)\}/);
  assert.match(bookings, /reviewDelete\(row\.id\)/);
  assert.match(bookings, /<Dialog open=\{change !== null\}/);
  assert.match(bookings, /<Textarea required maxLength=\{500\}/);
  assert.match(bookings, /onSubmit=\{event => \{\s*event\.preventDefault\(\);\s*if \(change\) void deleteBooking\(change\)/);
});

test("bookings and finance keep labels visible while loading values", () => {
  const bookings = source("app/admin/bookings/bookings-view.tsx");
  const table = source("components/admin/results-table.tsx");
  assert.match(table, /<div role="region" aria-label=\{label\} tabIndex=\{0\} className="overflow-x-auto[^"]*">\s*<table/);
  assert.match(table, /<thead[^\n]+scope="col"[^\n]+\s*<tbody[^\n]+aria-busy=\{loading\}>\s*\{loading \? [^\n]+<Skeleton/);
  assert.match(bookings, /<ResultsTable label="Booking results table"[^\n]+loading=\{loading\}/);
  assert.doesNotMatch(bookings, /\(loading \|\| !!result\?\.rows\.length\) &&/);
  assert.doesNotMatch(bookings, /LoadingAnimation/);
  assert.match(source("app/admin/finance/loading.tsx"), /<ReportStats\s*\/>/);
  const finance = source("app/admin/finance/finance.tsx");
  assert.match(finance, /loading \? <ReportStats\s*\/>/);
  assert.match(finance, /<ResultsTable label="Expense results table"[^\n]+Loading expenses[^\n]+loading=\{listLoading\}/);
  assert.match(finance, /useDashboardResource<Expenses>/);
  assert.match(source("app/admin/finance/cash-activity.tsx"), /useDashboardResource<CashReport>/);
  const sales = source("app/admin/finance/sales.tsx");
  assert.match(sales, /useDashboardResource<\{ rows: Sale\[\]; page: number; limit: number; total: number \}>/);
  assert.match(sales, /<ResultsTable label="Sales results table"[^\n]+Loading sales[^\n]+loading=\{loading\}/);
  const stats = source("app/admin/finance/report-stats.tsx");
  for (const label of ["Booking Revenue", "Expenses", "Net Profit", "Booking Count"]) {
    assert.match(stats, new RegExp(`label: "${label}", value: report \\? [^\n]+: placeholder`));
  }
});
