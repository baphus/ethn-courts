// Run with: node --import ./test/register-loader.mjs --import tsx --test test/admin-table-pager.test.tsx
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TablePager } from "../src/components/admin/table-pager";

const render = (page: number, total: number) => renderToStaticMarkup(createElement(TablePager, {
  page, total, pageSize: 20, onPageChange() {},
}));

test("numbered pagination shows the correct range and identifies the current page", () => {
  const result = render(3, 126);
  assert.match(result, /41–60 of 126/);
  assert.match(result, /<button\b[^>]*aria-current="page"[^>]*>3<\/button>/);
  for (const label of ["Previous", "1", "2", "4", "7", "Next"]) assert.match(result, new RegExp(`>${label}</button>`));
});

test("pagination disables navigation beyond the last searchable page", () => {
  const result = render(1000, 24_000);
  assert.match(result, /19981–20000 of 24000/);
  assert.match(result, /<button\b[^>]*disabled=""[^>]*>Next<\/button>/);
  assert.doesNotMatch(result, />1200<\/button>/);
});
