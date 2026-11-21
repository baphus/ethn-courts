# Finance UI export — 2026-11-21

- XLSX exports loaded report daily aggregates and totals for applied dates. Values remain strings; report scope excludes manual sales and extensions. No expense titles, customer details or payment references are exported.
- `write-excel-file` 4.1.1 is declared in package.json and package-lock.json and resolves from the project root to `node_modules/write-excel-file/browser/index.cjs`.
- Pending expense retry remains session-persisted. UI warns to retry only under the same account; actor identity is not verified by this UI. Expense titles may contain personal information and remain in session storage until resolved or discarded.
- `node --test --import ./test/register-loader.mjs test/finance-ui-export.test.ts`: passed (1 test).
- `npx --no-install tsc --noEmit`: passed after fixing initial JSX syntax error.
- Browser, actual downloaded workbook, full test suite and build not checked in this task.
